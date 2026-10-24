// Live Data Visualization JavaScript

// Global Variables
let socket = null;
let liveChart = null;
let sessionId = null;
let isStreaming = false;
let isPaused = false;
let dataBuffer = [];
let animationFrame = null;
let apiErrorCount = 0;     // API replies skipped this run (bad value / request failed)
let lastApiNotice = 0;     // ms timestamp of last notice shown

// DOM Elements
const exportImageBtn = document.getElementById('exportImageBtn');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const dataSource = document.getElementById('dataSource');
const liveChartType = document.getElementById('liveChartType');
const updateInterval = document.getElementById('updateInterval');
const maxDataPoints = document.getElementById('maxDataPoints');
const animationSpeed = document.getElementById('animationSpeed');
const liveColorScheme = document.getElementById('liveColorScheme');

// Dataset elements
const datasetGroup = document.getElementById('datasetGroup');
const datasetSelect = document.getElementById('datasetSelect');
const xColumnGroup = document.getElementById('xColumnGroup');
const yColumnGroup = document.getElementById('yColumnGroup');
const xColumnSelect = document.getElementById('xColumnSelect');
const yColumnSelect = document.getElementById('yColumnSelect');

// API elements
const apiUrlGroup = document.getElementById('apiUrlGroup');
const apiValuePathGroup = document.getElementById('apiValuePathGroup');
const apiLabelPathGroup = document.getElementById('apiLabelPathGroup');
const apiTestGroup = document.getElementById('apiTestGroup');
const apiUrl = document.getElementById('apiUrl');
const apiValuePath = document.getElementById('apiValuePath');
const apiLabelPath = document.getElementById('apiLabelPath');
const testApiBtn = document.getElementById('testApiBtn');
const apiTestResult = document.getElementById('apiTestResult');

const startStreamBtn = document.getElementById('startStreamBtn');
const pauseStreamBtn = document.getElementById('pauseStreamBtn');
const stopStreamBtn = document.getElementById('stopStreamBtn');
const clearDataBtn = document.getElementById('clearDataBtn');

const liveChartCanvas = document.getElementById('liveChart');
const chartPlaceholder = document.getElementById('chartPlaceholder');
const dataPointCount = document.getElementById('dataPointCount');
const latestValue = document.getElementById('latestValue');
const avgValue = document.getElementById('avgValue');

// Color Schemes
const colorSchemes = {
    default: ['#1F9D6E', '#34C08D', '#157A56', '#6EE7B7', '#0E5C40'],
    blue: ['#3B82F6', '#2563EB', '#1D4ED8', '#1E40AF', '#1E3A8A'],
    rainbow: ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#3B82F6', '#8B5CF6'],
    gradient: ['#667eea', '#764ba2', '#f093fb', '#4facfe'],
    dynamic: ['#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#f59e0b']
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    initializeWebSocket();
    setupEventListeners();
    sessionId = generateSessionId();
});

