cd E:\fluxion_django
function Swap($path, $old, $new) {
    $full = (Resolve-Path $path).Path
    $text = [System.IO.File]::ReadAllText($full)
    $nl = if ($text.Contains("`r`n")) { "`r`n" } else { "`n" }
    $old = $old -replace "`r?`n", $nl
    $new = $new -replace "`r?`n", $nl
    if ($text.Contains($new)) { "SKIP  $path  (already applied)"; return }
    $n = ([regex]::Matches($text, [regex]::Escape($old))).Count
    if ($n -ne 1) { $head = $old.Substring(0, [Math]::Min(45, $old.Length)).Trim(); "SKIP  $path  (matches: $n)  $head"; return }
    [System.IO.File]::WriteAllText($full, $text.Replace($old, $new), (New-Object System.Text.UTF8Encoding($false)))
    "OK    $path"
}
function Rx($path, $pattern, $replacement, $marker) {
    $full = (Resolve-Path $path).Path
    $text = [System.IO.File]::ReadAllText($full)
    $nl = if ($text.Contains("`r`n")) { "`r`n" } else { "`n" }
    $replacement = $replacement -replace "`r?`n", $nl
    if ($text.Contains($marker)) { "SKIP  $path  (already applied)"; return }
    $n = [regex]::Matches($text, $pattern).Count
    if ($n -ne 1) { "SKIP  $path  (matches: $n)  regex"; return }
    [System.IO.File]::WriteAllText($full, [regex]::Replace($text, $pattern, $replacement.Replace('$', '$$')), (New-Object System.Text.UTF8Encoding($false)))
    "OK    $path"
}
Swap 'charts\registry.py' @'
    ('kpi', 'KPI Card', True),
    ('multi_card', 'Multi-Row Card', True),
    ('progress', 'Progress Bar', True),
    ('gauge', 'Gauge', True),
    ('sparkline', 'Sparkline', True),
    ('text', 'Text', True),
'@ @'
    ('gauge', 'Gauge', True),
    ('sparkline', 'Sparkline', True),
'@
Swap 'charts\queries.py' @'
               'dual_line', 'density', 'gantt', 'kpi', 'multi_card', 'progress', 'gauge', 'sparkline', 'text'}
'@ @'
               'dual_line', 'density', 'gantt', 'gauge', 'sparkline'}
'@
Rx 'charts\queries.py' @'
(?s)# ---------- Phase 20: widgets ----------.*\z
'@ @'
# ---------- Phase 20: widgets (gauge, sparkline) ----------
WIDGET_TYPES = {'gauge', 'sparkline'}
WIDGET_AGGS = ('sum', 'avg', 'count', 'min', 'max')
WIDGET_BUCKETS = ('none', 'day', 'week', 'month', 'quarter', 'year')


def _finite(value):
    """Finite number from a number or numeric text, else None."""
    if value is None or isinstance(value, bool):
        return None
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    return n if n == n and abs(n) <= 1e15 else None   # drops NaN, inf and huge values


def widget_config(data):
    """Whitelist of the extra settings a gauge / sparkline saves in Chart.config. Bad values are dropped."""
    out = {}
    if data.get('agg') in WIDGET_AGGS:
        out['agg'] = data['agg']
    if data.get('bucket') in WIDGET_BUCKETS:
        out['bucket'] = data['bucket']
    for key in ('gauge_min', 'gauge_max'):
        n = _finite(data.get(key))
        if n is not None:
            out[key] = n
    return out


def _widget_spec(chart_type, config, x, ys):
    agg = config.get('agg') if config.get('agg') in WIDGET_AGGS else 'sum'
    bucket = config.get('bucket') if config.get('bucket') in WIDGET_BUCKETS else 'none'
    if not ys:
        raise ValueError('Chart config is incomplete')
    if chart_type == 'sparkline':
        if not x:
            raise ValueError('Chart config is incomplete')
        return {'x': x, 'series': [{'column': ys[0], 'agg': agg}], 'date_bucket': bucket, 'sort': 'x_asc'}
    return {'shape': 'gauge', 'series': [{'column': ys[0]}], 'agg': agg,
            'gauge_min': config.get('gauge_min'), 'gauge_max': config.get('gauge_max')}

