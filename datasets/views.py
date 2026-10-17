import json
import logging
import os
from datetime import datetime

from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.http import FileResponse, JsonResponse
from django.shortcuts import get_object_or_404, render
from django.utils.text import get_valid_filename
from django.db.models import Count
from django.views.decorators.http import require_GET, require_http_methods, require_POST
from django.utils import timezone
from .models import Dataset
from .services import (allowed_file, analyze_dataframe, clean_dataframe, delete_cache,
                       load_dataframe, read_dataframe, run_query, save_cache)

logger = logging.getLogger(__name__)


def _owned_dataset(request, dataset_id):
    """Return (dataset, None) or (None, 403 response). Missing id -> 404."""
    dataset = get_object_or_404(Dataset, pk=dataset_id)
    if dataset.owner_id != request.user.id:
        return None, JsonResponse({'error': 'Unauthorized'}, status=403)
    return dataset, None


@login_required
def dashboard(request):
    recent = request.user.datasets.annotate(n_charts=Count('charts'))[:5]
    recent_activity = [
        {
            'icon': '📊',
            'name': d.original_filename,
            'text': f'Uploaded "{d.original_filename}"',
                        'time': timezone.localtime(d.upload_date).strftime('%B %d, %Y at %I:%M %p'),
            'id': d.id,
            'rows': d.rows,
            'columns': d.columns,
            'charts': d.n_charts,
        }
        for d in recent
    ]
    return render(request, 'dashboard.html', {'recent_activity': recent_activity})


@login_required
@require_POST
def upload_file(request):
    try:
        file = request.FILES.get('file')
        if not file or not file.name:
            return JsonResponse({'success': False, 'error': 'No file selected'}, status=400)
        if not allowed_file(file.name):
            return JsonResponse({'success': False,
                                 'error': 'Invalid file type. Please upload CSV or Excel files.'}, status=400)
        if file.size > settings.MAX_UPLOAD_SIZE:
            return JsonResponse({'success': False, 'error': 'File size exceeds 16MB limit.'}, status=413)

        filename = get_valid_filename(os.path.basename(file.name))
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        unique_filename = f'{request.user.id}_{timestamp}_{filename}'
        os.makedirs(settings.UPLOAD_ROOT, exist_ok=True)
        filepath = os.path.join(settings.UPLOAD_ROOT, unique_filename)

        with open(filepath, 'wb') as out:
            for chunk in file.chunks():
                out.write(chunk)

        ext = filename.rsplit('.', 1)[1].lower()
        try:
            df = read_dataframe(filepath, ext)
        except Exception as read_error:
            os.remove(filepath)
            logger.exception('Error reading uploaded file')
            return JsonResponse({'success': False, 'error': f'Error reading file: {read_error}'}, status=400)

        if df.empty:
            os.remove(filepath)
            return JsonResponse({'success': False, 'error': 'The uploaded file is empty'}, status=400)

        info = analyze_dataframe(df)
        dataset = Dataset.objects.create(
            owner=request.user,
            filename=unique_filename,
            original_filename=filename,
            file_size=os.path.getsize(filepath),
            **info,
        )
        try:
            save_cache(dataset,clean_dataframe(df))
        except Exception:
            logger.exception('Could not write cache for dataset %s',dataset.pk)
        return JsonResponse({'success': True, 'data': dataset.to_dict()})

    except Exception as e:
        logger.exception('Fatal error in upload_file')
        return JsonResponse({'success': False, 'error': f'Error processing file: {e}'}, status=500)


@login_required
@require_POST
def clean_dataset(request, dataset_id):
    """Rename and/or drop columns. Updates stored metadata only; the raw file
    on disk stays untouched, so Download still gives the original."""
    dataset, error = _owned_dataset(request, dataset_id)
    if error:
        return error
    try:
        data = json.loads(request.body or '{}')
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Invalid JSON'}, status=400)

    try:
        rename_map = data.get('rename', {})   # {old_name: new_name}
        drop_cols = set(data.get('drop', []))

        columns = dataset.column_names
        data_types = dataset.data_types
        preview = dataset.preview_data
        stats = dataset.column_stats or {}

        def final_name(col):
            return (rename_map.get(col, col) or col).strip() or col

        kept = [c for c in columns if c not in drop_cols]
        new_columns = [final_name(c) for c in kept]

        if not new_columns:
            return JsonResponse({'success': False, 'error': 'Cannot drop every column'}, status=400)
        if len(new_columns) != len(set(new_columns)):
            return JsonResponse({'success': False,
                                 'error': 'Column names must be unique after rename'}, status=400)
        
        try:
            df = load_dataframe(dataset)
            df = df[kept]
            df.columns = new_columns
            save_cache(dataset, df)
        except Exception:
            logger.exception('Cache update failed for dataset %s', dataset.pk)
            delete_cache(dataset)
            
        dataset.column_names = new_columns
        dataset.data_types = {final_name(c): data_types.get(c) for c in kept}
        dataset.preview_data = [{final_name(c): row.get(c, '') for c in kept} for row in preview]
        dataset.column_stats = {final_name(c): stats[c] for c in kept if c in stats}
        dataset.columns = len(new_columns)
        dataset.save()

        return JsonResponse({'success': True, 'data': dataset.to_dict()})
    except Exception as e:
        logger.exception('Error cleaning dataset')
        return JsonResponse({'success': False, 'error': f'Error cleaning dataset: {e}'}, status=500)


@login_required
@require_GET
def download_dataset(request, dataset_id):
    dataset, error = _owned_dataset(request, dataset_id)
    if error:
        return error
    filepath = os.path.join(settings.UPLOAD_ROOT, dataset.filename)
    if not os.path.exists(filepath):
        return JsonResponse({'error': 'File not found'}, status=404)
    return FileResponse(open(filepath, 'rb'), as_attachment=True,
                        filename=dataset.original_filename,
                        content_type='application/octet-stream')


@login_required
@require_GET
def get_dataset_columns(request, dataset_id):
    dataset, error = _owned_dataset(request, dataset_id)
    if error:
        return error
    return JsonResponse({
        'success': True,
        'columns': dataset.column_names,
        'dataset_name': dataset.original_filename,
    })

@login_required
@require_POST
def dataset_data(request, dataset_id):
    """Aggregated data for the chart builder. Never returns raw full data."""
    dataset, error = _owned_dataset(request, dataset_id)
    if error:
        return error
    try:
        spec = json.loads(request.body or '{}')
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Invalid JSON'}, status=400)
    try:
        result = run_query(load_dataframe(dataset), spec)
    except ValueError as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)
    except FileNotFoundError:
        return JsonResponse({'success': False, 'error': 'Dataset file is missing'}, status=404)
    except Exception as e:
        logger.exception('Error querying dataset %s', dataset_id)
        return JsonResponse({'success': False, 'error': f'Error querying data: {e}'}, status=500)
    return JsonResponse({'success': True, **result})



@login_required
@require_GET
def get_dataset(request, dataset_id):
    dataset, error = _owned_dataset(request, dataset_id)
    if error:
        return error 
    return JsonResponse({'success': True, 'data': dataset.to_dict()})


@login_required
@require_http_methods(['DELETE'])
def delete_dataset(request, dataset_id):
    """Deletes the dataset, its saved charts (cascade) and its files (signal)."""
    dataset, error = _owned_dataset(request, dataset_id)
    if error:
        return error
    charts_deleted = dataset.charts.count()
    dataset.delete()
    return JsonResponse({'success': True, 'charts_deleted': charts_deleted,
                         'message': 'Dataset deleted successfully!'})