// Initialize WebSocket Connection
function initializeWebSocket() {
    socket = io();
    
    socket.on('connect', function() {
        updateStatus('connected', 'Connected');
        console.log('WebSocket connected');
    });
    
    socket.on('disconnect', function() {
        updateStatus('disconnected', 'Disconnected');
        console.log('WebSocket disconnected');
    });
    
    socket.on('new_data_point', function(data) {
        if (data.session_id === sessionId && !isPaused) {
            handleNewDataPoint(data.data);
        }
    });
    
    socket.on('error', function(data) {
        if (!data || data.session_id !== sessionId) return;
        apiErrorCount++;
        const now = Date.now();
        if (now - lastApiNotice < 5000) return;
        lastApiNotice = now;
        const safe = String(data.message || '').replace(/[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        showNotification('API problem (' + apiErrorCount + ' skipped so far): ' + safe, 'error');
    });

    socket.on('error', function(data) {
        testApiBtn.disabled = false;
        testApiBtn.textContent = '✅ API Ready';
        testApiBtn.style.background = '#10b981';
        testApiBtn.style.color = '#fff';
        apiTestResult.innerHTML = '<span style="color: #10b981;">✅ Good to go!</span>';
        console.log('API sample data:', data.sample_data);
    });

    socket.on('api_test_failed', function(data) {
        testApiBtn.disabled = false;
        testApiBtn.textContent = '❌ Test Failed';
        testApiBtn.style.background = '#ef4444';
        testApiBtn.style.color = '#fff';
        apiTestResult.innerHTML = '<span style="color: #ef4444;">❌ ' + data.message + '</span>';
    });
}

// Setup Event Listeners
function setupEventListeners() {
    if (exportImageBtn) {
        exportImageBtn.addEventListener('click', exportChartAsImage);
    }
    
    startStreamBtn.addEventListener('click', startStream);
    pauseStreamBtn.addEventListener('click', togglePause);
    stopStreamBtn.addEventListener('click', stopStream);
    clearDataBtn.addEventListener('click', clearData);
    
    liveChartType.addEventListener('change', recreateChart);
    liveColorScheme.addEventListener('change', updateChartColors);
    
    dataSource.addEventListener('change', handleDataSourceChange);
    datasetSelect.addEventListener('change', handleDatasetSelection);
    testApiBtn.addEventListener('click', testApiEndpoint);
}

// Handle Data Source Change
function handleDataSourceChange() {
    const source = dataSource.value;
    
    // Hide all optional groups
    datasetGroup.style.display = 'none';
    xColumnGroup.style.display = 'none';
    yColumnGroup.style.display = 'none';
    apiUrlGroup.style.display = 'none';
    apiValuePathGroup.style.display = 'none';
    apiLabelPathGroup.style.display = 'none';
    apiTestGroup.style.display = 'none';
    
    // Show relevant groups
    if (source === 'dataset') {
        datasetGroup.style.display = 'block';
    } else if (source === 'api') {
        apiUrlGroup.style.display = 'block';
        apiValuePathGroup.style.display = 'block';
        apiLabelPathGroup.style.display = 'block';
        apiTestGroup.style.display = 'block';
    }
}

// Handle Dataset Selection
async function handleDatasetSelection() {
    const datasetId = datasetSelect.value;
    
    console.log('Dataset selected:', datasetId);
    
    if (!datasetId) {
        xColumnGroup.style.display = 'none';
        yColumnGroup.style.display = 'none';
        return;
    }
    
    try {
        console.log('Fetching columns for dataset:', datasetId);
        const response = await fetch(`/get-dataset-columns/${datasetId}`);
        console.log('Response status:', response.status);
        
        const data = await response.json();
        console.log('Response data:', data);
        
        if (data.success) {
            console.log('Columns received:', data.columns);
            
            // Populate column selects
            xColumnSelect.innerHTML = '<option value="">Select column...</option>';
            yColumnSelect.innerHTML = '<option value="">Select column...</option>';
            
            data.columns.forEach(col => {
                console.log('Adding column:', col);
                
                const xOption = document.createElement('option');
                xOption.value = col;
                xOption.textContent = col;
                xColumnSelect.appendChild(xOption);
                
                const yOption = document.createElement('option');
                yOption.value = col;
                yOption.textContent = col;
                yColumnSelect.appendChild(yOption);
            });
            
            // Show column groups
            xColumnGroup.style.display = 'block';
            yColumnGroup.style.display = 'block';
        } else {
            console.error('API returned error:', data.error);
            alert('Error loading columns: ' + data.error);
        }
    } catch (error) {
        console.error('Error fetching columns:', error);
        alert('Error loading dataset columns: ' + error.message);
    }
}

// Test API Endpoint
function testApiEndpoint() {
    const url = apiUrl.value;
    
    if (!url) {
        alert('Please enter an API URL');
        return;
    }
    
    testApiBtn.disabled = true;
    testApiBtn.textContent = '🔄 Testing...';
    apiTestResult.textContent = '';
    
    socket.emit('test_api_endpoint', { api_url: url });
}

// Start Live Stream
function startStream() {
    if (isStreaming) return;
    
    const source = dataSource.value;
    const interval = parseInt(updateInterval.value);
    const chartType = liveChartType.value;
    
    // Validate based on source
    if (source === 'dataset') {
        const datasetId = datasetSelect.value;
        const xCol = xColumnSelect.value;
        const yCol = yColumnSelect.value;
        
        if (!datasetId || !xCol || !yCol) {
            alert('Please select a dataset and both columns');
            return;
        }
        
        // Start dataset streaming
        socket.emit('stream_from_dataset', {
            session_id: sessionId,
            dataset_id: datasetId,
            interval: interval,
            x_column: xCol,
            y_column: yCol
        });
        
    } else if (source === 'api') {
        const url = apiUrl.value;
        const valuePath = apiValuePath.value;
        const labelPath = apiLabelPath.value;
        
        if (!url) {
            alert('Please enter an API endpoint URL');
            return;
        }
        
        // Start API streaming
        socket.emit('stream_from_api', {
            session_id: sessionId,
            api_url: url,
            interval: interval,
            value_path: valuePath,
            label_path: labelPath
        });
        
        // Update test button state
        testApiBtn.textContent = '🔴 Streaming...';
        testApiBtn.disabled = true;
        testApiBtn.style.background = '#ef4444';
        testApiBtn.style.color = '#fff';
        
    } else {
        // Start simulation
        socket.emit('start_simulation', {
            session_id: sessionId,
            chart_type: chartType,
            interval: interval
        });
    }
    
    apiErrorCount = 0;
        lastApiNotice = 0;
        isStreaming = true;
    isPaused = false;
    
    // Update UI
    updateStatus('streaming', 'Streaming');
    startStreamBtn.disabled = true;
    pauseStreamBtn.disabled = false;
    stopStreamBtn.disabled = false;
    chartPlaceholder.style.display = 'none';
    liveChartCanvas.classList.add('active');
    
    // Join session
    socket.emit('join_live_session', { session_id: sessionId });
    
    // Initialize chart if needed
    if (!liveChart) {
        initializeLiveChart();
    }
    
    // Start data flow animation
    startDataFlowAnimation();
}

// Toggle Pause
function togglePause() {
    isPaused = !isPaused;
    
    if (isPaused) {
        updateStatus('paused', 'Paused');
        pauseStreamBtn.innerHTML = '▶️ Resume';
        stopDataFlowAnimation();
    } else {
        updateStatus('streaming', 'Streaming');
        pauseStreamBtn.innerHTML = '⏸️ Pause';
        startDataFlowAnimation();
    }
}

// Stop Stream
function stopStream() {
    isStreaming = false;
    isPaused = false;
    
    updateStatus('connected', 'Connected');
    startStreamBtn.disabled = false;
    pauseStreamBtn.disabled = true;
    stopStreamBtn.disabled = true;
    pauseStreamBtn.innerHTML = '⏸️ Pause';
    
    // Reset API test button
    if (testApiBtn) {
        testApiBtn.disabled = false;
        testApiBtn.textContent = '🔍 Test API Endpoint';
        testApiBtn.style.background = '';
        testApiBtn.style.color = '';
    }

    socket.emit('stop_stream', { session_id: sessionId });
    // Leave session
    socket.emit('leave_live_session', { session_id: sessionId });
    
    // Stop animations
    stopDataFlowAnimation();
}

// Clear Data
function clearData() {
    dataBuffer = [];
    
    if (liveChart) {
        liveChart.data.labels = [];
        liveChart.data.datasets[0].data = [];
        liveChart.update('none');
    }
    
    updateStats();
}

// Initialize Live Chart
function initializeLiveChart() {
    const ctx = liveChartCanvas.getContext('2d');
    const chartType = liveChartType.value;
    const speed = parseInt(animationSpeed.value);
    
    liveChart = new Chart(ctx, {
        type: chartType === 'gauge' ? 'doughnut' : chartType,
        data: {
            labels: [],
            datasets: [{
                label: 'Live Data',
                data: [],
                backgroundColor: getColors(1)[0],
                borderColor: getColors(1)[0],
                borderWidth: 2,
                tension: 0.4,
                fill: chartType === 'line' ? false : true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: speed
            },
            scales: chartType !== 'gauge' ? {
                y: {
                    beginAtZero: true,
                    grid: { color: '#E3E9E6' },
                    color: '#55655F'
                },
                x: {
                    grid: { color: '#E3E9E6' },
                    ticks: { 
                        color: '#55655F',
                        maxTicksLimit: 10
                    }
                }
            } : {},
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            }
        }
    });
}

// Handle New Data Point
function handleNewDataPoint(dataPoint) {
    const maxPoints = parseInt(maxDataPoints.value);
    
    // Add to buffer
    dataBuffer.push(dataPoint);
    
    // Keep only max points
    if (dataBuffer.length > maxPoints) {
        dataBuffer.shift();
    }
    
    // Update chart
    updateChartWithData();
    
    // Update stats
    updateStats();
    
    // Animate data particle
    createDataParticle();
}

// Update Chart with Data
function updateChartWithData() {
    if (!liveChart) return;
    
    const labels = dataBuffer.map(d => d.timestamp || d.label);
    const values = dataBuffer.map(d => d.value);
    const scheme = liveColorScheme.value;
    
    liveChart.data.labels = labels;
    liveChart.data.datasets[0].data = values;
    
    // Update colors based on scheme
    if (scheme === 'dynamic') {
        liveChart.data.datasets[0].backgroundColor = getColors(values.length);
        liveChart.data.datasets[0].borderColor = getColors(values.length);
    } else if (scheme === 'gradient') {
        const gradientColors = colorSchemes.gradient;
        const colors = values.map((_, i) => {
            const index = Math.floor((i / values.length) * gradientColors.length);
            return gradientColors[index];
        });
        liveChart.data.datasets[0].backgroundColor = colors;
        liveChart.data.datasets[0].borderColor = colors;
    }
    
    liveChart.update('active');
}

// Update Statistics
function updateStats() {
    dataPointCount.textContent = dataBuffer.length;
    
    if (dataBuffer.length > 0) {
        const latest = dataBuffer[dataBuffer.length - 1].value;
        latestValue.textContent = latest.toFixed(2);
        
        const sum = dataBuffer.reduce((acc, d) => acc + d.value, 0);
        const avg = sum / dataBuffer.length;
        avgValue.textContent = avg.toFixed(2);
    } else {
        latestValue.textContent = '--';
        avgValue.textContent = '--';
    }
}

// Get Colors
function getColors(count) {
    const scheme = liveColorScheme.value;
    const colors = colorSchemes[scheme] || colorSchemes.default;
    const result = [];
    
    for (let i = 0; i < count; i++) {
        result.push(colors[i % colors.length]);
    }
    
    return result;
}

// Recreate Chart
function recreateChart() {
    if (liveChart) {
        liveChart.destroy();
        liveChart = null;
    }
    
    if (isStreaming) {
        initializeLiveChart();
        updateChartWithData();
    }
}

// Update Chart Colors
function updateChartColors() {
    if (liveChart && dataBuffer.length > 0) {
        updateChartWithData();
    }
}

// Update Status
function updateStatus(status, text) {
    statusDot.className = 'status-dot ' + status;
    statusText.textContent = text;
    
    if (status === 'streaming') {
        statusText.innerHTML = text + '<span class="spinner"></span>';
    }
}

// Data Flow Animation
function startDataFlowAnimation() {
    const nodes = document.querySelectorAll('.flow-node');
    const lines = document.querySelectorAll('.flow-line');
    
    nodes.forEach(node => node.classList.add('active'));
    lines.forEach(line => line.classList.add('active'));
    
    // Start particle animation loop
    createParticleLoop();
}

function stopDataFlowAnimation() {
    const nodes = document.querySelectorAll('.flow-node');
    const lines = document.querySelectorAll('.flow-line');
    
    nodes.forEach(node => node.classList.remove('active'));
    lines.forEach(line => line.classList.remove('active'));
    
    // Stop particle loop
    if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
    }
}

function createDataParticle() {
    const containers = document.querySelectorAll('.data-particles');
    
    containers.forEach((container, index) => {
        const particle = document.createElement('div');
        particle.className = 'data-particle';
        
        // Random vertical position
        const randomY = 30 + Math.random() * 40;
        particle.style.top = randomY + '%';
        
        container.appendChild(particle);
        
        // Remove after animation
        setTimeout(() => {
            particle.remove();
        }, 2000);
    });
}

function createParticleLoop() {
    if (!isStreaming || isPaused) return;
    
    createDataParticle();
    
    // Create particle every 500ms
    setTimeout(() => {
        animationFrame = requestAnimationFrame(createParticleLoop);
    }, 500);
}

// Utility Functions
function generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Export Chart as Image with Watermark
async function exportChartAsImage() {
    if (!liveChart) {
        alert('No chart to export');
        return;
    }
    
    try {
        const canvas = document.getElementById('liveChart');
        
        // Create a temporary canvas for watermark
        const watermarkedCanvas = document.createElement('canvas');
        watermarkedCanvas.width = canvas.width;
        watermarkedCanvas.height = canvas.height;
        const ctx = watermarkedCanvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, watermarkedCanvas.width, watermarkedCanvas.height);
        // Draw original chart
        ctx.drawImage(canvas, 0, 0);
        
        // Add watermark
        await addWatermark(ctx, watermarkedCanvas.width, watermarkedCanvas.height);
        
        // Convert to blob and download
        watermarkedCanvas.toBlob(function(blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `fluxion-chart-${Date.now()}.png`;
            document.body.appendChild(a);
            a.click();
            
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);
            
            showNotification('Chart exported successfully!', 'success');
        }, 'image/png');
        
    } catch (error) {
        console.error('Error exporting chart:', error);
        showNotification('Error exporting chart: ' + error.message, 'error');
    }
}

