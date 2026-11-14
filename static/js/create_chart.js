// Chart Creation JavaScript

let currentDataset = null;
let currentChart = null;
let builderReady = false;
let lastResult = null;   // last server result: option changes re-render without a refetch
let editingChartId = null; // set when we're editing an existing chart instead of creating a new one

const noDataState = document.getElementById('noDataState');
const chartBuilder = document.getElementById('chartBuilder');
const xAxisSelect = document.getElementById('xAxisSelect');
const yAxisSelect = document.getElementById('yAxisSelect');
const valueSelect = document.getElementById('valueSelect');
const labelSelect = document.getElementById('labelSelect');
const chartTitle = document.getElementById('chartTitle');
const colorScheme = document.getElementById('colorScheme');
const updateChartBtn = document.getElementById('updateChartBtn');
const saveChartBtn = document.getElementById('saveChartBtn');
const downloadBtn = document.getElementById('downloadBtn');
const chartCanvas = document.getElementById('chartCanvas');
const noChartState = document.getElementById('noChartState');
const yAxisGroup = document.getElementById('yAxisGroup');
const extraYRows = document.getElementById('extraYRows');
const addYBtn = document.getElementById('addYBtn');
const valueGroup = document.getElementById('valueGroup');
const labelGroup = document.getElementById('labelGroup');
const editBanner = document.getElementById('editBanner');
const editBannerTitle = document.getElementById('editBannerTitle');

const chartTypeButtons = document.querySelectorAll('.chart-type-btn');
let selectedChartType = 'bar';

// Types that use Labels + Values (like pie) instead of X / Y
function usesLabelValue(type) {
    return FluxionTypes.usesLabelValue(type);
}

function defaultTitle() {
    const name = FluxionTypes.title(selectedChartType);
    return FluxionTypes.isWidget(selectedChartType) ? name : `${name} Chart`;
}

// Colour palettes live in chart_render.js (FluxionChart.colorSchemes)

document.addEventListener('DOMContentLoaded', function() {
    initializePage();
    initializeNoDataActions();
});

function initializePage() {
    const params = new URLSearchParams(window.location.search);
    const editId = params.get('edit');

    if (editId) {
        loadChartForEditing(parseInt(editId, 10));
    } else {
        const datasetJson = sessionStorage.getItem('currentDataset');
        if (datasetJson) verifyStoredDataset(datasetJson);
        if (datasetJson) {
            currentDataset = JSON.parse(datasetJson);
            showChartBuilder();
            initializeChartBuilder();
            applySuggestedChartType();
        } else {
            showNoDataState();
        }
    }
}

// Guess a sensible chart type from column_stats, only for brand-new charts
// (edit mode keeps whatever type the chart was already saved with).
function suggestChartType(dataset) {
    const stats = dataset.column_stats || {};
    const cols = dataset.column_names || [];
    const numericCols = cols.filter(c => stats[c] && stats[c].type === 'numeric');
    const textCols = cols.filter(c => stats[c] && stats[c].type !== 'numeric');

    const dateLike = textCols.some(c => /date|time|year|month|day/i.test(c));
    if (dateLike && numericCols.length > 0) return 'line';

    const smallCategoryCol = textCols.find(c => stats[c] && stats[c].unique && stats[c].unique <= 6);
    if (smallCategoryCol && numericCols.length > 0) return 'pie';

    if (numericCols.length >= 2) return 'scatter';

    return 'bar';
}

function applySuggestedChartType() {
    const suggestion = suggestChartType(currentDataset);
    selectedChartType = suggestion;
    chartTypeButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === suggestion);
    });
    updateFormFields();
    validateSelections();

    const note = document.getElementById('chartTypeSuggestion');
    if (note) {
        const labels = { bar: 'Bar chart', line: 'Line chart', pie: 'Pie chart', scatter: 'Scatter plot' };
        note.textContent = `Suggested: ${labels[suggestion]} based on your columns — change it anytime`;
        note.style.display = 'block';
    }
}

// The stored dataset can be stale: deleted, or cleaned, since it was saved.
// Builder opens at once from storage. Server copy replaces it only if gone or columns differ.
async function verifyStoredDataset(json) {
    let stored;
    try { stored = JSON.parse(json); } catch (e) { return; }
    if (!stored || !stored.id) return;
    try {
        const response = await fetch(`/get-dataset/${stored.id}`);
        if (response.status >= 400 && response.status < 500) {
            sessionStorage.removeItem('currentDataset');
            currentDataset = null;
            showNoDataState();
            return;
        }
        const result = await response.json();
        if (!response.ok || !result.success) return;
        if (JSON.stringify(result.data.column_names) !== JSON.stringify(stored.column_names)) {
            openDataset(result.data);
        }
    } catch (e) {
        // offline or non-JSON reply: keep the stored copy
    }
}