'@ 'WIDGET_TYPES = {''gauge'', ''sparkline''}'
Swap 'datasets\services.py' @'
    if spec.get('shape') in ('kpi', 'multi_card', 'progress', 'gauge', 'text'):   # widgets: X is optional, so they run before the X check
'@ @'
    if spec.get('shape') == 'gauge':   # a gauge has no X, so it runs before the X check
'@
Swap 'static\js\create_chart.js' @'
    if (panel) panel.style.display = parts.length ? 'none' : '';
'@ @'
    if (panel) panel.style.display = FluxionTypes.noCustomise(selectedChartType) ? 'none' : '';
'@
Swap 'templates\create_chart.html' @'
                            <label class="opt-check" data-opt="zoom"><input type="checkbox" id="optZoom"> Zoom and pan</label>
'@ @'
                            <label class="opt-check" data-opt="zoom"><input type="checkbox" id="optZoom"> Zoom and pan</label>
                            <div data-opt="spark">
                                <label class="opt-check"><input type="checkbox" id="optSparkHeader"> Show value on top</label>
                                <label class="opt-check"><input type="checkbox" id="optSparkPoints"> Show points</label>
                                <label class="opt-check"><input type="checkbox" id="optSparkMinMax"> Mark highest and lowest</label>
                            </div>
'@
Swap 'static\js\chart_options.js' @'
    const SMOOTH = ['line', 'area', 'combo', 'stacked_area', 'dual_line', 'density'];
'@ @'
    const SMOOTH = ['line', 'area', 'combo', 'stacked_area', 'dual_line', 'density', 'sparkline'];
'@
Swap 'static\js\chart_options.js' @'
    const LABEL_NO = ['radar', 'stacked_area', 'dual_line', 'bubble', 'waterfall', 'funnel', 'pareto', 'bullet', 'density', 'gantt'];
'@ @'
    const LABEL_NO = ['radar', 'stacked_area', 'dual_line', 'bubble', 'waterfall', 'funnel', 'pareto', 'bullet', 'density', 'gantt', 'sparkline'];
'@
Swap 'static\js\chart_options.js' @'
    const LOG_NO = ['stacked', 'histogram', 'radar', 'pie', 'doughnut', 'stacked_area', 'dual_line', 'bubble', 'waterfall', 'funnel', 'pareto', 'bullet', 'density', 'gantt'];
'@ @'
    const LOG_NO = ['stacked', 'histogram', 'radar', 'pie', 'doughnut', 'stacked_area', 'dual_line', 'bubble', 'waterfall', 'funnel', 'pareto', 'bullet', 'density', 'gantt', 'sparkline'];
'@
Swap 'static\js\chart_options.js' @'
    const GRAD_OK = ['bar', 'hbar', 'combo', 'histogram', 'area', 'pareto'];
'@ @'
    const GRAD_OK = ['bar', 'hbar', 'combo', 'histogram', 'area', 'pareto', 'sparkline'];
'@
Swap 'static\js\chart_options.js' @'
        show('axes', !round && type !== 'radar');
'@ @'
        show('axes', !round && type !== 'radar' && type !== 'sparkline');
'@
Swap 'static\js\chart_options.js' @'
        show('grid', !round);
'@ @'
        show('grid', !round && type !== 'sparkline');
'@
Swap 'static\js\chart_options.js' @'
        show('zoom', ZOOM_OK.indexOf(type) !== -1);
'@ @'
        show('zoom', ZOOM_OK.indexOf(type) !== -1);
        show('spark', type === 'sparkline');
'@
Swap 'static\js\chart_options.js' @'
        $('optZoom').checked = state.zoom === true;
'@ @'
        $('optZoom').checked = state.zoom === true;
        $('optSparkHeader').checked = state.spark_header !== false;
        $('optSparkPoints').checked = state.spark_points === true;
        $('optSparkMinMax').checked = state.spark_minmax === true;
'@
Swap 'static\js\chart_options.js' @'
        flag('optZoom', 'zoom');
'@ @'
        flag('optZoom', 'zoom');
        flag('optSparkPoints', 'spark_points');
        flag('optSparkMinMax', 'spark_minmax');
'@
Swap 'static\js\chart_options.js' @'
        unflag('optAnimate', 'animate');
