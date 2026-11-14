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

Swap 'static\js\create_chart.js' @'
const MAX_Y = 10;   // same as MAX_SERIES in datasets/services.py
'@ @'
const MAX_Y = 10;   // same as MAX_SERIES in datasets/services.py

// ---------- Fixed Y columns (bubble: Y + Size, bullet: Actual + Target, gantt: Start + End ...) ----------
let slotRowsActive = false;

function slotRow(text, value) {
    const row = document.createElement('div');
    row.className = 'y-row';
    const select = document.createElement('select');
    select.className = 'form-select';
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = 'Select ' + text + ' column...';
    select.appendChild(blank);
    currentDataset.column_names.forEach(column => {
        const option = document.createElement('option');
        option.value = column;
        option.textContent = column;
        select.appendChild(option);
    });
    select.value = value || '';
    select.addEventListener('change', validateSelections);
    row.appendChild(select);
    return row;
}

// Labels + dropdowns for the current type. Called whenever the type changes.
function syncYSlots() {
    const slots = FluxionTypes.slots(selectedChartType);
    const label = document.querySelector('label[for="yAxisSelect"]');
    if (label) label.textContent = FluxionTypes.yLabel(selectedChartType);
    yAxisSelect.options[0].textContent = slots.length ? 'Select ' + slots[0] + ' column...' : 'Select Y-Axis column...';
    if (slots.length > 1) {
        const old = Array.from(extraYRows.querySelectorAll('select')).map(s => s.value);
        extraYRows.innerHTML = '';
        slots.slice(1).forEach((text, i) => extraYRows.appendChild(slotRow(text, old[i])));
        slotRowsActive = true;
    } else if (slotRowsActive) {
        clearExtraYRows();
        slotRowsActive = false;
    }
    refreshAddYButton();
}

// Fill the Y dropdowns from a saved list (edit mode)
function setYColumns(cols) {
    yAxisSelect.value = cols[0] || '';
    if (FluxionTypes.slots(selectedChartType).length > 1) {
        extraYRows.querySelectorAll('select').forEach((s, i) => { s.value = cols[i + 1] || ''; });
    } else {
        clearExtraYRows();
        cols.slice(1).forEach(column => addYRow(column));
    }
}
'@
Swap 'static\js\create_chart.js' @'
    extraYRows.style.display = show ? 'block' : 'none';
'@ @'
    extraYRows.style.display = (show || FluxionTypes.slots(selectedChartType).length > 1) ? 'block' : 'none';
'@
Swap 'static\js\create_chart.js' @'
    if (selectedChartType === 'histogram') return [];   // one column only, no Y
'@ @'
    if (FluxionTypes.fields(selectedChartType) === 'x') return [];   // one column only, no Y
    if (FluxionTypes.slots(selectedChartType).length) {   // fixed columns: keep the order, blanks stay blank
        return [yAxisSelect.value].concat(Array.from(extraYRows.querySelectorAll('select')).map(s => s.value));
    }
'@
Swap 'static\js\create_chart.js' @'
        yAxisGroup.style.display = selectedChartType === 'histogram' ? 'none' : 'block';
'@ @'
        yAxisGroup.style.display = FluxionTypes.fields(selectedChartType) === 'x' ? 'none' : 'block';
'@
Swap 'static\js\create_chart.js' @'
    document.querySelector('label[for="xAxisSelect"]').textContent =
        selectedChartType === 'histogram' ? 'Column (numbers)' : 'X-Axis (Categories)';
'@ @'
    document.querySelector('label[for="xAxisSelect"]').textContent = FluxionTypes.xLabel(selectedChartType);
'@
Swap 'static\js\create_chart.js' @'
    updateMultiYVisibility();
'@ @'
    syncYSlots();
    updateMultiYVisibility();
