// My Charts Page JavaScript

let currentModalChart = null;
let currentChartData = null;

// Color schemes (same as create_chart.js)
const colorSchemes = {
    default: ['#1F9D6E', '#34C08D', '#157A56', '#6EE7B7', '#0E5C40'],
    blue: ['#3B82F6', '#2563EB', '#1D4ED8', '#1E40AF', '#1E3A8A'],
    purple: ['#8B5CF6', '#7C3AED', '#6D28D9', '#5B21B6', '#4C1D95'],
    rainbow: ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#3B82F6', '#8B5CF6']
};

// View Chart in Modal
async function viewChartModal(chartId) {
    try {
        const response = await fetch(`/get-chart/${chartId}`);
        const data = await response.json();
        
        if (data.success) {
            currentChartData = data.chart;
            openChartModal(data.chart);
        } else {
            alert('Error loading chart: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error fetching chart:', error);
        alert('Error loading chart. Please try again.');
    }
}

// Open Modal and Render Chart
function openChartModal(chartData) {
    const modal = document.getElementById('chartModal');
    const modalTitle = document.getElementById('modalChartTitle');
    const modalEditBtn = document.getElementById('modalEditBtn');
    const downloadPNGBtn = document.getElementById('downloadChartPNG');
    const downloadPDFBtn = document.getElementById('downloadChartPDF');
    const shareBtn = document.getElementById('shareChartBtn');
    const embedBtn = document.getElementById('embedChartBtn');
    
    modalTitle.textContent = chartData.title;
    
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
    
    modalEditBtn.onclick = () => editChart(chartData.id);
    downloadPNGBtn.onclick = () => downloadChartAsPNG(chartData.title);
    downloadPDFBtn.onclick = () => downloadChartAsPDF(chartData.title);
    shareBtn.onclick = () => shareChart(chartData.id, chartData.is_public);
    embedBtn.onclick = () => embedChart(chartData.id, chartData.is_public);
    
    if (chartData.is_public && chartData.share_token) {
        shareBtn.textContent = 'Copy Link';
        shareBtn.classList.add('btn-success');
    } else {
        shareBtn.textContent = 'Share';
        shareBtn.classList.remove('btn-success');
    }
    
    setTimeout(() => {
        renderModalChart(chartData);
    }, 100);
}

// Close Modal
function closeChartModal() {
    const modal = document.getElementById('chartModal');
    modal.classList.remove('show');
    document.body.style.overflow = 'auto';
    
    if (currentModalChart) {
        currentModalChart.destroy();
        currentModalChart = null;
    }
}

// Render Chart in Modal
// Render Chart in Modal (data comes from the server, aggregated)
async function renderModalChart(chartData) {
    const canvas = document.getElementById('modalChartCanvas');
    const ctx = canvas.getContext('2d');

    if (currentModalChart) {
        currentModalChart.destroy();
        currentModalChart = null;
    }

    let result;
    try {
        const response = await fetch(`/chart-data/${chartData.id}`);
        result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || `Server error (${response.status})`);
        }
    } catch (error) {
        console.error('Error loading chart data:', error);
        showAlert('Could not load chart data: ' + error.message, 'error');
        return;
    }

    // Modal closed, or another chart opened, while we waited
    const modal = document.getElementById('chartModal');
    if (!modal.classList.contains('show') || currentChartData.id !== chartData.id) return;

    const preparedData = toChartJsData(result, chartData.chart_type, chartData.config.color_scheme);

    currentModalChart = new Chart(ctx, {
        type: chartData.chart_type,
        data: preparedData,
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                title: { display: false },
                legend: {
                    display: chartData.chart_type === 'pie',
                    position: 'bottom',
                    labels: { color: '#10201A' }
                }
            },
            scales: chartData.chart_type !== 'pie' ? {
                y: { beginAtZero: true, grid: { color: '#E3E9E6' }, ticks: { color: '#55655F' } },
                x: { grid: { color: '#E3E9E6' }, ticks: { color: '#55655F' } }
            } : {}
        }
    });
}