// Load an existing chart's dataset + config so it can be edited in place

async function loadChartForEditing(chartId) {
    try {
        const response = await fetch(`/get-chart/${chartId}`);
        const data = await response.json();

        if (!data.success) {
            alert('Could not load that chart: ' + (data.error || 'Unknown error'));
            showNoDataState();
            return;
        }

        const chart = data.chart;
        editingChartId = chart.id;
        currentDataset = chart.dataset;

        showChartBuilder();
        initializeChartBuilder();

        // Prefill title
        chartTitle.value = chart.title;

        // Prefill chart type selection
        selectedChartType = chart.chart_type;
        chartTypeButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === chart.chart_type);
        });
        updateFormFields();

        // Prefill axis / value / label selects
        const config = chart.config || {};
        if (usesLabelValue(chart.chart_type)) {
            valueSelect.value = config.value_column || '';
            labelSelect.value = config.label_column || '';
        } else {
            xAxisSelect.value = config.x_axis || '';
            const savedYs = (Array.isArray(config.y_axes) && config.y_axes.length) ? config.y_axes : [config.y_axis || ''];
            setYColumns(savedYs);
        }
        colorScheme.value = config.color_scheme || 'default';
        loadWidgetConfig(config);
                FluxionOptionsPanel.load(config.chart_options || {});

        // Show the edit banner
        if (editBanner && editBannerTitle) {
            editBannerTitle.textContent = chart.title;
            editBanner.style.display = 'flex';
        }

        // Switch Save button into "update" mode
        saveChartBtn.textContent = 'Update Chart';
        saveChartBtn.style.display = 'block';
        downloadBtn.style.display = 'block';

        // Render the chart immediately with the loaded settings
        validateSelections();
        const chartData = await prepareChartData();
        createChart(chartData);
        showChartSuccess();

    } catch (error) {
        console.error('Error loading chart for editing:', error);
        alert('Error loading chart: ' + error.message);
        showNoDataState();
    }
}

function showNoDataState() {
    noDataState.style.display = 'block';
    chartBuilder.style.display = 'none';
}

function showChartBuilder() {
    noDataState.style.display = 'none';
    chartBuilder.style.display = 'block';
    document.getElementById('datasetName').textContent = currentDataset.filename;
    document.getElementById('datasetRows').textContent = `${currentDataset.rows.toLocaleString()} rows`;
    document.getElementById('datasetCols').textContent = `${currentDataset.columns} columns`;
}

// ---------- No dataset yet: pick a recent one or upload a new one ----------
const MAX_UPLOAD_BYTES = 16 * 1024 * 1024;

function initializeNoDataActions() {
    const addBtn = document.getElementById('addDatasetBtn');
    const fileInput = document.getElementById('chartFileInput');
    addBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => uploadDataset(fileInput));
    document.querySelectorAll('.js-recent-use').forEach(btn => {
        btn.addEventListener('click', () => useRecentDataset(btn));
    });
}

function setNoDataStatus(message, isError) {
    const el = document.getElementById('addDatasetStatus');
    el.textContent = message;
    el.classList.toggle('error', !!isError);
}

// Same steps as the Dashboard "Use" button, but without a page reload
function openDataset(dataset) {
    editingChartId = null;   // a failed edit load must not turn this into an update
    currentDataset = dataset;
    sessionStorage.setItem('currentDataset', JSON.stringify(dataset));
    FluxionOptionsPanel.load({});   // new dataset = fresh customisation
    showChartBuilder();
    initializeChartBuilder();
    applySuggestedChartType();
}

async function useRecentDataset(btn) {
    btn.disabled = true;
    setNoDataStatus('', false);
    try {
        const response = await fetch(`/get-dataset/${btn.dataset.id}`);
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) {
            throw new Error(result.error || `Server error (${response.status})`);
        }
        openDataset(result.data);
    } catch (error) {
        console.error('Error loading dataset:', error);
        setNoDataStatus('Could not load dataset: ' + error.message, true);
        btn.disabled = false;
    }
}

