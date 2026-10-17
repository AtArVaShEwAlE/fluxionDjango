def spec_from_chart(chart_type, config):
    """Old saved-chart config -> query spec. Keeps old charts rendering."""
    config = config or {}
    if chart_type in ('pie', 'doughnut'):
        x, y = config.get('label_column'), config.get('value_column')
    else:
        x, y = config.get('x_axis'), config.get('y_axis')
    if not x or not y:
        raise ValueError('Chart config is incomplete')
    if chart_type == 'scatter':
        return {'x': x, 'series': [{'column': y}], 'raw': True}
    return {'x': x, 'series': [{'column': y, 'agg': 'sum'}], 'sort': 'none'}