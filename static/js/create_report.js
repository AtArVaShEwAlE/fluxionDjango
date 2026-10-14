// Create Report Page JavaScript

let selectedChartIds = []; // preserves click order

document.addEventListener('DOMContentLoaded', function() {
    const checkboxes = document.querySelectorAll('.chart-picker-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', handleCheckboxChange);
    });

    const saveBtn = document.getElementById('saveReportBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', handleSaveReport);
    }
});

function handleCheckboxChange(e) {
    const checkbox = e.target;
    const item = checkbox.closest('.chart-picker-item');
    const chartId = parseInt(checkbox.value, 10);

    if (checkbox.checked) {
        item.classList.add('selected');
        if (!selectedChartIds.includes(chartId)) {
            selectedChartIds.push(chartId);
        }
    } else {
        item.classList.remove('selected');
        selectedChartIds = selectedChartIds.filter(id => id !== chartId);
    }

    renderOrderBadges();
    renderSummary();
}

function renderOrderBadges() {
    // Clear all badges first
    document.querySelectorAll('.chart-picker-order').forEach(badge => {
        badge.textContent = '';
    });

    // Number badges in selection order
    selectedChartIds.forEach((chartId, index) => {
        const badge = document.getElementById(`order-${chartId}`);
        if (badge) {
            badge.textContent = index + 1;
        }
    });
}

function renderSummary() {
    const summary = document.getElementById('reportSelectedSummary');
    if (!summary) return;

    if (selectedChartIds.length === 0) {
        summary.textContent = 'No charts selected yet';
        summary.classList.remove('has-selection');
    } else {
        summary.textContent = `${selectedChartIds.length} chart${selectedChartIds.length !== 1 ? 's' : ''} selected`;
        summary.classList.add('has-selection');
    }
}

function handleSaveReport() {
    const titleInput = document.getElementById('reportTitle');
    const title = titleInput.value.trim() || 'Untitled Report';
    const saveBtn = document.getElementById('saveReportBtn');

    if (selectedChartIds.length === 0) {
        alert('Please select at least one chart for the report');
        return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    fetch('/save-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            title: title,
            chart_ids: selectedChartIds
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            window.location.href = '/reports';
        } else {
            alert('Error saving report: ' + (data.error || 'Unknown error'));
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Report';
        }
    })
    .catch(error => {
        console.error('Error saving report:', error);
        alert('Error saving report: ' + error.message);
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Report';
    });
}