// Server result {labels, series, meta} -> Chart.js data
function toChartJsData(result, chartType, colorScheme) {
    const scheme = colorSchemes[colorScheme] ? colorScheme : 'default';
    const labels = result.labels;
    const series = result.series[0];
    const values = series.values;

    if (chartType === 'pie') {
        const pl = [];
        const pv = [];
        labels.forEach((label, i) => {
            if (values[i] !== null) {
                pl.push(label);
                pv.push(values[i]);
            }
        });
        return { labels: pl, datasets: [{ data: pv, backgroundColor: getColors(pv.length, scheme) }] };
    }

    if (chartType === 'scatter') {
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
                backgroundColor: colorSchemes[scheme][0]
            }]
        };
    }

    return {
        labels: labels,
        datasets: [{
            label: series.column,
            data: values,
            backgroundColor: getColors(values.length, scheme),
            borderColor: colorSchemes[scheme][0],
            borderWidth: chartType === 'line' ? 2 : 1,
            tension: chartType === 'line' ? 0.4 : 0
        }]
    };
}

// Get Colors from Scheme
function getColors(count, scheme = 'default') {
    const colors = colorSchemes[scheme] || colorSchemes.default;
    const result = [];
    
    for (let i = 0; i < count; i++) {
        result.push(colors[i % colors.length]);
    }
    
    return result;
}

// Embed Chart — gets (or generates) the share link, wraps it as an <iframe>, copies to clipboard
async function embedChart(chartId, isCurrentlyPublic) {
    let shareUrl;

    if (isCurrentlyPublic && currentChartData.share_token) {
        shareUrl = window.location.origin + '/shared/' + currentChartData.share_token;
    } else {
        try {
            const response = await fetch(`/share-chart/${chartId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            if (!data.success) {
                showAlert(data.error || 'Failed to generate embed code', 'error');
                return;
            }
            shareUrl = data.share_url;
            currentChartData.is_public = true;
            currentChartData.share_token = data.share_token;
        } catch (error) {
            console.error('Error generating embed code:', error);
            showAlert('Error generating embed code', 'error');
            return;
        }
    }

    const embedCode = `<iframe src="${shareUrl}" width="100%" height="600" frameborder="0" style="border:1px solid #E3E9E6;border-radius:12px;"></iframe>`;
    copyToClipboard(embedCode);
    showAlert('Embed code copied to clipboard!', 'success');
}

// Edit Chart — real flow now: send the user into Create Chart with this
// chart's dataset + settings preloaded, via a URL param the page reads on load.
function editChart(chartId) {
    window.location.href = `/create-chart?edit=${chartId}`;
}

// Delete Chart
function deleteChart(chartId, chartTitle) {
    const confirmed = confirm(`Are you sure you want to delete "${chartTitle}"?\n\nThis action cannot be undone.`);
    
    if (confirmed) {
        const chartCard = event.target.closest('.chart-card');
        if (chartCard) {
            chartCard.style.opacity = '0.5';
            chartCard.style.pointerEvents = 'none';
        }
        
        fetch(`/delete-chart/${chartId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                if (chartCard) {
                    chartCard.style.transition = 'all 0.3s ease';
                    chartCard.style.transform = 'scale(0)';
                    setTimeout(() => {
                        chartCard.remove();
                        const remainingCharts = document.querySelectorAll('.chart-card');
                        if (remainingCharts.length === 0) {
                            window.location.reload();
                        }
                    }, 300);
                }
                showAlert('Chart deleted successfully!', 'success');
            } else {
                showAlert(data.error || 'Failed to delete chart', 'error');
                if (chartCard) {
                    chartCard.style.opacity = '1';
                    chartCard.style.pointerEvents = 'auto';
                }
            }
        })
        .catch(error => {
            console.error('Error deleting chart:', error);
            showAlert('Error deleting chart. Please try again.', 'error');
            if (chartCard) {
                chartCard.style.opacity = '1';
                chartCard.style.pointerEvents = 'auto';
            }
        });
    }
}

