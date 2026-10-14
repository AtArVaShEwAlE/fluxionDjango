import json
import logging

from django.contrib.auth.decorators import login_required
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, render
from django.views.decorators.http import require_GET, require_http_methods, require_POST
from django.urls import reverse
from django.views.decorators.clickjacking import xframe_options_exempt
from datasets.models import Dataset
from .models import Chart, Report
from .models import Chart

logger = logging.getLogger(__name__)

VALID_TYPES = {'bar', 'line', 'pie', 'scatter'}


def _json_body(request):
    try:
        return json.loads(request.body or '{}'), None
    except json.JSONDecodeError:
        return None, JsonResponse({'success': False, 'error': 'Invalid JSON'}, status=400)


def _owned_chart(request, chart_id):
    chart = get_object_or_404(Chart, pk=chart_id)
    if chart.owner_id != request.user.id:
        return None, JsonResponse({'error': 'Unauthorized'}, status=403)
    return chart, None


def _build_config(data):
    return {
        'x_axis': data.get('x_axis'),
        'y_axis': data.get('y_axis'),
        'value_column': data.get('value_column'),
        'label_column': data.get('label_column'),
        'color_scheme': data.get('color_scheme', 'default'),
        'chart_options': data.get('chart_options', {}),
    }


# ---------- Pages ----------

@login_required
def create_chart(request):
    return render(request, 'create_chart.html')


@login_required
def charts(request):
    user_charts = request.user.charts.all()   # Meta ordering = newest first
    return render(request, 'charts.html', {'charts': user_charts})


@login_required
def stub(request):
    return HttpResponse('placeholder (real page in a later step)')


# ---------- JSON endpoints ----------

@login_required
@require_POST
def save_chart(request):
    data, error = _json_body(request)
    if error:
        return error
    try:
        chart_type = data.get('chart_type', 'bar')
        if chart_type not in VALID_TYPES:
            return JsonResponse({'success': False, 'error': 'Invalid chart type'}, status=400)

        # Ownership check: dataset must belong to the current user
        dataset = Dataset.objects.filter(pk=data.get('dataset_id'), owner=request.user).first()
        if dataset is None:
            return JsonResponse({'success': False, 'error': 'Dataset not found'}, status=400)

        chart = Chart.objects.create(
            owner=request.user,
            dataset=dataset,
            title=data.get('title') or 'Untitled Chart',
            chart_type=chart_type,
            config=_build_config(data),
        )
        return JsonResponse({'success': True, 'chart_id': chart.id,
                             'message': 'Chart saved successfully!'})
    except Exception as e:
        logger.exception('Error saving chart')
        return JsonResponse({'success': False, 'error': f'Error saving chart: {e}'}, status=500)


@login_required
@require_http_methods(['PUT'])
def update_chart(request, chart_id):
    """Update in place (Edit Chart flow). Does not create a new row."""
    chart, error = _owned_chart(request, chart_id)
    if error:
        return error
    data, error = _json_body(request)
    if error:
        return error
    try:
        chart_type = data.get('chart_type', chart.chart_type)
        if chart_type not in VALID_TYPES:
            return JsonResponse({'success': False, 'error': 'Invalid chart type'}, status=400)

        chart.title = data.get('title', chart.title)
        chart.chart_type = chart_type
        chart.config = _build_config(data)
        chart.save()
        return JsonResponse({'success': True, 'chart_id': chart.id,
                             'message': 'Chart updated successfully!'})
    except Exception as e:
        logger.exception('Error updating chart')
        return JsonResponse({'success': False, 'error': f'Error updating chart: {e}'}, status=500)


@login_required
@require_http_methods(['DELETE'])
def delete_chart(request, chart_id):
    chart, error = _owned_chart(request, chart_id)
    if error:
        return error
    chart.delete()
    return JsonResponse({'success': True, 'message': 'Chart deleted successfully!'})


@login_required
@require_GET
def get_chart(request, chart_id):
    chart, error = _owned_chart(request, chart_id)
    if error:
        return error
    return JsonResponse({'success': True, 'chart': chart.to_dict()})

# ---------- Sharing ----------

@login_required
@require_POST
def share_chart(request, chart_id):
    chart, error = _owned_chart(request, chart_id)
    if error:
        return error
    if not chart.share_token:
        chart.generate_share_token()
    chart.is_public = True
    chart.save()
    share_url = request.build_absolute_uri(reverse('shared_chart', args=[chart.share_token]))
    return JsonResponse({'success': True, 'share_url': share_url,
                         'share_token': chart.share_token})


