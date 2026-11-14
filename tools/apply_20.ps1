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
    if ($text.Contains($marker)) { "SKIP  $path  (already applied)"; return }
    $n = [regex]::Matches($text, $pattern).Count
    if ($n -ne 1) { "SKIP  $path  (matches: $n)  regex"; return }
    [System.IO.File]::WriteAllText($full, [regex]::Replace($text, $pattern, $replacement), (New-Object System.Text.UTF8Encoding($false)))
    "OK    $path"
}
Swap 'charts\registry.py' @'
    ('gantt', 'Gantt', True),
'@ @'
    ('gantt', 'Gantt', True),
    # Phase 20 widgets
    ('kpi', 'KPI Card', True),
    ('multi_card', 'Multi-Row Card', True),
    ('progress', 'Progress Bar', True),
    ('gauge', 'Gauge', True),
    ('sparkline', 'Sparkline', True),
    ('text', 'Text', True),
'@
Swap 'charts\views.py' @'
from .queries import spec_from_chart, clean_y_axes
'@ @'
from .queries import spec_from_chart, clean_y_axes, widget_config
'@
Swap 'charts\views.py' @'
    y_axes = clean_y_axes(data.get('y_axes'))
    return {
'@ @'
    y_axes = clean_y_axes(data.get('y_axes'))
    return {
        **widget_config(data),
'@
Swap 'charts\queries.py' @'
               'dual_line', 'density', 'gantt'}
'@ @'
               'dual_line', 'density', 'gantt', 'kpi', 'multi_card', 'progress', 'gauge', 'sparkline', 'text'}
'@
Swap 'charts\queries.py' @'
    if not x:
        raise ValueError('Chart config is incomplete')
    if chart_type == 'density':
'@ @'
    if chart_type in WIDGET_TYPES:
        return _widget_spec(chart_type, config, x, ys)
    if not x:
        raise ValueError('Chart config is incomplete')
    if chart_type == 'density':
'@
Swap 'charts\queries.py' @'
    return {'x': x, 'series': [{'column': c} for c in ys[:2]], 'shape': chart_type}   # bubble, gantt
'@ @'
    return {'x': x, 'series': [{'column': c} for c in ys[:2]], 'shape': chart_type}   # bubble, gantt


# ---------- Phase 20: widgets ----------
WIDGET_TYPES = {'kpi', 'multi_card', 'progress', 'gauge', 'sparkline', 'text'}
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
    """Whitelist of the extra settings a widget saves in Chart.config. Bad values are dropped."""
    out = {}
    if data.get('agg') in WIDGET_AGGS:
        out['agg'] = data['agg']
    if data.get('bucket') in WIDGET_BUCKETS:
        out['bucket'] = data['bucket']
    for key in ('target', 'gauge_min', 'gauge_max'):
        n = _finite(data.get(key))
        if n is not None:
            out[key] = n
    for key, limit in (('text', 600), ('heading', 80)):
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            out[key] = value.strip()[:limit]
    return out


def _widget_spec(chart_type, config, x, ys):
    agg = config.get('agg') if config.get('agg') in WIDGET_AGGS else 'sum'
    bucket = config.get('bucket') if config.get('bucket') in WIDGET_BUCKETS else 'none'
    if chart_type == 'text':
        return {'shape': 'text', 'text': config.get('text') or '', 'heading': config.get('heading') or ''}
    if not ys:
        raise ValueError('Chart config is incomplete')
    if chart_type == 'sparkline':
        if not x:
            raise ValueError('Chart config is incomplete')
        return {'x': x, 'series': [{'column': ys[0], 'agg': agg}], 'date_bucket': bucket, 'sort': 'x_asc'}
    if chart_type == 'multi_card':
        return {'shape': 'multi_card', 'series': [{'column': c} for c in ys], 'agg': agg}
    spec = {'shape': chart_type, 'series': [{'column': ys[0]}], 'agg': agg}
    if chart_type == 'kpi':
        spec.update(x=x or None, date_bucket=bucket)
    else:   # progress, gauge
        spec.update(target=config.get('target'), gauge_min=config.get('gauge_min'), gauge_max=config.get('gauge_max'))
    return spec
