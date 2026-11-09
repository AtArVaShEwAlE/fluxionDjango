def clean_y_axes(value):
    """List of unique, non-empty column names (order kept). Anything else -> []."""
    if not isinstance(value, list):
        return []
    cols = []
    for item in value:
        if isinstance(item, str) and item and item not in cols:
            cols.append(item)
    return cols

def spec_from_chart(chart_type, config):
    """Saved-chart config -> query spec. Old configs (only y_axis) keep rendering."""
    config = config or {}
    if chart_type in SHAPE_TYPES:
        return _shape_spec(chart_type, config)
    if chart_type == 'histogram':   # one numeric column, no Y
        x = config.get('x_axis')
        if not x:
            raise ValueError('Chart config is incomplete')
        return {'x': x, 'histogram': True}
    if chart_type in ('pie', 'doughnut'):
        x, y = config.get('label_column'), config.get('value_column')
        ys = [y] if y else []
    else:
        x = config.get('x_axis')
        ys = clean_y_axes(config.get('y_axes'))
        if not ys and config.get('y_axis'):
            ys = [config['y_axis']]
    if not x or not ys:
        raise ValueError('Chart config is incomplete')
    if chart_type == 'scatter':
        return {'x': x, 'series': [{'column': ys[0]}], 'raw': True}
    return {'x': x, 'series': [{'column': c, 'agg': 'sum'} for c in ys], 'sort': 'none'}


SHAPE_TYPES = {'stacked_area', 'bubble', 'waterfall', 'funnel', 'pareto', 'bullet',
               'dual_line', 'density', 'gantt'}
NEEDS_TWO = {'bubble', 'bullet', 'dual_line', 'gantt'}


def _shape_spec(chart_type, config):
    """Phase 19 types. bubble: Y + size. bullet: actual + target. gantt: start + end."""
    x = config.get('x_axis')
    ys = clean_y_axes(config.get('y_axes'))
    if not ys and config.get('y_axis'):
        ys = [config['y_axis']]
    if not x:
        raise ValueError('Chart config is incomplete')
    if chart_type == 'density':
        return {'x': x, 'shape': 'density'}
    if len(ys) < (2 if chart_type in NEEDS_TWO else 1):
        raise ValueError('Chart config is incomplete')
    if chart_type == 'stacked_area':
        return {'x': x, 'series': [{'column': c, 'agg': 'sum'} for c in ys], 'sort': 'none'}
    if chart_type in ('bullet', 'dual_line'):
        return {'x': x, 'series': [{'column': c, 'agg': 'sum'} for c in ys[:2]], 'sort': 'none'}
    if chart_type == 'funnel':
        return {'x': x, 'series': [{'column': ys[0], 'agg': 'sum'}], 'sort': 'value_desc'}
    if chart_type in ('waterfall', 'pareto'):
        return {'x': x, 'series': [{'column': ys[0], 'agg': 'sum'}], 'shape': chart_type}
    return {'x': x, 'series': [{'column': c} for c in ys[:2]], 'shape': chart_type}   # bubble, gantt