// Dashboard JavaScript

// DOM Elements
const fileInput = document.getElementById('fileInput');
const uploadArea = document.getElementById('uploadArea');
const loadingState = document.getElementById('loadingState');
const errorState = document.getElementById('errorState');
const dataPreview = document.getElementById('dataPreview');
const createChartBtn = document.getElementById('createChartBtn');
const cleanDataBtn = document.getElementById('cleanDataBtn');
const cleanDataPanel = document.getElementById('cleanDataPanel');
const cleanDataRows = document.getElementById('cleanDataRows');
const cancelCleanBtn = document.getElementById('cancelCleanBtn');
const applyCleanBtn = document.getElementById('applyCleanBtn');

// Current dataset
let currentDataset = null;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    initializeUpload();
});

function initializeUpload() {
    if (!fileInput || !uploadArea) {
        console.error('Upload elements not found');
        return;
    }

    fileInput.addEventListener('change', handleFileUpload);

    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);

    if (createChartBtn) {
        createChartBtn.addEventListener('click', handleCreateChart);
    }

    if (cleanDataBtn) {
        cleanDataBtn.addEventListener('click', openCleanPanel);
    }
    if (cancelCleanBtn) {
        cancelCleanBtn.addEventListener('click', closeCleanPanel);
    }
    if (applyCleanBtn) {
        applyCleanBtn.addEventListener('click', handleApplyClean);
    }
}

// Drag and Drop Handlers
function handleDragOver(e) {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        fileInput.files = files;
        handleFileUpload();
    }
}

// File Upload Handler
async function handleFileUpload() {
    const file = fileInput.files[0];
    if (!file) return;

    const validExtensions = ['csv', 'xlsx', 'xls'];
    const fileExtension = file.name.split('.').pop().toLowerCase();

    if (!validExtensions.includes(fileExtension)) {
        showErrorState('Invalid file type. Please upload CSV or Excel files only.');
        return;
    }

    const maxSize = 16 * 1024 * 1024;
    if (file.size > maxSize) {
        showErrorState('File size exceeds 16MB limit.');
        return;
    }

    showLoadingState();

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();

        if (result.success) {
            currentDataset = result.data;
            showDataPreview(result.data);
        } else {
            showErrorState(result.error || 'Upload failed');
        }
    } catch (error) {
        console.error('Upload error:', error);
        showErrorState('Error uploading file: ' + error.message);
    }
}

// Show different states
function showLoadingState() {
    if (uploadArea) uploadArea.style.display = 'none';
    if (errorState) errorState.style.display = 'none';
    if (dataPreview) dataPreview.style.display = 'none';
    if (loadingState) loadingState.style.display = 'block';
}

function showErrorState(message) {
    console.error('Error:', message);

    if (loadingState) loadingState.style.display = 'none';
    if (dataPreview) dataPreview.style.display = 'none';
    if (uploadArea) uploadArea.style.display = 'block';

    const errorMessageEl = document.getElementById('errorMessage');
    if (errorMessageEl) {
        errorMessageEl.textContent = message;
    }

    if (errorState) errorState.style.display = 'block';

    setTimeout(() => {
        if (errorState) errorState.style.display = 'none';
    }, 5000);
}