async function uploadDataset(fileInput) {
    const file = fileInput.files[0];
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
        setNoDataStatus('Invalid file type. Please upload CSV or Excel files only.', true);
        fileInput.value = '';
        return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
        setNoDataStatus('File size exceeds 16MB limit.', true);
        fileInput.value = '';
        return;
    }

    const addBtn = document.getElementById('addDatasetBtn');
    addBtn.disabled = true;
    setNoDataStatus('Processing your data...', false);

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/upload', { method: 'POST', body: formData });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) {
            throw new Error(result.error || `Server error (${response.status})`);
        }
        setNoDataStatus('', false);
        openDataset(result.data);
    } catch (error) {
        console.error('Upload error:', error);
        setNoDataStatus('Upload failed: ' + error.message, true);
    } finally {
        addBtn.disabled = false;
        fileInput.value = '';
    }
}

function initializeChartBuilder() {
    populateColumnSelects();
    if (builderReady) return;   // listeners already attached (failed edit load), do not double them
    builderReady = true;
    initializeChartTypes();

    updateChartBtn.addEventListener('click', handleUpdateChart);
    // Save button behavior depends on mode: creating new vs. updating existing
    saveChartBtn.addEventListener('click', function() {
        if (editingChartId) {
            handleUpdateExistingChart();
        } else {
            handleSaveChart();
        }
    });
    downloadBtn.addEventListener('click', handleDownloadChart);

    xAxisSelect.addEventListener('change', validateSelections);
    yAxisSelect.addEventListener('change', validateSelections);
    addYBtn.addEventListener('click', () => {
        addYRow('');
        validateSelections();
    });
    valueSelect.addEventListener('change', validateSelections);
    labelSelect.addEventListener('change', validateSelections);

    FluxionOptionsPanel.init({
        getType: () => selectedChartType,
        getScheme: () => colorScheme.value,
        getSeriesNames: getSeriesNames,
        onChange: rerenderPreview
    });
    colorScheme.addEventListener('change', () => {
        FluxionOptionsPanel.refresh();
        rerenderPreview();
    });
}

function populateColumnSelects() {
    const columns = currentDataset.column_names;
    clearSelectOptions([xAxisSelect, yAxisSelect, valueSelect, labelSelect]);
    addDefaultOption([xAxisSelect, yAxisSelect, valueSelect, labelSelect]);
    columns.forEach(column => {
        addOptionToSelects([xAxisSelect, yAxisSelect, valueSelect, labelSelect], column, column);
    });
}

function clearSelectOptions(selects) {
    selects.forEach(select => { select.innerHTML = ''; });
}

function addDefaultOption(selects) {
    const defaultOptions = [
        'Select X-Axis column...',
        'Select Y-Axis column...',
        'Select value column...',
        'Select label column...'
    ];
    selects.forEach((select, index) => {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = defaultOptions[index];
        select.appendChild(option);
    });
}

function addOptionToSelects(selects, value, text) {
    selects.forEach(select => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        select.appendChild(option);
    });
}

// ---------- Multiple Y columns ----------
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
    if (panel) panel.style.display = FluxionTypes.noCustomise(selectedChartType) ? 'none' : '';
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
function setYColumns(cols) {
    yAxisSelect.value = cols[0] || '';
    if (FluxionTypes.slots(selectedChartType).length > 1) {
        extraYRows.querySelectorAll('select').forEach((s, i) => { s.value = cols[i + 1] || ''; });
    } else {
        clearExtraYRows();
        cols.slice(1).forEach(column => addYRow(column));
    }
}

function supportsMultiY(type) {
        return FluxionTypes.supportsMultiY(type);
}

function updateMultiYVisibility() {
    const show = supportsMultiY(selectedChartType);
    extraYRows.style.display = (show || FluxionTypes.slots(selectedChartType).length > 1) ? 'block' : 'none';
    addYBtn.style.display = show ? 'inline-block' : 'none';
}

function refreshAddYButton() {
    addYBtn.disabled = (1 + extraYRows.children.length) >= MAX_Y;
}

function addYRow(value) {
    if (1 + extraYRows.children.length >= MAX_Y) return;

    const row = document.createElement('div');
    row.className = 'y-row';

    const select = document.createElement('select');
    select.className = 'form-select';
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = 'Select Y-Axis column...';
    select.appendChild(blank);
    currentDataset.column_names.forEach(column => {
        const option = document.createElement('option');
        option.value = column;
        option.textContent = column;
        select.appendChild(option);
    });
    select.value = value || '';
    select.addEventListener('change', validateSelections);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'y-row-remove';
    remove.setAttribute('aria-label', 'Remove column');
    remove.textContent = '\u00d7';
    remove.addEventListener('click', () => {
        row.remove();
        refreshAddYButton();
        validateSelections();
    });

    row.appendChild(select);
    row.appendChild(remove);
    extraYRows.appendChild(row);
    refreshAddYButton();
}

