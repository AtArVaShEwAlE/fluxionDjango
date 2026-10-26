import logging

from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, render
from django.urls import reverse
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from .board_models import BOARD_MAX_ITEMS, BOARD_REFRESH, BOARD_SIZES, Dashboard
from .models import Chart
from .views import _json_body

logger = logging.getLogger(__name__)

def clean_items(raw, owned_ids):
    """Validate board items. Returns (items, None) or (None, (message, status)).

    Dedupe by chart_id (first wins), size whitelist (bad -> 'm'),
    every chart must be in owned_ids, cap BOARD_MAX_ITEMS.
    """
    if not isinstance(raw, list) or not raw:
        return None, ('Select at least one chart for the board', 400)
    if len(raw) > BOARD_MAX_ITEMS:
        return None, (f'A board can hold at most {BOARD_MAX_ITEMS} charts', 400)
    items, seen = [], set()
    for entry in raw:
        if not isinstance(entry, dict):
            return None, ('Invalid items', 400)
        try:
            chart_id = int(entry.get('chart_id'))
        except (TypeError, ValueError):
            return None, ('Invalid chart ids', 400)
        if chart_id in seen:
            continue
        if chart_id not in owned_ids:
            return None, ('One or more selected charts are invalid', 403)
        size = entry.get('size')
        items.append({'chart_id': chart_id, 'size': size if size in BOARD_SIZES else 'm'})
        seen.add(chart_id)
    return items, None


def clean_refresh(raw):
    """Only values in BOARD_REFRESH survive, anything else -> 0 (manual)."""
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return 0
    return value if value in BOARD_REFRESH else 0


def clean_title(raw, default='Untitled Board'):
    title = raw.strip() if isinstance(raw, str) else ''
    return title[:255] or default


def _owned_chart_ids(user):
    return set(user.charts.values_list('pk', flat=True))


def _owned_board(request, board_id):
    board = get_object_or_404(Dashboard, pk=board_id)
    if board.owner_id != request.user.id:
        return None, JsonResponse({'error': 'Unauthorized'}, status=403)
    return board, None


# ---------- Pages ----------

@login_required
def boards(request):
    return render(request, 'boards.html',
                  {'boards': [b.to_dict() for b in request.user.dashboards.all()]})


@login_required
def create_board(request):
    return render(request, 'create_board.html',
                  {'charts': request.user.charts.all(), 'board_json': None})


@login_required
def edit_board(request, board_id):
    board = get_object_or_404(Dashboard, pk=board_id, owner=request.user)   # not yours = 404
    return render(request, 'create_board.html',
                  {'charts': request.user.charts.all(), 'board_json': board.to_dict()})


def board_payload(board, request):
    """Owner view data: board + one tile per chart that still exists, in saved order."""
    ids = [i.get('chart_id') for i in board.items]
    charts = {c.id: c for c in Chart.objects.filter(owner=board.owner, id__in=ids)}
    tiles = []
    share_url = ''
    if board.is_public and board.share_token:
        share_url = request.build_absolute_uri(reverse('shared_board', args=[board.share_token]))
    for item in board.items:
        chart = charts.get(item.get('chart_id'))
        if chart is None:
            continue   # deleted since the board was saved
        tiles.append({
            'chart_id': chart.id,
            'size': item.get('size', 'm'),
            'title': chart.title,
            'chart_type': chart.chart_type,
            'config': chart.config,
                'data_url': reverse('chart_data', args=[chart.id]),
        })
    return {'id': board.id, 'title': board.title,
            'refresh_seconds': board.refresh_seconds, 'tiles': tiles,
            'is_public': board.is_public, 'share_url': share_url}


@login_required
def view_board(request, board_id):
    board = get_object_or_404(Dashboard, pk=board_id, owner=request.user)   # not yours = 404
    return render(request, 'view_board.html', {'board_json': board_payload(board, request)})


# ---------- JSON endpoints ----------

@login_required
@require_POST
def save_board(request):
    data, error = _json_body(request)
    if error:
        return error
    items, problem = clean_items(data.get('items'), _owned_chart_ids(request.user))
    if problem:
        return JsonResponse({'success': False, 'error': problem[0]}, status=problem[1])
    try:
        board = Dashboard.objects.create(
            owner=request.user,
            title=clean_title(data.get('title')),
            items=items,
            refresh_seconds=clean_refresh(data.get('refresh_seconds')),
        )
    except Exception as e:
        logger.exception('Error saving board')
        return JsonResponse({'success': False, 'error': f'Error saving board: {e}'}, status=500)
    return JsonResponse({'success': True, 'board_id': board.id,
                         'message': 'Board saved successfully!'})


@login_required
@require_http_methods(['PUT'])
def update_board(request, board_id):
    """Keys absent from the body keep their old value."""
    board, error = _owned_board(request, board_id)
    if error:
        return error
    data, error = _json_body(request)
    if error:
        return error
    if 'items' in data:
        items, problem = clean_items(data['items'], _owned_chart_ids(request.user))
        if problem:
            return JsonResponse({'success': False, 'error': problem[0]}, status=problem[1])
        board.items = items
    if 'title' in data:
        board.title = clean_title(data['title'], default=board.title)
    if 'refresh_seconds' in data:
        board.refresh_seconds = clean_refresh(data['refresh_seconds'])
    board.save()
    return JsonResponse({'success': True, 'board_id': board.id,
                         'message': 'Board updated successfully!'})


@login_required
@require_GET
def get_board(request, board_id):
    board, error = _owned_board(request, board_id)
    if error:
        return error
    return JsonResponse({'success': True, 'board': board.to_dict()})


@login_required
@require_http_methods(['DELETE'])
def delete_board(request, board_id):
    """Deletes the board only, never the charts in it."""
    board, error = _owned_board(request, board_id)
    if error:
        return error
    board.delete()
    return JsonResponse({'success': True, 'message': 'Board deleted successfully!'})