function showDataPreview(data) {
    if (loadingState) loadingState.style.display = 'none';
    if (errorState) errorState.style.display = 'none';
    if (uploadArea) uploadArea.style.display = 'none';

    const datasetTitleEl = document.getElementById('datasetTitle');
    const rowCountEl = document.getElementById('rowCount');
    const colCountEl = document.getElementById('colCount');
    const fileSizeEl = document.getElementById('fileSize');

    if (datasetTitleEl) datasetTitleEl.textContent = ` ${data.filename || 'Dataset'}`;
    if (rowCountEl) rowCountEl.textContent = (data.rows || 0).toLocaleString();
    if (colCountEl) colCountEl.textContent = data.columns || data.column_names?.length || 0;
        if (fileSizeEl) fileSizeEl.textContent = formatBytes(data.file_size || 0);

    // Build data table
    buildDataTable(data);

    // Build per-column quick stats
    buildColumnStats(data);

    // Show preview
    if (dataPreview) {
        dataPreview.style.display = 'block';
        setTimeout(() => {
            dataPreview.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }
}

function buildDataTable(data) {
    const tableHead = document.getElementById('tableHead');
    const tableBody = document.getElementById('tableBody');

    if (!tableHead || !tableBody) {
        console.error('Table elements not found');
        return;
    }

    tableHead.innerHTML = '';
    tableBody.innerHTML = '';

    const columns = data.column_names || [];

    if (columns.length === 0) {
        console.error('No columns found in data');
        return;
    }

    const headerRow = document.createElement('tr');
    columns.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col;
        th.title = col;
        headerRow.appendChild(th);
    });
    tableHead.appendChild(headerRow);

    const previewData = data.preview || [];

    if (previewData.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = columns.length;
        td.textContent = 'No data to preview';
        td.style.textAlign = 'center';
        td.style.padding = '2rem';
        tr.appendChild(td);
        tableBody.appendChild(tr);
        return;
    }

    const rowsToShow = Math.min(5, previewData.length);
    for (let i = 0; i < rowsToShow; i++) {
        const row = previewData[i];
        const tr = document.createElement('tr');

        columns.forEach(col => {
            const td = document.createElement('td');
            const cellValue = row[col] !== null && row[col] !== undefined ? String(row[col]) : '';
            td.textContent = cellValue;
            td.title = cellValue;
            tr.appendChild(td);
        });

        tableBody.appendChild(tr);
    }

    const tableFooter = document.getElementById('tableFooter');
    const showMoreBtn = document.getElementById('showMoreBtn');

    if (tableFooter && showMoreBtn) {
        if (previewData.length > rowsToShow) {
            tableFooter.style.display = 'block';
            showMoreBtn.onclick = () => showMoreRows(data);
        } else {
            tableFooter.style.display = 'none';
        }
    }
}

// Build the per-column quick-stats strip (numeric: min/max/mean, text: unique/top value)
function buildColumnStats(data) {
    const section = document.getElementById('columnStatsSection');
    const grid = document.getElementById('columnStatsGrid');
    if (!section || !grid) return;

    const stats = data.column_stats || {};
    const columns = data.column_names || [];

    if (!columns.length || Object.keys(stats).length === 0) {
        // Older datasets uploaded before this feature existed have no
        // column_stats saved — hide the section rather than show empty cards.
        section.style.display = 'none';
        return;
    }

    grid.innerHTML = '';

    columns.forEach(col => {
        const colStats = stats[col];
        if (!colStats) return;

        const card = document.createElement('div');
        card.className = 'stat-chip';

        const typeLabel = colStats.type === 'numeric' ? 'Number' : 'Text';
        let detailsHtml = '';

        if (colStats.type === 'numeric') {
            detailsHtml = `
                <div class="stat-chip-row"><span>Min</span><strong>${formatStatNumber(colStats.min)}</strong></div>
                <div class="stat-chip-row"><span>Max</span><strong>${formatStatNumber(colStats.max)}</strong></div>
                <div class="stat-chip-row"><span>Avg</span><strong>${formatStatNumber(colStats.mean)}</strong></div>
            `;
        } else {
            detailsHtml = `
                <div class="stat-chip-row"><span>Unique</span><strong>${colStats.unique ?? '—'}</strong></div>
                <div class="stat-chip-row"><span>Most common</span><strong title="${colStats.top ?? ''}">${truncateText(colStats.top, 14)}</strong></div>
            `;
        }

        const missingBadge = colStats.missing > 0
            ? `<span class="stat-chip-missing">${colStats.missing} missing</span>`
            : '';

        card.innerHTML = `
            <div class="stat-chip-header">
                <span class="stat-chip-name" title="${col}">${col}</span>
                <span class="stat-chip-type">${typeLabel}</span>
            </div>
            ${detailsHtml}
            ${missingBadge}
        `;

        grid.appendChild(card);
    });

    section.style.display = 'block';
}