'@ @'
        unflag('optAnimate', 'animate');
        unflag('optSparkHeader', 'spark_header');
'@
Swap 'charts\options.py' @'
                'log_scale', 'gradient', 'animate', 'second_axis', 'center_total', 'insight', 'zoom'):
'@ @'
                'log_scale', 'gradient', 'animate', 'second_axis', 'center_total', 'insight', 'zoom',
                'spark_points', 'spark_minmax', 'spark_header'):
'@
Swap 'tools\test_registry.py' @'
WIDGETS = ['kpi', 'multi_card', 'progress', 'gauge', 'sparkline', 'text']
'@ @'
WIDGETS = ['gauge', 'sparkline']
'@
Rx 'tools\test_routes.py' @'
(?s)\r?\n        # ---- Phase 20: widgets ----.*?check\('dataset-data widget value'[^\r\n]*
'@ @'

        # ---- Phase 20: widgets (gauge, sparkline) ----
        W20 = {
            'gauge': dict(y_axes=['sales'], agg='max', gauge_min=0, gauge_max=60),
            'sparkline': dict(x_axis='name', y_axes=['sales'], agg='sum', bucket='none'),
        }
        w20 = {}
        for t20, cfg20 in W20.items():
            tid20, st20 = p11_save(t20, **cfg20)
            w20[t20] = tid20
            check(f'save-chart {t20}', st20, 200)
            check(f'chart-data {t20}', A.get(f'/chart-data/{tid20}').status_code, 200)
        check('gauge pct', p11_data(w20['gauge']).get('meta', {}).get('pct'), 50.0)
        check('sparkline labels', p11_data(w20['sparkline']).get('labels'), [['a', 'b', 'c']])
        check('widget settings saved', js(A.get(f'/get-chart/{w20["gauge"]}')).get('chart', {}).get('config', {}).get('gauge_max'), 60)
        tid20, _ = p11_save('gauge', y_axes=['sales'], agg='sum')
        check('gauge without max is 400', A.get(f'/chart-data/{tid20}').status_code, 400)
        tid20, _ = p11_save('sparkline', x_axis='name', y_axes=['sales'], agg='median', bucket='none')
        check('widget bad agg dropped on save', 'agg' in js(A.get(f'/get-chart/{tid20}')).get('chart', {}).get('config', {}), False)
        r = jpost(A, f'/dataset-data/{ds}', {'chart_type': 'gauge', 'config': {'y_axes': ['sales'], 'agg': 'max', 'gauge_max': 60}})
        check('dataset-data widget preview', r.status_code, 200)
        check('dataset-data widget value', js(r).get('meta', {}).get('value'), 30)
'@ 'Phase 20: widgets (gauge, sparkline)'
Swap 'templates\about.html' @'
data-count="26">26</span>
'@ @'
data-count="22">22</span>
'@
Swap 'templates\about.html' @'
<p>26 chart types and widgets, plus options
'@ @'
<p>22 chart types and widgets, plus options
'@
Swap 'templates\about.html' @'
histogram, stacked area, dual-axis line, bubble, waterfall, funnel, Pareto, bullet, density, Gantt, KPI card, multi-row card, progress bar, gauge, sparkline, text"
'@ @'
histogram, stacked area, dual-axis line, bubble, waterfall, funnel, Pareto, bullet, density, Gantt, gauge, sparkline"
'@
Swap 'templates\about.html' @'
            <span class="ab-chip">Bar</span><span class="ab-chip">Line</span><span class="ab-chip">Pie</span><span class="ab-chip">Scatter</span><span class="ab-chip">Horizontal bar</span><span class="ab-chip">Area</span><span class="ab-chip">Doughnut</span><span class="ab-chip">Radar</span><span class="ab-chip">Stacked bar</span><span class="ab-chip">Combo</span><span class="ab-chip">Histogram</span><span class="ab-chip">Stacked area</span><span class="ab-chip">Dual-axis line</span><span class="ab-chip">Bubble</span><span class="ab-chip">Waterfall</span><span class="ab-chip">Funnel</span><span class="ab-chip">Pareto</span><span class="ab-chip">Bullet</span><span class="ab-chip">Density</span><span class="ab-chip">Gantt</span><span class="ab-chip">KPI card</span><span class="ab-chip">Multi-row card</span><span class="ab-chip">Progress bar</span><span class="ab-chip">Gauge</span><span class="ab-chip">Sparkline</span><span class="ab-chip">Text</span>
            <span class="ab-chip">Bar</span><span class="ab-chip">Line</span><span class="ab-chip">Pie</span><span class="ab-chip">Scatter</span><span class="ab-chip">Horizontal bar</span><span class="ab-chip">Area</span><span class="ab-chip">Doughnut</span><span class="ab-chip">Radar</span><span class="ab-chip">Stacked bar</span><span class="ab-chip">Combo</span><span class="ab-chip">Histogram</span><span class="ab-chip">Stacked area</span><span class="ab-chip">Dual-axis line</span><span class="ab-chip">Bubble</span><span class="ab-chip">Waterfall</span><span class="ab-chip">Funnel</span><span class="ab-chip">Pareto</span><span class="ab-chip">Bullet</span><span class="ab-chip">Density</span><span class="ab-chip">Gantt</span><span class="ab-chip">KPI card</span><span class="ab-chip">Multi-row card</span><span class="ab-chip">Progress bar</span><span class="ab-chip">Gauge</span><span class="ab-chip">Sparkline</span><span class="ab-chip">Text</span>
