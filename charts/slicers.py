"""Board slicers (Phase 23): which columns a board offers as filters, and the values to show for them."""
from datasets.filters import MAX_OPTION_VALUES, column_options
from datasets.services import load_dataframe

MAX_SLICERS = 3
MAX_COLUMN_NAME = 100


def clean_slicers(raw):
    """List of unique column names, at most MAX_SLICERS. Anything else is dropped."""
    if not isinstance(raw, list):
        return []
    out = []
    for item in raw:
        if isinstance(item, str):
            name = item.strip()
            if name and len(name) <= MAX_COLUMN_NAME and name not in out:
                out.append(name)
        if len(out) >= MAX_SLICERS:
            break
    return out


def board_slicer_options(board):
    """Options for each slicer column, merged over the datasets of the board's charts.
    A column no dataset has is left out."""
    from .models import Chart   # late import: models.py imports board_models.py
    ids = [i.get('chart_id') for i in board.items]
    charts = Chart.objects.filter(owner_id=board.owner_id, id__in=ids).select_related('dataset')
    frames = {}
    for chart in charts:
        if chart.dataset_id in frames:
            continue
        try:
            frames[chart.dataset_id] = load_dataframe(chart.dataset)
        except Exception:
            continue   # dataset file missing: its charts show their own error
    out = []
    for col in board.slicers or []:
        merged = None
        for df in frames.values():
            if col not in df.columns:
                continue
            opt = column_options(df, col)
            if merged is None:
                merged = opt
            elif merged['type'] == opt['type'] == 'text':
                values = sorted(set(merged['values']) | set(opt['values']))
                merged = {'type': 'text', 'values': values[:MAX_OPTION_VALUES],
                          'more': merged['more'] or opt['more'] or len(values) > MAX_OPTION_VALUES}
            elif merged['type'] == opt['type'] == 'number':
                merged = {'type': 'number', 'min': min(merged['min'], opt['min']), 'max': max(merged['max'], opt['max'])}
        if merged is not None:
            merged['column'] = col
            out.append(merged)
    return out