'@
Swap 'datasets\services.py' @'
    x = spec.get('x')
'@ @'
    if spec.get('shape') in ('kpi', 'multi_card', 'progress', 'gauge', 'text'):   # widgets: X is optional, so they run before the X check
        from .shapes import run_shape
        return run_shape(df, spec.get('x'), spec)

    x = spec.get('x')
'@
Swap 'datasets\shapes.py' @'
from .services import _py, run_query
'@ @'
from .services import _py, run_query
from .widgets import WIDGETS
'@
Swap 'datasets\shapes.py' @'
    if not isinstance(shape, str) or shape not in SHAPES:
'@ @'
    if isinstance(shape, str) and shape in WIDGETS:
        return WIDGETS[shape](df, spec)
    if not isinstance(shape, str) or shape not in SHAPES:
'@
Swap 'static\js\chart_tier_a.js' @'
        keys: function () { return Object.keys(BUILDERS); },
'@ @'
        keys: function () { return Object.keys(BUILDERS); },
        register: function (type, fn) { BUILDERS[type] = fn; },   // chart_widgets.js adds the widgets
        kit: K,
        fmtFor: fmtFor,
'@
Swap 'static\js\create_chart.js' @'
// Fill the Y dropdowns from a saved list (edit mode)
'@ @'
// ---------- Widgets (KPI, cards, progress, gauge, sparkline, text) ----------
let widgetBound = false;

function widgetParts() {
    return FluxionTypes.widgetParts(selectedChartType);
}

// Show the settings a widget needs, hide X / Y / Customise where they make no sense
function syncWidgetFields() {
    const parts = widgetParts();
    const box = document.getElementById('widgetFields');
    if (!box) return;
    if (!widgetBound) {
        ['wAgg', 'wBucket', 'wTarget', 'wGaugeMin', 'wGaugeMax', 'wHeading', 'wText'].forEach(id => {
            document.getElementById(id).addEventListener('input', validateSelections);
        });
        widgetBound = true;
    }
    box.style.display = parts.length ? 'block' : 'none';
    const show = (id, on) => { document.getElementById(id).style.display = on ? 'block' : 'none'; };
    show('wAggGroup', parts.includes('agg'));
    show('wBucketGroup', parts.includes('bucket'));
    show('wTargetGroup', parts.includes('target'));
    show('wGaugeGroup', parts.includes('gauge'));
    show('wTextGroup', parts.includes('text'));
    xAxisSelect.closest('.field-group').style.display = FluxionTypes.noX(selectedChartType) ? 'none' : 'block';
    if (FluxionTypes.noY(selectedChartType)) yAxisGroup.style.display = 'none';
    const panel = document.getElementById('customisePanel');
    if (panel) panel.style.display = parts.length ? 'none' : '';
}

function numberOrNull(id) {
    const v = document.getElementById(id).value;
    return v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
}

// Extra settings saved with the chart (server keeps only what it knows: charts/queries.py widget_config)
function widgetConfig() {
    const parts = widgetParts();
    const cfg = {};
    if (parts.includes('agg')) cfg.agg = document.getElementById('wAgg').value;
    if (parts.includes('bucket')) cfg.bucket = document.getElementById('wBucket').value;
    if (parts.includes('target') && numberOrNull('wTarget') !== null) cfg.target = numberOrNull('wTarget');
    if (parts.includes('gauge')) {
        if (numberOrNull('wGaugeMin') !== null) cfg.gauge_min = numberOrNull('wGaugeMin');
        if (numberOrNull('wGaugeMax') !== null) cfg.gauge_max = numberOrNull('wGaugeMax');
    }
    if (parts.includes('text')) {
        const heading = document.getElementById('wHeading').value.trim();
        const text = document.getElementById('wText').value.trim();
        if (heading) cfg.heading = heading;
        if (text) cfg.text = text;
    }
    return cfg;
}