function clearExtraYRows() {
    extraYRows.innerHTML = '';
    refreshAddYButton();
}

// Chosen Y columns, no blanks, no duplicates. Only row 1 for types without multi-Y.
function getYColumns() {
    if (FluxionTypes.fields(selectedChartType) === 'x') return [];   // one column only, no Y
    if (FluxionTypes.slots(selectedChartType).length) {   // fixed columns: keep the order, blanks stay blank
        return [yAxisSelect.value].concat(Array.from(extraYRows.querySelectorAll('select')).map(s => s.value));
    }
    const cols = [yAxisSelect.value];
    if (supportsMultiY(selectedChartType)) {
        extraYRows.querySelectorAll('select').forEach(s => cols.push(s.value));
    }
    return cols.filter((c, i) => c !== '' && cols.indexOf(c) === i);
}

function initializeChartTypes() {
    chartTypeButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            chartTypeButtons.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            selectedChartType = this.dataset.type;
            updateFormFields();
            validateSelections();
        });
    });
}

function updateFormFields() {
    if (usesLabelValue(selectedChartType)) {
        yAxisGroup.style.display = 'none';
        valueGroup.style.display = 'block';
        labelGroup.style.display = 'block';
    } else {
        yAxisGroup.style.display = FluxionTypes.fields(selectedChartType) === 'x' ? 'none' : 'block';
        valueGroup.style.display = 'none';
        labelGroup.style.display = 'none';
    }
    document.querySelector('label[for="xAxisSelect"]').textContent = FluxionTypes.xLabel(selectedChartType);
    syncYSlots();
    updateMultiYVisibility();
    syncWidgetFields();
}

function validateSelections() {
    let isValid = false;
    if (FluxionTypes.isWidget(selectedChartType)) {
        isValid = widgetValid();
    } else if (usesLabelValue(selectedChartType)) {
        isValid = valueSelect.value !== '' && labelSelect.value !== '';
    } else if (FluxionTypes.fields(selectedChartType) === 'x') {
        isValid = xAxisSelect.value !== '';
    } else {
        const ys = getYColumns();
        isValid = xAxisSelect.value !== '' && ys.length > 0 && ys.every(c => c !== '') && new Set(ys).size === ys.length;
    }
    FluxionOptionsPanel.refresh();
    updateChartBtn.disabled = !isValid;
    if (!isValid) {
        updateChartBtn.textContent = 'Select Data to Update Chart';
        updateChartBtn.style.opacity = '0.6';
    } else {
        updateChartBtn.textContent = 'Update Chart';
        updateChartBtn.style.opacity = '1';
    }
    return isValid;
}

async function handleUpdateChart() {
    if (!validateSelections()) {
        alert('Please select the required data columns');
        return;
    }
    showChartLoading();
    try {
        const chartData = await prepareChartData();
        createChart(chartData);
        showChartSuccess();
    } catch (error) {
        console.error('Error building chart:', error);
        showChartError(error.message);
    }
}

function showChartError(message) {
    chartCanvas.style.display = 'none';
    noChartState.style.display = 'block';
    noChartState.innerHTML = '<h4>Could not build chart</h4><p></p>';
    noChartState.querySelector('p').textContent = message;
}

function showChartLoading() {
    chartCanvas.style.display = 'none';
    noChartState.style.display = 'block';
    noChartState.innerHTML = `
        <div class="loading-chart">
            <div class="loading-spinner"></div>
            <p>Creating your chart...</p>
        </div>
    `;
}

function showChartSuccess() {
    noChartState.style.display = 'none';
    chartCanvas.style.display = 'block';
    chartCanvas.classList.add('visible');
    saveChartBtn.style.display = 'block';
    downloadBtn.style.display = 'block';
}

// Same rules as charts/queries.py, so builder and saved chart match.
function buildQuerySpec() {
    if (FluxionTypes.serverSpec(selectedChartType)) {   // server builds the query (charts/queries.py): one source of truth
        return { chart_type: selectedChartType, config: Object.assign({ x_axis: xAxisSelect.value, y_axes: getYColumns() }, widgetConfig()) };
    }
    if (usesLabelValue(selectedChartType)) {
        return { x: labelSelect.value, series: [{ column: valueSelect.value, agg: 'sum' }], sort: 'none' };
    }
    if (selectedChartType === 'histogram') {
        return { x: xAxisSelect.value, histogram: true };
    }
    if (selectedChartType === 'scatter') {
        return { x: xAxisSelect.value, series: [{ column: getYColumns()[0] }], raw: true };
    }
    return { x: xAxisSelect.value, series: getYColumns().map(column => ({ column: column, agg: 'sum' })), sort: 'none' };
}