// Show Alert Message
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
        setTimeout(() => {
            alertEl.remove();
        }, 300);
    }, 5000);
}

// Download Chart as PNG
function downloadChartAsPNG(title) {
    if (!currentModalChart) {
        alert('No chart to download');
        return;
    }
    
    const canvas = document.getElementById('modalChartCanvas');
    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `${title || 'chart'}.png`;
    link.href = url;
    link.click();
    
    showAlert('Chart downloaded as PNG!', 'success');
}

// Download Chart as PDF
function downloadChartAsPDF(title) {
    if (!currentModalChart) {
        alert('No chart to download');
        return;
    }
    
    if (typeof window.jspdf === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        script.onload = () => {
            generatePDF(title);
        };
        document.head.appendChild(script);
    } else {
        generatePDF(title);
    }
}

// Generate PDF from canvas
function generatePDF(title) {
    const canvas = document.getElementById('modalChartCanvas');
    const imgData = canvas.toDataURL('image/png');
    
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'px',
        format: [canvas.width, canvas.height]
    });
    
    pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
    pdf.save(`${title || 'chart'}.pdf`);
    
    showAlert('Chart downloaded as PDF!', 'success');
}

// Share Chart
async function shareChart(chartId, isCurrentlyPublic) {
    const shareBtn = document.getElementById('shareChartBtn');
    
    if (isCurrentlyPublic && currentChartData.share_token) {
        const shareUrl = window.location.origin + '/shared/' + currentChartData.share_token;
        copyToClipboard(shareUrl);
        showAlert('Share link copied to clipboard!', 'success');
        return;
    }
    
    shareBtn.disabled = true;
    shareBtn.textContent = 'Generating...';
    
    try {
        const response = await fetch(`/share-chart/${chartId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        
        if (data.success) {
            const shareUrl = data.share_url;
            
            copyToClipboard(shareUrl);
            
            shareBtn.textContent = 'Copy Link';
            shareBtn.classList.add('btn-success');
            
            currentChartData.is_public = true;
            currentChartData.share_token = data.share_token;
            
            showAlert('Chart is now public! Link copied to clipboard.', 'success');
        } else {
            showAlert(data.error || 'Failed to generate share link', 'error');
        }
    } catch (error) {
        console.error('Error sharing chart:', error);
        showAlert('Error generating share link', 'error');
    } finally {
        shareBtn.disabled = false;
    }
}

// Copy to clipboard helper
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

// Initialize page
document.addEventListener('DOMContentLoaded', function() {
    initListControls();

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const modal = document.getElementById('chartModal');
            if (modal.classList.contains('show')) {
                closeChartModal();
            }
        }
    });
});

// Search + sort for the chart grid (pure client-side, cards already in the DOM)
function initListControls() {
    const searchInput = document.getElementById('chartSearchInput');
    const sortSelect = document.getElementById('chartSortSelect');
    const grid = document.getElementById('chartsGrid');
    if (!searchInput || !sortSelect || !grid) return;

    function applyFilters() {
        const query = searchInput.value.trim().toLowerCase();
        const cards = Array.from(grid.querySelectorAll('.chart-card'));

        cards.forEach(card => {
            const matches = card.dataset.title.includes(query);
            card.style.display = matches ? '' : 'none';
        });

        const sortValue = sortSelect.value;
        const sorted = cards.sort((a, b) => {
            if (sortValue === 'title-asc') return a.dataset.title.localeCompare(b.dataset.title);
            if (sortValue === 'title-desc') return b.dataset.title.localeCompare(a.dataset.title);
            if (sortValue === 'date-asc') return new Date(a.dataset.date) - new Date(b.dataset.date);
            return new Date(b.dataset.date) - new Date(a.dataset.date); // date-desc default
        });
        sorted.forEach(card => grid.appendChild(card));
    }

    searchInput.addEventListener('input', applyFilters);
    sortSelect.addEventListener('change', applyFilters);
}