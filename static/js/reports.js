// Reports Page JavaScript

let modalChartInstances = [];
let currentReportData = null;
let renderToken = 0; 

// View report in modal
async function viewReportModal(reportId) {
    try {
        const response = await fetch(`/get-report/${reportId}`);
        const data = await response.json();

        if (data.success) {
            currentReportData = data.report;
            openReportModal(data.report);
        } else {
            alert('Error loading report: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error fetching report:', error);
        alert('Error loading report. Please try again.');
    }
}

function openReportModal(report) {
    const modal = document.getElementById('reportModal');
    const modalTitle = document.getElementById('modalReportTitle');
    const modalBody = document.getElementById('reportModalBody');
    const shareBtn = document.getElementById('shareReportBtn');
    const embedBtn = document.getElementById('embedReportBtn');

    modalTitle.textContent = report.title;
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';

    // Build one panel + canvas per chart in the report
    modalBody.innerHTML = '';
    destroyModalCharts();

    if (!report.charts || report.charts.length === 0) {
        modalBody.innerHTML = '<p style="text-align:center; padding: 2rem 0;">This report has no charts left to show — they may have been deleted.</p>';
    } else {
        report.charts.forEach((chart, index) => {
            const panel = document.createElement('div');
            panel.className = 'report-chart-panel';
            const heading = document.createElement('h4');
            heading.textContent = chart.title;
            const wrap = document.createElement('div');
            wrap.className = 'report-chart-panel-canvas-wrap';
            const canvasEl = document.createElement('canvas');
            canvasEl.id = `reportChartCanvas${index}`;
            wrap.appendChild(canvasEl);
            panel.appendChild(heading);
            panel.appendChild(wrap);
            modalBody.appendChild(panel);
        });
    }

    shareBtn.onclick = () => shareReport(report.id, report.is_public);
    embedBtn.onclick = () => embedReport(report.id, report.is_public);
    document.getElementById('unshareReportBtn').onclick = () => unshareReport(report.id);
    refreshShareButtons(report);
    setTimeout(() => {
        renderModalCharts(report);
    }, 100);
}

function renderModalCharts(report) {
    const myToken = ++renderToken;
    (report.charts || []).forEach((chart, index) => renderOneModalChart(chart, index, myToken));
}

async function renderOneModalChart(chart, index, myToken) {
    const canvas = document.getElementById(`reportChartCanvas${index}`);
    if (!canvas) return;

    let result;
    try {
        const response = await fetch(`/chart-data/${chart.id}`);
        result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || `Server error (${response.status})`);
        }
    } catch (error) {
        console.error('Error loading chart data:', error);
        if (myToken !== renderToken) return;
        const msg = document.createElement('p');
        msg.textContent = 'Could not load this chart: ' + error.message;
        msg.style.textAlign = 'center';
        canvas.parentElement.replaceChildren(msg);
        return;
    }

    // Modal closed, or another report opened, while we waited
    const modal = document.getElementById('reportModal');
    if (myToken !== renderToken || !modal.classList.contains('show')) return;

    modalChartInstances.push(new Chart(
        canvas.getContext('2d'),
        FluxionChart.buildConfig(
            result,
            chart.chart_type,
            chart.config.color_scheme,
            { maintainAspectRatio: false }
        )
    ));
}

function destroyModalCharts() {
    modalChartInstances.forEach(instance => instance.destroy());
    modalChartInstances = [];
}