async function fetchChartData() {
    const response = await fetch(`/dataset-data/${currentDataset.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildQuerySpec())
    });
    let result = {};
    try {
        result = await response.json();
    } catch (e) {
        // non-JSON reply (server error page)
    }
    if (!response.ok || !result.success) {
        throw new Error(result.error || `Server error (${response.status})`);
    }
    return result;
}

// Returns the raw server result; FluxionChart (chart_render.js) turns it into a chart.
async function prepareChartData() {
    return await fetchChartData();
}

// One name per colour picker in the Customise panel
function getSeriesNames() {
    if (FluxionTypes.fields(selectedChartType) === 'x') return [xAxisSelect.value || 'Value'];
    const ys = getYColumns();
    if (!ys.length) return ['Series 1'];
    return FluxionTypes.seriesNames(selectedChartType, ys);
}

// Re-draw with the last server result (no refetch), e.g. after a Customise change
function rerenderPreview() {
    if (lastResult && currentChart) createChart(lastResult);
}

function createChart(result) {
    lastResult = result;
    if (currentChart) {
        currentChart.destroy();
    }
    const title = chartTitle.value || defaultTitle();
    const config = FluxionChart.buildConfig(result, selectedChartType, colorScheme.value, {
        chartTitle: title,
        options: FluxionOptionsPanel.get(),
        maintainAspectRatio: false
    });
    currentChart = new Chart(chartCanvas.getContext('2d'), config);
}

// Save as a brand new chart (normal, non-edit flow)
function handleSaveChart() {
    if (!currentChart) {
        alert('Please create a chart first');
        return;
    }
    if (!currentDataset || !currentDataset.id) {
        alert('No dataset loaded. Please go back to dashboard and upload a file first.');
        return;
    }

    const chartConfig = buildChartConfigPayload();

    saveChartBtn.disabled = true;
    saveChartBtn.textContent = 'Saving...';

    fetch('/save-chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chartConfig)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert('Chart saved successfully!\n\nYou can view it in "My Charts" page.');
            const goToCharts = confirm('Would you like to go to My Charts page now?');
            if (goToCharts) {
                window.location.href = '/charts';
            }
        } else {
            alert('Error saving chart: ' + (data.error || 'Unknown error'));
        }
    })
    .catch(error => {
        console.error('Error saving chart:', error);
        alert('Error saving chart: ' + error.message);
    })
    .finally(() => {
        saveChartBtn.disabled = false;
        saveChartBtn.textContent = editingChartId ? 'Update Chart' : 'Save Chart';
    });
}

// Update the existing chart in place (edit flow) -- PUT, not POST, no dataset_id change needed
function handleUpdateExistingChart() {
    if (!currentChart) {
        alert('Please build the chart first');
        return;
    }

    const chartConfig = buildChartConfigPayload();

    saveChartBtn.disabled = true;
    saveChartBtn.textContent = 'Updating...';

    fetch(`/update-chart/${editingChartId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chartConfig)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            window.location.href = '/charts';
        } else {
            alert('Error updating chart: ' + (data.error || 'Unknown error'));
            saveChartBtn.disabled = false;
            saveChartBtn.textContent = 'Update Chart';
        }
    })
    .catch(error => {
        console.error('Error updating chart:', error);
        alert('Error updating chart: ' + error.message);
        saveChartBtn.disabled = false;
        saveChartBtn.textContent = 'Update Chart';
    });
}

function buildChartConfigPayload() {
    const chartConfig = {
        title: chartTitle.value || defaultTitle(),
        chart_type: selectedChartType,
        dataset_id: currentDataset.id,
        color_scheme: colorScheme.value,
        chart_options: FluxionOptionsPanel.get()
    };

    if (usesLabelValue(selectedChartType)) {
        chartConfig.value_column = valueSelect.value;
        chartConfig.label_column = labelSelect.value;
    } else {
        const yColumns = getYColumns();
        chartConfig.x_axis = xAxisSelect.value;
        chartConfig.y_axes = yColumns;
        chartConfig.y_axis = yColumns[0] || '';
    }

    Object.assign(chartConfig, widgetConfig());
    return chartConfig;
}

function handleDownloadChart() {
    if (!currentChart) {
        alert('Please create a chart first');
        return;
    }
    const link = document.createElement('a');
    link.download = `${chartTitle.value || 'chart'}.png`;
    link.href = chartCanvas.toDataURL();
    link.click();
}

window.addEventListener('beforeunload', function() {
    if (currentChart) {
        currentChart.destroy();
    }
});