function widgetValid() {
    const t = selectedChartType;
    const parts = widgetParts();
    const cfg = widgetConfig();
    if (!FluxionTypes.noX(t) && !FluxionTypes.xOptional(t) && xAxisSelect.value === '') return false;
    if (!FluxionTypes.noY(t) && getYColumns().length === 0) return false;
    if (parts.includes('target') && !(cfg.target > 0)) return false;
    if (parts.includes('gauge') && !(Number.isFinite(cfg.gauge_max) && cfg.gauge_max > (cfg.gauge_min || 0))) return false;
    if (parts.includes('text') && !(cfg.text || cfg.heading)) return false;
    return true;
}

// Edit mode: put the saved settings back into the form
function loadWidgetConfig(cfg) {
    const set = (id, value) => { document.getElementById(id).value = value === undefined || value === null ? '' : value; };
    set('wAgg', cfg.agg || 'sum');
    set('wBucket', cfg.bucket || 'month');
    set('wTarget', cfg.target);
    set('wGaugeMin', cfg.gauge_min === undefined ? 0 : cfg.gauge_min);
    set('wGaugeMax', cfg.gauge_max);
    set('wHeading', cfg.heading);
    set('wText', cfg.text);
}

// Fill the Y dropdowns from a saved list (edit mode)
'@
Swap 'static\js\create_chart.js' @'
    syncYSlots();
    updateMultiYVisibility();
'@ @'
    syncYSlots();
    updateMultiYVisibility();
    syncWidgetFields();
'@
Swap 'static\js\create_chart.js' @'
    let isValid = false;
    if (usesLabelValue(selectedChartType)) {
'@ @'
    let isValid = false;
    if (FluxionTypes.isWidget(selectedChartType)) {
        isValid = widgetValid();
    } else if (usesLabelValue(selectedChartType)) {
'@
Swap 'static\js\create_chart.js' @'
config: { x_axis: xAxisSelect.value, y_axes: getYColumns() } };
'@ @'
config: Object.assign({ x_axis: xAxisSelect.value, y_axes: getYColumns() }, widgetConfig()) };
'@
Swap 'static\js\create_chart.js' @'
    return chartConfig;
'@ @'
    Object.assign(chartConfig, widgetConfig());
    return chartConfig;
'@
Swap 'static\js\create_chart.js' @'
        colorScheme.value = config.color_scheme || 'default';
'@ @'
        colorScheme.value = config.color_scheme || 'default';
        loadWidgetConfig(config);
'@
Swap 'static\js\create_chart.js' @'
    return `${FluxionTypes.title(selectedChartType)} Chart`;
'@ @'
    const name = FluxionTypes.title(selectedChartType);
    return FluxionTypes.isWidget(selectedChartType) ? name : `${name} Chart`;
'@
Swap 'templates\create_chart.html' @'
                <!-- Value Selection (for pie charts) -->
'@ @'
                <!-- Widget settings (KPI, cards, progress, gauge, sparkline, text) -->
                <div id="widgetFields" style="display: none;">
                    <div class="field-group" id="wAggGroup">
                        <label for="wAgg">Calculate</label>
                        <select id="wAgg" class="form-select">
                            <option value="sum">Sum</option>
                            <option value="avg">Average</option>
                            <option value="count">Count</option>
                            <option value="min">Minimum</option>
                            <option value="max">Maximum</option>
                        </select>
                    </div>
                    <div class="field-group" id="wBucketGroup">
                        <label for="wBucket">Group dates by</label>
                        <select id="wBucket" class="form-select">
                            <option value="month">Month</option>
                            <option value="day">Day</option>
                            <option value="week">Week</option>
                            <option value="quarter">Quarter</option>
                            <option value="year">Year</option>
                            <option value="none">No grouping</option>
                        </select>
                    </div>
                    <div class="field-group" id="wTargetGroup">
                        <label for="wTarget">Target (number above 0)</label>
                        <input type="number" id="wTarget" class="form-input" step="any" placeholder="e.g. 10000">
                    </div>
                    <div class="field-group" id="wGaugeGroup">
                        <label for="wGaugeMin">Gauge minimum</label>
                        <input type="number" id="wGaugeMin" class="form-input" step="any" value="0">
                        <label for="wGaugeMax" style="margin-top: 0.75rem;">Gauge maximum</label>
                        <input type="number" id="wGaugeMax" class="form-input" step="any" placeholder="e.g. 100">
                    </div>
                    <div class="field-group" id="wTextGroup">
                        <label for="wHeading">Heading (optional)</label>
                        <input type="text" id="wHeading" class="form-input" maxlength="80" placeholder="e.g. Q4 note">
                        <label for="wText" style="margin-top: 0.75rem;">Text</label>
                        <textarea id="wText" class="form-input" rows="5" maxlength="600" placeholder="Write a note..."></textarea>
                    </div>
                </div>

                <!-- Value Selection (for pie charts) -->