'@
Swap 'static\js\create_chart.js' @'
    } else if (selectedChartType === 'histogram') {
'@ @'
    } else if (FluxionTypes.fields(selectedChartType) === 'x') {
'@
Swap 'static\js\create_chart.js' @'
        isValid = xAxisSelect.value !== '' && getYColumns().length > 0;
'@ @'
        const ys = getYColumns();
        isValid = xAxisSelect.value !== '' && ys.length > 0 && ys.every(c => c !== '') && new Set(ys).size === ys.length;
'@
Swap 'static\js\create_chart.js' @'
function buildQuerySpec() {
'@ @'
function buildQuerySpec() {
    if (FluxionTypes.serverSpec(selectedChartType)) {   // server builds the query (charts/queries.py): one source of truth
        return { chart_type: selectedChartType, config: { x_axis: xAxisSelect.value, y_axes: getYColumns() } };
    }
'@
Swap 'static\js\create_chart.js' @'
    if (selectedChartType === 'histogram') return [xAxisSelect.value || 'Value'];
'@ @'
    if (FluxionTypes.fields(selectedChartType) === 'x') return [xAxisSelect.value || 'Value'];
'@
Swap 'static\js\create_chart.js' @'
    return selectedChartType === 'scatter' ? [ys[0]] : ys;
'@ @'
    return FluxionTypes.seriesNames(selectedChartType, ys);
'@
Swap 'static\js\create_chart.js' @'
            yAxisSelect.value = savedYs[0] || '';
            clearExtraYRows();
            savedYs.slice(1).forEach(column => addYRow(column));
'@ @'
            setYColumns(savedYs);
'@
Swap 'templates\create_chart.html' @'
                        <span>Histogram</span>
                    </button>
'@ @'
                        <span>Histogram</span>
                    </button>
                    {% include 'partials/chart_type_buttons_a.html' %}
'@
Swap 'static\js\chart_options.js' @'
    const SMOOTH = ['line', 'area', 'combo'];
'@ @'
    const SMOOTH = ['line', 'area', 'combo', 'stacked_area', 'dual_line', 'density'];
'@
Swap 'static\js\chart_options.js' @'
    const LABEL_NO = ['radar'];
'@ @'
    const LABEL_NO = ['radar', 'stacked_area', 'dual_line', 'bubble', 'waterfall', 'funnel', 'pareto', 'bullet', 'density', 'gantt'];
'@
Swap 'static\js\chart_options.js' @'
    const LOG_NO = ['stacked', 'histogram', 'radar', 'pie', 'doughnut'];
'@ @'
    const LOG_NO = ['stacked', 'histogram', 'radar', 'pie', 'doughnut', 'stacked_area', 'dual_line', 'bubble', 'waterfall', 'funnel', 'pareto', 'bullet', 'density', 'gantt'];
'@
Swap 'static\js\chart_options.js' @'
    const GRAD_OK = ['bar', 'hbar', 'combo', 'histogram', 'area'];
'@ @'
    const GRAD_OK = ['bar', 'hbar', 'combo', 'histogram', 'area', 'pareto'];
'@
Swap 'datasets\views.py' @'
from .models import Dataset
'@ @'
from .models import Dataset
from charts.queries import SHAPE_TYPES, spec_from_chart
'@
Swap 'datasets\views.py' @'
        result = run_query(load_dataframe(dataset), spec)
'@ @'
        if isinstance(spec, dict) and isinstance(spec.get('chart_type'), str) and spec['chart_type'] in SHAPE_TYPES:
            cfg = spec.get('config')   # new chart types: the server builds the query from type + columns
            spec = spec_from_chart(spec['chart_type'], cfg if isinstance(cfg, dict) else {})
        result = run_query(load_dataframe(dataset), spec)
'@
Swap 'charts\registry.py' @'
    # Phase 19 Tier A: choices only until 19C
    ('stacked_area', 'Stacked Area', False),
    ('bubble', 'Bubble', False),
    ('waterfall', 'Waterfall', False),
    ('funnel', 'Funnel', False),
    ('pareto', 'Pareto', False),
    ('bullet', 'Bullet', False),
    ('dual_line', 'Dual-Axis Line', False),
    ('density', 'Density', False),
    ('gantt', 'Gantt', False),
'@ @'
    # Phase 19 Tier A
    ('stacked_area', 'Stacked Area', True),
    ('bubble', 'Bubble', True),
    ('waterfall', 'Waterfall', True),
    ('funnel', 'Funnel', True),
    ('pareto', 'Pareto', True),
    ('bullet', 'Bullet', True),
    ('dual_line', 'Dual-Axis Line', True),
    ('density', 'Density', True),
    ('gantt', 'Gantt', True),
'@
Swap 'tools\test_registry.py' @'
check('enabled = the 11 shipped types', sorted(ENABLED), sorted(k for k, _l in OLD))
'@ @'
check('enabled = the 11 shipped + 9 Tier A types', sorted(ENABLED), sorted([k for k, _l in OLD] + TIER_A))
'@
Swap 'tools\test_registry.py' @'
check('Tier A not enabled yet', sorted(ENABLED & set(TIER_A)), [])
'@ @'
check('Tier A enabled', sorted(ENABLED & set(TIER_A)), sorted(TIER_A))
'@
Swap 'tools\test_registry.py' @'
    found = re.findall(r"^\s+(\w+): \{ title: '([^']+)', fields: '([\w-]+)', multiY: (true|false) \}", js, re.M)
'@ @'
    found = re.findall(r"^\s+(\w+): \{ title: '([^']+)', fields: '([\w-]+)', multiY: (true|false)", js, re.M)
'@
Swap 'tools\test_registry.py' @'
    btns = re.findall(r'chart-type-btn[^"]*"\s+data-type="(\w+)"', cc)
'@ @'
    extra = read('templates', 'partials', 'chart_type_buttons_a.html') or ''
    btns = re.findall(r'chart-type-btn[^"]*"\s+data-type="(\w+)"', cc + extra)
'@
Swap 'tools\test_registry.py' @'
w = max(len(r[1]) for r in rows)
'@ @'
icons = read('templates', 'partials', 'chart_icon_a.html')
check('chart_icon_a.html exists', icons is not None, True)
check('icon partial draws every Tier A type', [k for k in TIER_A if icons is None or "== '" + k + "'" not in icons], [])
w = max(len(r[1]) for r in rows)
'@
Swap 'tools\test_routes.py' @'
        check('save-chart invalid type', p11_save('banana', x_axis='name', y_axis='sales')[1], 400)
'@ @'
        check('save-chart invalid type', p11_save('banana', x_axis='name', y_axis='sales')[1], 400)

        # ---- Phase 19C: Tier A chart types ----
        A19 = {
            'stacked_area': dict(x_axis='name', y_axes=['sales', 'cost']),
            'dual_line': dict(x_axis='name', y_axes=['sales', 'cost']),
            'bubble': dict(x_axis='cost', y_axes=['sales', 'cost']),
            'waterfall': dict(x_axis='name', y_axes=['sales']),
            'funnel': dict(x_axis='name', y_axes=['sales']),
            'pareto': dict(x_axis='name', y_axes=['sales']),
            'bullet': dict(x_axis='name', y_axes=['sales', 'cost']),
            'density': dict(x_axis='sales'),
            'gantt': dict(x_axis='name', y_axes=['cost', 'sales']),
        }
        a19 = {}
        for t19, cfg19 in A19.items():
            tid19, st19 = p11_save(t19, **cfg19)
            a19[t19] = tid19
            check(f'save-chart {t19}', st19, 200)
            check(f'chart-data {t19}', A.get(f'/chart-data/{tid19}').status_code, 200)
        check('waterfall labels + Total', p11_data(a19['waterfall']).get('labels'), [['a', 'b', 'c', 'Total']])
        check('waterfall change values', p11_data(a19['waterfall']).get('series', [{}])[0].get('values'), [[10, 20, 30, 60]])
        check('funnel sorted largest first', p11_data(a19['funnel']).get('labels'), [['c', 'b', 'a']])
        check('pareto cumulative %', p11_data(a19['pareto']).get('series', [{}, {}])[1].get('values'), [[50.0, 83.33, 100.0]])
        check('bubble size series', p11_data(a19['bubble']).get('series', [{}, {}])[1].get('values'), [[1, 2, 3]])
        check('density 100 grid points', len(p11_data(a19['density']).get('labels', [])), 100)
        check('gantt number kind', p11_data(a19['gantt']).get('meta', {}).get('kind'), 'number')
        check('bullet two series', len(p11_data(a19['bullet']).get('series', [])), 2)
        spec19 = {'chart_type': 'funnel', 'config': {'x_axis': 'name', 'y_axes': ['sales']}}
        r = jpost(A, f'/dataset-data/{ds}', spec19)
        check('dataset-data chart_type spec', r.status_code, 200)
        check('dataset-data chart_type values', js(r).get('series', [{}])[0].get('values'), [[30, 20, 10]])
        check('dataset-data chart_type incomplete config', jpost(A, f'/dataset-data/{ds}', {'chart_type': 'bubble', 'config': {'x_axis': 'cost'}}).status_code, 400)
        check('dataset-data chart_type config not a dict', jpost(A, f'/dataset-data/{ds}', {'chart_type': 'funnel', 'config': 'x'}).status_code, 400)
        check('dataset-data chart_type not a string', jpost(A, f'/dataset-data/{ds}', {'chart_type': ['funnel']}).status_code, 400)
        check('B dataset-data chart_type', jpost(B, f'/dataset-data/{ds}', spec19).status_code, [403, 404])
        r = A.post(f'/share-chart/{a19["bubble"]}')
        check('share-chart new type', r.status_code, 200)
        btok19 = js(r).get('share_token')
        if btok19:
            check('shared-data new type anon', anon.get(f'/shared-data/{btok19}').status_code, 200)
            check('shared page new type anon', anon.get(f'/shared/{btok19}').status_code, 200)
'@
Rx 'templates\charts.html' "(?m)^([ \t]*\{% elif chart\.chart_type == 'histogram' %\}[^\r\n]*)(\r?\n)" "`$1`$2                            {% elif chart.chart_type == 'stacked_area' or chart.chart_type == 'dual_line' or chart.chart_type == 'bubble' or chart.chart_type == 'waterfall' or chart.chart_type == 'funnel' or chart.chart_type == 'pareto' or chart.chart_type == 'bullet' or chart.chart_type == 'density' or chart.chart_type == 'gantt' %}<div class=`"icon-lg`">{% include 'partials/chart_icon_a.html' with type=chart.chart_type %}</div>`$2" 'chart_icon_a.html'