@login_required
@require_POST
def unshare_chart(request, chart_id):
    chart, error = _owned_chart(request, chart_id)
    if error:
        return error
    chart.is_public = False
    chart.save()
    return JsonResponse({'success': True, 'message': 'Chart is now private'})


@xframe_options_exempt   # lets other sites embed this page in an <iframe>
def view_shared_chart(request, share_token):
    """Public page. No login required."""
    chart = (Chart.objects.select_related('dataset')
             .filter(share_token=share_token, is_public=True).first())
    if chart is None:
        return render(request, 'error.html', {
            'error': 'Chart not found or no longer shared',
            'message': 'This chart may have been made private or deleted.',
        }, status=404)
    return render(request, 'shared_chart.html', {'chart': chart.to_dict()})

# ---------- Reports ----------

def _owned_report(request, report_id):
    report = get_object_or_404(Report, pk=report_id)
    if report.owner_id != request.user.id:
        return None, JsonResponse({'error': 'Unauthorized'}, status=403)
    return report, None


@login_required
def reports(request):
    user_reports = request.user.reports.all()
    return render(request, 'reports.html',
                  {'reports': [r.to_dict() for r in user_reports]})


@login_required
def create_report(request):
    return render(request, 'create_report.html', {'charts': request.user.charts.all()})


@login_required
@require_POST
def save_report(request):
    data, error = _json_body(request)
    if error:
        return error
    try:
        chart_ids = data.get('chart_ids', [])
        title = (data.get('title') or 'Untitled Report').strip() or 'Untitled Report'

        if not chart_ids:
            return JsonResponse({'error': 'Select at least one chart for the report'}, status=400)
        try:
            chart_ids = [int(i) for i in chart_ids]
        except (TypeError, ValueError):
            return JsonResponse({'error': 'Invalid chart ids'}, status=400)

        # Every chart must belong to the current user
        owned_count = Chart.objects.filter(pk__in=chart_ids, owner=request.user).count()
        if owned_count != len(set(chart_ids)):
            return JsonResponse({'error': 'One or more selected charts are invalid'}, status=403)

        report = Report(owner=request.user, title=title)
        report.set_chart_ids(chart_ids)
        report.save()
        return JsonResponse({'success': True, 'report_id': report.id,
                             'message': 'Report saved successfully!'})
    except Exception as e:
        logger.exception('Error saving report')
        return JsonResponse({'error': f'Error saving report: {e}'}, status=500)


@login_required
@require_GET
def get_report(request, report_id):
    report, error = _owned_report(request, report_id)
    if error:
        return error
    return JsonResponse({'success': True, 'report': report.to_dict()})


@login_required
@require_http_methods(['DELETE'])
def delete_report(request, report_id):
    """Deletes the report only, never the underlying charts."""
    report, error = _owned_report(request, report_id)
    if error:
        return error
    report.delete()
    return JsonResponse({'success': True, 'message': 'Report deleted successfully!'})


@login_required
@require_POST
def share_report(request, report_id):
    report, error = _owned_report(request, report_id)
    if error:
        return error
    if not report.share_token:
        report.generate_share_token()
    report.is_public = True
    report.save()
    share_url = request.build_absolute_uri(reverse('shared_report', args=[report.share_token]))
    return JsonResponse({'success': True, 'share_url': share_url,
                         'share_token': report.share_token})


@login_required
@require_POST
def unshare_report(request, report_id):
    report, error = _owned_report(request, report_id)
    if error:
        return error
    report.is_public = False
    report.save()
    return JsonResponse({'success': True, 'message': 'Report is now private'})

@xframe_options_exempt
def view_shared_report(request, share_token):
    """Public page. No login required."""
    report = Report.objects.filter(share_token=share_token, is_public=True).first()
    if report is None:
        return render(request, 'error.html', {
            'error': 'Report not found or no longer shared',
            'message': 'This report may have been made private or deleted.',
        }, status=404)
    return render(request, 'shared_report.html', {'report': report.to_dict()})

@login_required
@require_GET
def export_chart_pdf(request, chart_id):
    chart, error = _owned_chart(request, chart_id)
    if error:
        return error
    return JsonResponse({
        'success': False,
        'message': 'PDF export is done client-side (jsPDF).',
    })