function closeReportModal() {
    const modal = document.getElementById('reportModal');
    modal.classList.remove('show');
    document.body.style.overflow = 'auto';
    destroyModalCharts();
}
// Delete report
function deleteReport(reportId, reportTitle) {
    const confirmed = confirm(`Are you sure you want to delete "${reportTitle}"?\n\nThis only deletes the report — the individual charts inside it are kept.`);

    if (confirmed) {
        const reportCard = event.target.closest('.report-card');
        if (reportCard) {
            reportCard.style.opacity = '0.5';
            reportCard.style.pointerEvents = 'none';
        }

        fetch(`/delete-report/${reportId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                if (reportCard) {
                    reportCard.style.transition = 'all 0.3s ease';
                    reportCard.style.transform = 'scale(0)';
                    setTimeout(() => {
                        reportCard.remove();
                        const remaining = document.querySelectorAll('.report-card');
                        if (remaining.length === 0) {
                            window.location.reload();
                        }
                    }, 300);
                }
                showAlert('Report deleted successfully!', 'success');
            } else {
                showAlert(data.error || 'Failed to delete report', 'error');
                if (reportCard) {
                    reportCard.style.opacity = '1';
                    reportCard.style.pointerEvents = 'auto';
                }
            }
        })
        .catch(error => {
            console.error('Error deleting report:', error);
            showAlert('Error deleting report. Please try again.', 'error');
            if (reportCard) {
                reportCard.style.opacity = '1';
                reportCard.style.pointerEvents = 'auto';
            }
        });
    }
}

// Embed report — gets (or generates) the share link, wraps as <iframe>, copies it
async function embedReport(reportId, isCurrentlyPublic) {
    let shareUrl;

    if (isCurrentlyPublic && currentReportData.share_token) {
        shareUrl = window.location.origin + '/shared-report/' + currentReportData.share_token;
    } else {
        try {
            const response = await fetch(`/share-report/${reportId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            if (!data.success) {
                showAlert(data.error || 'Failed to generate embed code', 'error');
                return;
            }
            shareUrl = data.share_url;
            currentReportData.is_public = true;
            currentReportData.share_token = data.share_token;
        } catch (error) {
            console.error('Error generating embed code:', error);
            showAlert('Error generating embed code', 'error');
            return;
        }
    }

    const embedCode = `<iframe src="${shareUrl}" width="100%" height="800" frameborder="0" style="border:1px solid #E3E9E6;border-radius:12px;"></iframe>`;
    copyToClipboard(embedCode);
    refreshShareButtons(currentReportData);
    showAlert('Embed code copied to clipboard!', 'success');
}

// Share report
async function shareReport(reportId, isCurrentlyPublic) {
    const shareBtn = document.getElementById('shareReportBtn');

    if (isCurrentlyPublic && currentReportData.share_token) {
        const shareUrl = window.location.origin + '/shared-report/' + currentReportData.share_token;
        copyToClipboard(shareUrl);
        showAlert('Share link copied to clipboard!', 'success');
        return;
    }

    shareBtn.disabled = true;
    shareBtn.textContent = 'Generating...';

    try {
        const response = await fetch(`/share-report/${reportId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (data.success) {
            copyToClipboard(data.share_url);
            shareBtn.textContent = 'Copy Link';
            shareBtn.classList.add('btn-success');
            currentReportData.is_public = true;
            currentReportData.share_token = data.share_token;
            refreshShareButtons(currentReportData);
            showAlert('Report is now public! Link copied to clipboard.', 'success');
        } else {
            showAlert(data.error || 'Failed to generate share link', 'error');
        }
    } catch (error) {
        console.error('Error sharing report:', error);
        showAlert('Error generating share link', 'error');
    } finally {
        shareBtn.disabled = false;
    }
}

// One place decides what the Share / Unshare buttons look like
function refreshShareButtons(report) {
    const shareBtn = document.getElementById('shareReportBtn');
    const unshareBtn = document.getElementById('unshareReportBtn');
    const isPublic = !!(report.is_public && report.share_token);
    shareBtn.textContent = isPublic ? 'Copy Link' : 'Share';
    shareBtn.classList.toggle('btn-success', isPublic);
    unshareBtn.style.display = isPublic ? '' : 'none';
}

// Unshare report: the public link and any embeds stop working
async function unshareReport(reportId) {
    if (!confirm('Stop sharing this report?\n\nAnyone with the link, and any page that embeds it, will lose access.')) return;

    const unshareBtn = document.getElementById('unshareReportBtn');
    unshareBtn.disabled = true;
    try {
        const response = await fetch(`/unshare-report/${reportId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || `Server error (${response.status})`);
        }
        if (currentReportData && currentReportData.id === reportId) {
            currentReportData.is_public = false;
            refreshShareButtons(currentReportData);
        }
        showAlert('Report is now private.', 'success');
    } catch (error) {
        console.error('Error unsharing report:', error);
        showAlert('Could not unshare: ' + error.message, 'error');
    } finally {
        unshareBtn.disabled = false;
    }
}

function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
    } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    }
}

function showAlert(message, type = 'info') {
    let flashContainer = document.querySelector('.flash-messages');
    if (!flashContainer) {
        flashContainer = document.createElement('div');
        flashContainer.className = 'flash-messages';
        document.body.appendChild(flashContainer);
    }

    const alertEl = document.createElement('div');
    alertEl.className = `alert alert-${type}`;
    const text = document.createElement('span');
    text.textContent = message;
    alertEl.appendChild(text);
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'alert-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = () => alertEl.remove();
    alertEl.appendChild(closeBtn);

    flashContainer.appendChild(alertEl);

    setTimeout(() => {
        alertEl.style.opacity = '0';
        setTimeout(() => alertEl.remove(), 300);
    }, 5000);
}

document.addEventListener('DOMContentLoaded', function() {
    initReportListControls();

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const modal = document.getElementById('reportModal');
            if (modal && modal.classList.contains('show')) {
                closeReportModal();
            }
        }
    });
});

// Search + sort for the report grid (pure client-side)
function initReportListControls() {
    const searchInput = document.getElementById('reportSearchInput');
    const sortSelect = document.getElementById('reportSortSelect');
    const grid = document.getElementById('reportsGrid');
    if (!searchInput || !sortSelect || !grid) return;

    function applyFilters() {
        const query = searchInput.value.trim().toLowerCase();
        const cards = Array.from(grid.querySelectorAll('.report-card'));

        cards.forEach(card => {
            const matches = card.dataset.title.includes(query);
            card.style.display = matches ? '' : 'none';
        });

        const sortValue = sortSelect.value;
        const sorted = cards.sort((a, b) => {
            if (sortValue === 'title-asc') return a.dataset.title.localeCompare(b.dataset.title);
            if (sortValue === 'title-desc') return b.dataset.title.localeCompare(a.dataset.title);
            if (sortValue === 'date-asc') return new Date(a.dataset.date) - new Date(b.dataset.date);
            return new Date(b.dataset.date) - new Date(a.dataset.date);
        });
        sorted.forEach(card => grid.appendChild(card));
    }

    searchInput.addEventListener('input', applyFilters);
    sortSelect.addEventListener('change', applyFilters);
}