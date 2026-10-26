from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.shortcuts import render
from django.urls import reverse
from django.views.decorators.http import require_GET, require_POST

from .board_models import Dashboard
from .dashboards import _owned_board
from .models import Chart
from .views import _run_chart


def public_board_payload(board):
    """Only what the public page needs: no dataset info, no rows, no ids of the owner."""
    ids = [i.get('chart_id') for i in board.items]
    charts = {c.id: c for c in Chart.objects.filter(owner_id=board.owner_id, id__in=ids)}
    tiles = []
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
            'data_url': reverse('shared_board_chart_data', args=[board.share_token, chart.id]),
        })
    return {'title': board.title, 'refresh_seconds': board.refresh_seconds,
            'chart_count': len(tiles), 'tiles': tiles}


@login_required
@require_POST
def share_board(request, board_id):
    board, error = _owned_board(request, board_id)
    if error:
        return error
    if not board.share_token:
        board.generate_share_token()
    board.is_public = True
    board.save()
    share_url = request.build_absolute_uri(reverse('shared_board', args=[board.share_token]))
    return JsonResponse({'success': True, 'share_url': share_url,
                         'share_token': board.share_token})


@login_required
@require_POST
def unshare_board(request, board_id):
    board, error = _owned_board(request, board_id)
    if error:
        return error
    board.is_public = False
    board.save()
    return JsonResponse({'success': True, 'message': 'Board is now private'})


def view_shared_board(request, share_token):
    """Public page. No login. Not embeddable (no xframe exemption)."""
    board = Dashboard.objects.filter(share_token=share_token, is_public=True).first()
    if board is None:
        return render(request, 'error.html', {
            'error': 'Board not found or no longer shared',
            'message': 'This board may have been made private or deleted.',
        }, status=404)
    return render(request, 'shared_board.html', {'board': public_board_payload(board)})


@require_GET
def shared_board_chart_data(request, share_token, chart_id):
    """Public. Chart must be in this shared board; spec comes from the saved config only."""
    board = Dashboard.objects.filter(share_token=share_token, is_public=True).first()
    if board is None or chart_id not in [i.get('chart_id') for i in board.items]:
        return JsonResponse({'success': False, 'error': 'Not found'}, status=404)
    chart = (Chart.objects.select_related('dataset')
             .filter(pk=chart_id, owner_id=board.owner_id).first())
    if chart is None:
        return JsonResponse({'success': False, 'error': 'Not found'}, status=404)
    return _run_chart(chart)