function formatStatNumber(value) {
    if (value === null || value === undefined) return '—';
    return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function truncateText(text, maxLength) {
    if (!text) return '—';
    return text.length > maxLength ? text.slice(0, maxLength) + '…' : text;
}

// Build one row per column: rename input + drop checkbox
function openCleanPanel() {
    if (!currentDataset || !cleanDataPanel || !cleanDataRows) return;

    cleanDataRows.innerHTML = '';
    (currentDataset.column_names || []).forEach(col => {
        const row = document.createElement('div');
        row.className = 'clean-data-row';
        row.dataset.originalName = col;
        row.innerHTML = `
            <span class="clean-data-original" title="${col}">${col}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            <input type="text" class="form-control clean-data-rename-input" value="${col}">
            <label class="clean-data-drop-label">
                <input type="checkbox" class="clean-data-drop-checkbox">
                Drop
            </label>
        `;
        cleanDataRows.appendChild(row);
    });

    cleanDataPanel.style.display = 'block';
    cleanDataPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeCleanPanel() {
    if (cleanDataPanel) cleanDataPanel.style.display = 'none';
}

function handleApplyClean() {
    if (!currentDataset || !currentDataset.id) {
        alert('No dataset loaded');
        return;
    }

    const rename = {};
    const drop = [];

    document.querySelectorAll('.clean-data-row').forEach(row => {
        const original = row.dataset.originalName;
        const dropChecked = row.querySelector('.clean-data-drop-checkbox').checked;
        if (dropChecked) {
            drop.push(original);
            return;
        }
        const newName = row.querySelector('.clean-data-rename-input').value.trim();
        if (newName && newName !== original) {
            rename[original] = newName;
        }
    });

    if (drop.length === (currentDataset.column_names || []).length) {
        alert('Cannot drop every column');
        return;
    }

    applyCleanBtn.disabled = true;
    applyCleanBtn.textContent = 'Applying...';

    fetch(`/clean-dataset/${currentDataset.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rename, drop })
    })
    .then(response => response.json())
    .then(result => {
        if (result.success) {
            currentDataset = result.data;
            showDataPreview(currentDataset);
            closeCleanPanel();
        } else {
            alert('Error cleaning data: ' + (result.error || 'Unknown error'));
        }
    })
    .catch(error => {
        console.error('Error cleaning dataset:', error);
        alert('Error cleaning data: ' + error.message);
    })
    .finally(() => {
        applyCleanBtn.disabled = false;
        applyCleanBtn.textContent = 'Apply Changes';
    });
}

function showMoreRows(data) {
    const tableBody = document.getElementById('tableBody');
    if (!tableBody) return;

    const currentRows = tableBody.children.length;
    const previewData = data.preview || [];
    const columns = data.column_names || [];
    const totalRows = previewData.length;

    const endRow = Math.min(currentRows + 5, totalRows);

    for (let i = currentRows; i < endRow; i++) {
        const row = previewData[i];
        const tr = document.createElement('tr');

        columns.forEach(col => {
            const td = document.createElement('td');
            const cellValue = row[col] !== null && row[col] !== undefined ? String(row[col]) : '';
            td.textContent = cellValue;
            td.title = cellValue;
            tr.appendChild(td);
        });

        tableBody.appendChild(tr);
    }

    const tableFooter = document.getElementById('tableFooter');
    if (tableFooter && endRow >= totalRows) {
        tableFooter.style.display = 'none';
    }
}

function handleCreateChart() {
    if (!currentDataset) {
        alert('Please upload a dataset first');
        return;
    }

    sessionStorage.setItem('currentDataset', JSON.stringify(currentDataset));
    window.location.href = '/create-chart';
}

// Utility Functions
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function resetUpload() {
    if (uploadArea) uploadArea.style.display = 'block';
    if (loadingState) loadingState.style.display = 'none';
    if (errorState) errorState.style.display = 'none';
    if (dataPreview) dataPreview.style.display = 'none';
    if (fileInput) fileInput.value = '';
    currentDataset = null;
}