'@
Swap 'templates\create_chart.html' @'
{% include 'partials/chart_type_buttons_a.html' %}
'@ @'
{% include 'partials/chart_type_buttons_a.html' %}
                    {% include 'partials/chart_type_buttons_b.html' %}
'@
Swap 'templates\charts.html' @'
or chart.chart_type == 'gantt' %}
'@ @'
or chart.chart_type == 'gantt' or chart.chart_type == 'kpi' or chart.chart_type == 'multi_card' or chart.chart_type == 'progress' or chart.chart_type == 'gauge' or chart.chart_type == 'sparkline' or chart.chart_type == 'text' %}
'@
Swap 'templates\create_report.html' @'
{{ chart.chart_type|capfirst }} chart &middot;
'@ @'
{{ chart.get_chart_type_display }} &middot;
'@
Swap 'templates\create_board.html' @'
{{ chart.chart_type|capfirst }} chart &middot;
'@ @'
{{ chart.get_chart_type_display }} &middot;
'@
Swap 'templates\partials\chart_icon_a.html' @'
{% endif %}
'@ @'
{% elif type == 'kpi' %}<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 15l3-3 2 2 5-5"/><path d="M14 9h3v3"/></svg>
{% elif type == 'multi_card' %}<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h4"/><path d="M15 9h2"/><path d="M7 12h4"/><path d="M15 12h2"/><path d="M7 15h4"/><path d="M15 15h2"/></svg>
{% elif type == 'progress' %}<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="9" width="18" height="6" rx="3"/><path d="M6 12h7"/></svg>
{% elif type == 'gauge' %}<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4-5"/><circle cx="12" cy="17" r="1"/></svg>
{% elif type == 'sparkline' %}<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 15l4-4 3 3 4-6 3 4 4-3"/></svg>
{% elif type == 'text' %}<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 6h14"/><path d="M12 6v13"/><path d="M9 19h6"/></svg>
{% endif %}
'@
Swap 'templates\partials\chart_scripts.html' @'
<script src="{% static 'js/chart_tier_a.js' %}"></script>
'@ @'
<script src="{% static 'js/chart_tier_a.js' %}"></script>
<script src="{% static 'js/chart_widgets.js' %}"></script>
'@
Swap 'templates\about.html' @'
            <span class="ab-chip">Bar</span><span class="ab-chip">Line</span><span class="ab-chip">Pie</span><span class="ab-chip">Scatter</span><span class="ab-chip">Horizontal bar</span><span class="ab-chip">Area</span><span class="ab-chip">Doughnut</span><span class="ab-chip">Radar</span><span class="ab-chip">Stacked bar</span><span class="ab-chip">Combo</span><span class="ab-chip">Histogram</span>
            <span class="ab-chip">Bar</span><span class="ab-chip">Line</span><span class="ab-chip">Pie</span><span class="ab-chip">Scatter</span><span class="ab-chip">Horizontal bar</span><span class="ab-chip">Area</span><span class="ab-chip">Doughnut</span><span class="ab-chip">Radar</span><span class="ab-chip">Stacked bar</span><span class="ab-chip">Combo</span><span class="ab-chip">Histogram</span>