// Add Watermark to Canvas
async function addWatermark(ctx, width, height) {
    // Logo watermark (top-right corner)
    const logoPath = '/static/img/fluxionlogo.svg';
    
    try {
        const logo = await loadImage(logoPath);
        const logoWidth = 40;
        const logoHeight = (logo.height / logo.width) * logoWidth;
        
        // Draw logo with semi-transparency
        ctx.globalAlpha = 0.7;
        ctx.drawImage(logo, width - logoWidth - 20, 20, logoWidth, logoHeight);
        ctx.globalAlpha = 1.0;
    } catch (error) {
        console.warn('Could not load logo, using text watermark');
        // Fallback to text watermark
        ctx.font = 'bold 16px Arial';
        ctx.fillStyle = 'rgba(16, 32, 26, 0.55)';
        ctx.fillText('Fluxion', width - 100, 40);
    }
    
    // Timestamp
    const timestamp = new Date().toLocaleString();
    ctx.font = '10px Arial';
    ctx.fillStyle = 'rgba(16, 32, 26, 0.55)';
    ctx.textAlign = 'right';
    ctx.fillText(timestamp, width - 20, height - 20);
}

// Helper function to load images
function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

// Notification System
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <span>${message}</span>
        <button onclick="this.parentElement.remove()">×</button>
    `;
    
    // Add to page
    let container = document.querySelector('.notification-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'notification-container';
        document.body.appendChild(container);
    }
    
    container.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

// Cleanup on page unload
window.addEventListener('beforeunload', function() {
    if (socket && socket.connected) {
        socket.emit('leave_live_session', { session_id: sessionId });
        socket.disconnect();
    }
    
    if (liveChart) {
        liveChart.destroy();
    }
});