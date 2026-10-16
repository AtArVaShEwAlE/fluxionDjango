// Chart Creation JavaScript

let currentDataset = null;
let currentChart = null;
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
const valueGroup = document.getElementById('valueGroup');
const labelGroup = document.getElementById('labelGroup');
const editBanner = document.getElementById('editBanner');
const editBannerTitle = document.getElementById('editBannerTitle');

const chartTypeButtons = document.querySelectorAll('.chart-type-btn');
let selectedChartType = 'bar';

const colorSchemes = {
    default: ['#1F9D6E', '#34C08D', '#157A56', '#6EE7B7', '#0E5C40'],
    blue: ['#3B82F6', '#2563EB', '#1D4ED8', '#1E40AF', '#1E3A8A'],
    purple: ['#8B5CF6', '#7C3AED', '#6D28D9', '#5B21B6', '#4C1D95'],
    rainbow: ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#3B82F6', '#8B5CF6']
};

document.addEventListener('DOMContentLoaded', function() {
    initializePage();
});

function initializePage() {
    const params = new URLSearchParams(window.location.search);
    const editId = params.get('edit');

    if (editId) {
        loadChartForEditing(parseInt(editId, 10));
    } else {
        const datasetJson = sessionStorage.getItem('currentDataset');
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
        if (chart.chart_type === 'pie') {
            valueSelect.value = config.value_column || '';
            labelSelect.value = config.label_column || '';
        } else {
            xAxisSelect.value = config.x_axis || '';
            yAxisSelect.value = config.y_axis || '';
        }
        colorScheme.value = config.color_scheme || 'default';

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

function initializeChartBuilder() {
    populateColumnSelects();
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
    valueSelect.addEventListener('change', validateSelections);
    labelSelect.addEventListener('change', validateSelections);
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
    if (selectedChartType === 'pie') {
        yAxisGroup.style.display = 'none';
        valueGroup.style.display = 'block';
        labelGroup.style.display = 'block';
    } else {
        yAxisGroup.style.display = 'block';
        valueGroup.style.display = 'none';
        labelGroup.style.display = 'none';
    }
}

function validateSelections() {
    let isValid = false;
    if (selectedChartType === 'pie') {
        isValid = valueSelect.value !== '' && labelSelect.value !== '';
    } else {
        isValid = xAxisSelect.value !== '' && yAxisSelect.value !== '';
    }
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
    if (selectedChartType === 'pie') {
        return { x: labelSelect.value, series: [{ column: valueSelect.value, agg: 'sum' }], sort: 'none' };
    }
    if (selectedChartType === 'scatter') {
        return { x: xAxisSelect.value, series: [{ column: yAxisSelect.value }], raw: true };
    }
    return { x: xAxisSelect.value, series: [{ column: yAxisSelect.value, agg: 'sum' }], sort: 'none' };
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

function toChartJsData(result) {
    const labels = result.labels;
    const series = result.series[0];
    const values = series.values;

    if (selectedChartType === 'pie') {
        const pl = [];
        const pv = [];
        labels.forEach((label, i) => {
            if (values[i] !== null) {
                pl.push(label);
                pv.push(values[i]);
            }
        });
        return { labels: pl, datasets: [{ data: pv, backgroundColor: getColors(pv.length) }] };
    }

    if (selectedChartType === 'scatter') {
        const points = [];
        labels.forEach((label, i) => {
            if (values[i] === null) return;
            const x = Number(label);
            points.push({ x: Number.isFinite(x) ? x : i, y: values[i] });
        });
        return {
            datasets: [{
                label: series.column,
                data: points,
                backgroundColor: colorSchemes[colorScheme.value][0]
            }]
        };
    }

    return {
        labels: labels,
        datasets: [{
            label: series.column,
            data: values,
            backgroundColor: getColors(values.length),
            borderColor: colorSchemes[colorScheme.value][0],
            borderWidth: selectedChartType === 'line' ? 2 : 1
        }]
    };
}

async function prepareChartData() {
    return toChartJsData(await fetchChartData());
}

function getColors(count) {
    const scheme = colorSchemes[colorScheme.value];
    const colors = [];
    for (let i = 0; i < count; i++) {
        colors.push(scheme[i % scheme.length]);
    }
    return colors;
}

function createChart(data) {
    if (currentChart) {
        currentChart.destroy();
    }
    const ctx = chartCanvas.getContext('2d');
    const title = chartTitle.value || `${selectedChartType.charAt(0).toUpperCase() + selectedChartType.slice(1)} Chart`;
    const config = {
        type: selectedChartType,
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: title,
                    font: { size: 16, weight: 'bold' },
                    color: '#10201A'
                },
                legend: {
                    display: selectedChartType === 'pie',
                    position: 'bottom',
                    labels: { color: '#55655F' }
                }
            },
            scales: selectedChartType !== 'pie' ? {
                y: {
                    beginAtZero: true,
                    grid: { color: '#E3E9E6' },
                    ticks: { color: '#55655F' }
                },
                x: {
                    grid: { color: '#E3E9E6' },
                    ticks: { color: '#55655F' }
                }
            } : {}
        }
    };
    currentChart = new Chart(ctx, config);
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
        title: chartTitle.value || `${selectedChartType.charAt(0).toUpperCase() + selectedChartType.slice(1)} Chart`,
        chart_type: selectedChartType,
        dataset_id: currentDataset.id,
        color_scheme: colorScheme.value
    };

    if (selectedChartType === 'pie') {
        chartConfig.value_column = valueSelect.value;
        chartConfig.label_column = labelSelect.value;
    } else {
        chartConfig.x_axis = xAxisSelect.value;
        chartConfig.y_axis = yAxisSelect.value;
    }

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