'@ @'
            <span class="ab-chip">Bar</span><span class="ab-chip">Line</span><span class="ab-chip">Pie</span><span class="ab-chip">Scatter</span><span class="ab-chip">Horizontal bar</span><span class="ab-chip">Area</span><span class="ab-chip">Doughnut</span><span class="ab-chip">Radar</span><span class="ab-chip">Stacked bar</span><span class="ab-chip">Combo</span><span class="ab-chip">Histogram</span><span class="ab-chip">Stacked area</span><span class="ab-chip">Dual-axis line</span><span class="ab-chip">Bubble</span><span class="ab-chip">Waterfall</span><span class="ab-chip">Funnel</span><span class="ab-chip">Pareto</span><span class="ab-chip">Bullet</span><span class="ab-chip">Density</span><span class="ab-chip">Gantt</span><span class="ab-chip">KPI card</span><span class="ab-chip">Multi-row card</span><span class="ab-chip">Progress bar</span><span class="ab-chip">Gauge</span><span class="ab-chip">Sparkline</span><span class="ab-chip">Text</span>
            <span class="ab-chip">Bar</span><span class="ab-chip">Line</span><span class="ab-chip">Pie</span><span class="ab-chip">Scatter</span><span class="ab-chip">Horizontal bar</span><span class="ab-chip">Area</span><span class="ab-chip">Doughnut</span><span class="ab-chip">Radar</span><span class="ab-chip">Stacked bar</span><span class="ab-chip">Combo</span><span class="ab-chip">Histogram</span><span class="ab-chip">Stacked area</span><span class="ab-chip">Dual-axis line</span><span class="ab-chip">Bubble</span><span class="ab-chip">Waterfall</span><span class="ab-chip">Funnel</span><span class="ab-chip">Pareto</span><span class="ab-chip">Bullet</span><span class="ab-chip">Density</span><span class="ab-chip">Gantt</span><span class="ab-chip">KPI card</span><span class="ab-chip">Multi-row card</span><span class="ab-chip">Progress bar</span><span class="ab-chip">Gauge</span><span class="ab-chip">Sparkline</span><span class="ab-chip">Text</span>
'@
Swap 'templates\about.html' @'
data-count="11">11</span><span class="ab-stat-label">chart types
'@ @'
data-count="26">26</span><span class="ab-stat-label">chart types
'@
Swap 'templates\about.html' @'
<p>Eleven chart types, plus options
'@ @'
<p>26 chart types and widgets, plus options
'@
Swap 'templates\about.html' @'
aria-label="Chart types: bar, line, pie, scatter, horizontal bar, area, doughnut, radar, stacked bar, combo, histogram"
'@ @'
aria-label="Chart types: bar, line, pie, scatter, horizontal bar, area, doughnut, radar, stacked bar, combo, histogram, stacked area, dual-axis line, bubble, waterfall, funnel, Pareto, bullet, density, Gantt, KPI card, multi-row card, progress bar, gauge, sparkline, text"
'@
Swap 'templates\faq.html' @'
Pick one of 11 chart types (bar, line, pie, scatter, horizontal bar, area, doughnut, radar, stacked bar, combo or histogram)
'@ @'
Pick one of 26 chart types and widgets (bar, line, pie, scatter, horizontal bar, area, doughnut, radar, stacked bar, combo, histogram, stacked area, dual-axis line, bubble, waterfall, funnel, Pareto, bullet, density, Gantt, KPI card, multi-row card, progress bar, gauge, sparkline or text)
'@
Swap 'templates\landing.html' @'
. 11 chart types, live data,
'@ @'
. 26 chart types and widgets, live data,
'@
Swap 'templates\landing.html' @'
>11 chart types, fully customisable</li>
'@ @'
>26 chart types and widgets, fully customisable</li>
'@
Swap 'templates\landing.html' @'
<h3>11 chart types</h3>
'@ @'
<h3>26 chart types</h3>
'@
Swap 'tools\test_registry.py' @'
check('Tier A keys registered after the 11', keys[11:], TIER_A)
'@ @'
WIDGETS = ['kpi', 'multi_card', 'progress', 'gauge', 'sparkline', 'text']
check('Tier A + widget keys registered after the 11', keys[11:], TIER_A + WIDGETS)
'@
Swap 'tools\test_registry.py' @'
check('enabled = the 11 shipped + 9 Tier A types', sorted(ENABLED), sorted([k for k, _l in OLD] + TIER_A))
'@ @'
check('enabled = the 11 shipped + Tier A + widgets', sorted(ENABLED), sorted([k for k, _l in OLD] + TIER_A + WIDGETS))
'@
Swap 'tools\test_registry.py' @'
if f[2] not in ('xy', 'label-value', 'x')
'@ @'
if f[2] not in ('xy', 'label-value', 'x', 'none')
'@
Swap 'tools\test_registry.py' @'
for k, _l, _o in CHART_TYPES[11:]))
'@ @'
for k, _l, _o in CHART_TYPES[11:20]))
'@
Swap 'tools\test_registry.py' @'
    extra = read('templates', 'partials', 'chart_type_buttons_a.html') or ''