'@ @'
            <span class="ab-chip">Bar</span><span class="ab-chip">Line</span><span class="ab-chip">Pie</span><span class="ab-chip">Scatter</span><span class="ab-chip">Horizontal bar</span><span class="ab-chip">Area</span><span class="ab-chip">Doughnut</span><span class="ab-chip">Radar</span><span class="ab-chip">Stacked bar</span><span class="ab-chip">Combo</span><span class="ab-chip">Histogram</span><span class="ab-chip">Stacked area</span><span class="ab-chip">Dual-axis line</span><span class="ab-chip">Bubble</span><span class="ab-chip">Waterfall</span><span class="ab-chip">Funnel</span><span class="ab-chip">Pareto</span><span class="ab-chip">Bullet</span><span class="ab-chip">Density</span><span class="ab-chip">Gantt</span><span class="ab-chip">Gauge</span><span class="ab-chip">Sparkline</span>
            <span class="ab-chip">Bar</span><span class="ab-chip">Line</span><span class="ab-chip">Pie</span><span class="ab-chip">Scatter</span><span class="ab-chip">Horizontal bar</span><span class="ab-chip">Area</span><span class="ab-chip">Doughnut</span><span class="ab-chip">Radar</span><span class="ab-chip">Stacked bar</span><span class="ab-chip">Combo</span><span class="ab-chip">Histogram</span><span class="ab-chip">Stacked area</span><span class="ab-chip">Dual-axis line</span><span class="ab-chip">Bubble</span><span class="ab-chip">Waterfall</span><span class="ab-chip">Funnel</span><span class="ab-chip">Pareto</span><span class="ab-chip">Bullet</span><span class="ab-chip">Density</span><span class="ab-chip">Gantt</span><span class="ab-chip">Gauge</span><span class="ab-chip">Sparkline</span>
'@
Swap 'templates\faq.html' @'
Pick one of 26 chart types and widgets (bar, line, pie, scatter, horizontal bar, area, doughnut, radar, stacked bar, combo, histogram, stacked area, dual-axis line, bubble, waterfall, funnel, Pareto, bullet, density, Gantt, KPI card, multi-row card, progress bar, gauge, sparkline or text)
'@ @'
Pick one of 22 chart types and widgets (bar, line, pie, scatter, horizontal bar, area, doughnut, radar, stacked bar, combo, histogram, stacked area, dual-axis line, bubble, waterfall, funnel, Pareto, bullet, density, Gantt, gauge or sparkline)
'@
Swap 'templates\landing.html' @'
. 26 chart types and widgets, live data,
'@ @'
. 22 chart types and widgets, live data,
'@
Swap 'templates\landing.html' @'
>26 chart types and widgets, fully customisable</li>
'@ @'
>22 chart types and widgets, fully customisable</li>
'@
Swap 'templates\landing.html' @'
<h3>26 chart types</h3>
'@ @'
<h3>22 chart types</h3>
'@