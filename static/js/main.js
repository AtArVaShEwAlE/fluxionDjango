// Main JavaScript for Fluxion Step 1

// Get DOM elements
const fileInput = document.getElementById('fileInput');
const loading = document.querySelector('.loading');
const dataInfo = document.getElementById('dataInfo');
const errorMsg = document.getElementById('errorMsg');

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    fileInput.addEventListener('change', handleFileUpload);
    
    // Create a simple test chart (only if canvas exists)
    const testCanvas = document.getElementById('testChart');
    if (testCanvas) {
        createTestChart();
    }
});

// Create a test chart to verify Chart.js is working
function createTestChart() {
    const ctx = document.getElementById('testChart').getContext('2d');
    
    new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['Red', 'Blue', 'Yellow', 'Green', 'Purple'],
            datasets: [{
                label: 'Test Data',
                data: [12, 19, 3, 5, 2],
                backgroundColor: ['#ff6384', '#36a2eb', '#ffce56', '#4bc0c0', '#9966ff'],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: 'Chart.js Test - It Works! 🎉'
                }
            }
        }
    });
}

// Handle file upload
async function handleFileUpload() {
    const file = fileInput.files[0];
    if (!file) return;

    // Show loading, hide previous results
    loading.style.display = 'block';
    dataInfo.style.display = 'none';
    errorMsg.style.display = 'none';

    // Create form data
    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            displayData(result.data);
        } else {
            showError(result.error);
        }
    } catch (error) {
        showError('Error uploading file: ' + error.message);
    } finally {
        loading.style.display = 'none';
    }
}

// Display uploaded data
function displayData(data) {
    // Update file info
    document.getElementById('fileName').textContent = `📄 ${data.filename}`;
    document.getElementById('rowCount').textContent = data.rows.toLocaleString();
    document.getElementById('colCount').textContent = data.columns;
    document.getElementById('fileSize').textContent = data.filename;

    // Build preview table
    buildPreviewTable(data);

    // Show the data info section
    dataInfo.style.display = 'block';
}

// Build the preview table
function buildPreviewTable(data) {
    const tableHead = document.getElementById('tableHead');
    const tableBody = document.getElementById('tableBody');
    
    // Clear previous content
    tableHead.innerHTML = '';
    tableBody.innerHTML = '';

    // Create header row
    const headerRow = document.createElement('tr');
    data.column_names.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col;
        headerRow.appendChild(th);
    });
    tableHead.appendChild(headerRow);

    // Create data rows
    data.preview.forEach(row => {
        const tr = document.createElement('tr');
        data.column_names.forEach(col => {
            const td = document.createElement('td');
            td.textContent = row[col] || '';
            tr.appendChild(td);
        });
        tableBody.appendChild(tr);
    });
}

// Show error message
function showError(message) {
    errorMsg.textContent = message;
    errorMsg.style.display = 'block';
}

// Utility function to format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}