'@ @'
    extra = (read('templates', 'partials', 'chart_type_buttons_a.html') or '') + (read('templates', 'partials', 'chart_type_buttons_b.html') or '')
'@
Swap 'tools\test_registry.py' @'
w = max(len(r[1]) for r in rows)
'@ @'
widg = read('static', 'js', 'chart_widgets.js')
check('chart_widgets.js exists', widg is not None, True)
check('chart_widgets.js registers every widget', sorted(re.findall(r"A\.register\('(\w+)'", widg or '')), sorted(WIDGETS))
w = max(len(r[1]) for r in rows)
'@
Swap 'tools\test_mobile.py' @'
'js/chart_extras.js', 'js/chart_tier_a.js')]
'@ @'
'js/chart_extras.js', 'js/chart_tier_a.js', 'js/chart_widgets.js')]
'@
Swap 'tools\check_all.ps1' @'
python tools\test_shapes.py 2>$null | Select-String 'FAIL|checks,'
'@ @'
python tools\test_shapes.py 2>$null | Select-String 'FAIL|checks,'
python tools\test_widgets.py 2>$null | Select-String 'FAIL|checks,'
'@
Swap 'tools\test_routes.py' @'
            check('shared page new type anon', anon.get(f'/shared/{btok19}').status_code, 200)
'@ @'
            check('shared page new type anon', anon.get(f'/shared/{btok19}').status_code, 200)

        # ---- Phase 20: widgets ----
        W20 = {
            'kpi': dict(y_axes=['sales'], agg='sum'),
            'multi_card': dict(y_axes=['sales', 'cost'], agg='sum'),
            'progress': dict(y_axes=['sales'], agg='sum', target=120),
            'gauge': dict(y_axes=['sales'], agg='max', gauge_min=0, gauge_max=60),
            'sparkline': dict(x_axis='name', y_axes=['sales'], agg='sum', bucket='none'),
            'text': dict(text='Hello', heading='H'),
        }
        w20 = {}
        for t20, cfg20 in W20.items():
            tid20, st20 = p11_save(t20, **cfg20)
            w20[t20] = tid20
            check(f'save-chart {t20}', st20, 200)
            check(f'chart-data {t20}', A.get(f'/chart-data/{tid20}').status_code, 200)
        check('kpi total', p11_data(w20['kpi']).get('meta', {}).get('value'), 60)
        check('multi_card rows', [x.get('value') for x in p11_data(w20['multi_card']).get('meta', {}).get('rows', [])], [[60, 6]])
        check('progress pct', p11_data(w20['progress']).get('meta', {}).get('pct'), 50.0)
        check('gauge pct', p11_data(w20['gauge']).get('meta', {}).get('pct'), 50.0)
        check('sparkline labels', p11_data(w20['sparkline']).get('labels'), [['a', 'b', 'c']])
        check('text body', p11_data(w20['text']).get('meta', {}).get('text'), 'Hello')
        check('widget settings saved', js(A.get(f'/get-chart/{w20["progress"]}')).get('chart', {}).get('config', {}).get('target'), 120)
        tid20, _ = p11_save('progress', y_axes=['sales'], agg='sum')
        check('progress without target is 400', A.get(f'/chart-data/{tid20}').status_code, 400)
        tid20, _ = p11_save('kpi', y_axes=['sales'], agg='median')
        check('widget bad agg dropped on save', 'agg' in js(A.get(f'/get-chart/{tid20}')).get('chart', {}).get('config', {}), False)
        r = jpost(A, f'/dataset-data/{ds}', {'chart_type': 'kpi', 'config': {'y_axes': ['sales'], 'agg': 'sum'}})
        check('dataset-data widget preview', r.status_code, 200)
        check('dataset-data widget value', js(r).get('meta', {}).get('value'), 60)
'@