// Live Data page. Streams points over the WebSocket (streaming/consumers.py) and draws them with
// LiveCharts (live_charts.js): same chart types as saved charts, only the new point is added.
(function () {
    'use strict';
    const $ = id => document.getElementById(id);

    const dataSource = $('dataSource');
    const datasetGroup = $('datasetGroup');
    const datasetSelect = $('datasetSelect');
    const xGroup = $('xColumnGroup');
    const yGroup = $('yColumnGroup');
    const xSelect = $('xColumnSelect');
    const ySelect = $('yColumnSelect');
    const rowGroup = $('rowRangeGroup');
    const rowFrom = $('liveRowFrom');
    const rowTo = $('liveRowTo');
    const apiIds = ['apiUrlGroup', 'apiValuePathGroup', 'apiLabelPathGroup', 'apiTestGroup'];
    const typeSelect = $('liveChartType');
    const intervalInput = $('updateInterval');
    const maxInput = $('maxDataPoints');
    const speedSelect = $('animationSpeed');
    const schemeSelect = $('liveColorScheme');
    const startBtn = $('startStreamBtn');
    const pauseBtn = $('pauseStreamBtn');
    const stopBtn = $('stopStreamBtn');
    const clearBtn = $('clearDataBtn');
    const exportBtn = $('exportImageBtn');
    const shareBtn = $('shareImageBtn');
    const statusDot = $('statusDot');
    const statusText = $('statusText');
    const canvas = $('liveChart');
    const placeholder = $('chartPlaceholder');
    const statusLine = $('liveStatusLine');

    const controller = LiveCharts.create(canvas);
    let socket = null;
    let sessionId = null;
    let streaming = false;
    let paused = false;
    let queue = [];
    let received = 0;
    let rowStart = 1;
    let lastBlob = null;
    let apiErrors = 0;
    let lastApiNotice = 0;

    // ---------- small helpers ----------
    function fmt(v) {
        const n = Number(v);
        return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '--';
    }

    function clampInt(value, lo, hi, fallback) {
        const n = parseInt(value, 10);
        return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
    }

    function show(node, on) {
        if (node) node.style.display = on ? '' : 'none';
    }

    function notify(message, type) {
        let box = document.querySelector('.notification-container');
        if (!box) {
            box = document.createElement('div');
            box.className = 'notification-container';
            document.body.appendChild(box);
        }
        const note = document.createElement('div');
        note.className = 'notification notification-' + (type || 'info');
        const text = document.createElement('span');
        text.textContent = message;
        const close = document.createElement('button');
        close.type = 'button';
        close.innerHTML = '&times;';
        close.addEventListener('click', () => note.remove());
        note.append(text, close);
        box.appendChild(note);
        setTimeout(function () {
            note.classList.add('fade-out');
            setTimeout(() => note.remove(), 300);
        }, 4500);
    }

    function setStatus(kind, text) {
        statusDot.className = 'status-dot' + (kind ? ' ' + kind : '');
        statusText.textContent = text;
    }

    function setButtons() {
        startBtn.disabled = streaming;
        pauseBtn.disabled = !streaming;
        pauseBtn.textContent = paused ? 'Resume' : 'Pause';
        stopBtn.disabled = !streaming;
        dataSource.disabled = streaming;
        datasetSelect.disabled = streaming;
    }

    // ---------- stats + status line ----------
    function updateStats(lastPoint) {
        const pts = controller.points();
        $('dataPointCount').textContent = received.toLocaleString();
        $('latestValue').textContent = lastPoint ? fmt(lastPoint.value) : '--';
        $('avgValue').textContent = pts.length ? fmt(pts.reduce((a, p) => a + p.value, 0) / pts.length) : '--';
    }

    function setLine(point, finished) {
        if (!statusLine) return;
        if (!point) {
            statusLine.textContent = finished || 'Waiting for data...';
            statusLine.classList.remove('is-live');
            return;
        }
        const where = point.row ? 'Row ' + point.row + ' \u00B7 ' : '';
        statusLine.textContent = (finished ? finished + ' \u00B7 last: ' : 'Now fetching: ') + where + point.label + ' = ' + fmt(point.value);
        statusLine.classList.toggle('is-live', !finished);
    }

    // ---------- data flow card ----------
    function pulseFlow() {
        ['sourceNode', 'processNode', 'chartNode'].forEach(function (id, i) {
            const node = $(id);
            if (!node) return;
            setTimeout(function () {
                node.classList.add('active');
                setTimeout(() => node.classList.remove('active'), 450);
            }, i * 220);
        });
        ['dataParticles', 'dataParticles2'].forEach(function (id, i) {
            const box = $(id);
            if (!box) return;
            const dot = document.createElement('span');
            dot.className = 'data-particle';
            dot.style.animationDelay = (i * 0.2) + 's';
            box.appendChild(dot);
            setTimeout(() => dot.remove(), 2300);
        });
    }

    // ---------- adding points ----------
    function addPoint(point) {
        received += 1;
        placeholder.style.display = 'none';
        canvas.classList.add('active');
        controller.push(point);
        updateStats(point);
        setLine(point);
        pulseFlow();
    }

    function onPoint(msg) {
        if (!msg || !msg.data) return;
        if (msg.session_id !== undefined && String(msg.session_id) !== String(sessionId)) return;   // late point of an old run
        const d = msg.data;
        const value = Number(d.value);
        if (!Number.isFinite(value)) return;
        const label = d.label !== undefined && d.label !== null && d.label !== '' ? d.label : d.timestamp;
        const point = { label: String(label), value: value, row: typeof d.row_index === 'number' ? rowStart + d.row_index : null };
        if (paused) queue.push(point);
        else addPoint(point);
    }

    // ---------- start / pause / stop / clear ----------
    function newSession() {
        sessionId = 'live_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        return sessionId;
    }

    function resetRun() {
        controller.clear();
        queue = [];
        received = 0;
        apiErrors = 0;
        paused = false;
        canvas.classList.remove('active');
        placeholder.style.display = '';
        updateStats(null);
        setLine(null);
    }

    function startStream() {
        if (streaming) return;
        const source = dataSource.value;
        const interval = clampInt(intervalInput.value, 100, 5000, 1000);
        let payload;
        let event;
        if (source === 'dataset') {
            if (!datasetSelect.value || !xSelect.value || !ySelect.value) {
                notify('Choose a dataset, an X column and a Y column first', 'error');
                return;
            }
            const from = parseInt(rowFrom.value, 10);
            const to = parseInt(rowTo.value, 10);
            if (Number.isFinite(from) && Number.isFinite(to) && to < from) {
                notify('Rows: "to" must be at least "from"', 'error');
                return;
            }
            event = 'stream_from_dataset';
            payload = { dataset_id: Number(datasetSelect.value), x_column: xSelect.value, y_column: ySelect.value, interval: interval };
            if (Number.isFinite(from) && from >= 1) payload.row_from = from;
            if (Number.isFinite(to) && to >= 1) payload.row_to = to;
            rowStart = payload.row_from || 1;
        } else if (source === 'api') {
            const url = $('apiUrl').value.trim();
            if (!url) {
                notify('Enter the API endpoint URL first', 'error');
                return;
            }
            event = 'stream_from_api';
            payload = { api_url: url, interval: interval, value_path: $('apiValuePath').value.trim() || 'value', label_path: $('apiLabelPath').value.trim() || 'label' };
            rowStart = 1;
        } else {
            event = 'start_simulation';
            payload = { interval: interval };
            rowStart = 1;
        }
        resetRun();
        payload.session_id = newSession();
        socket.emit(event, payload);
        streaming = true;
        setStatus('streaming', 'Streaming...');
        setButtons();
    }

    function finish(label, kind) {
        streaming = false;
        paused = false;
        const pts = controller.points();
        setStatus(kind || 'connected', label);
        setLine(pts.length ? pts[pts.length - 1] : null, label);
        setButtons();
    }

    function stopStream() {
        if (!streaming) return;
        socket.emit('stop_stream', { session_id: sessionId });
        finish('Stopped');
    }

    function togglePause() {
        if (!streaming) return;
        paused = !paused;
        if (paused) {
            setStatus('paused', 'Paused');
        } else {
            setStatus('streaming', 'Streaming...');
            const waiting = queue;
            queue = [];
            waiting.forEach(addPoint);
        }
        setButtons();
    }

    function clearData() {
        resetRun();
        notify('Data cleared', 'info');
    }

    // ---------- save image + share ----------
    function fileName() {
        return 'live-' + typeSelect.value + '-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.png';
    }

        function pngBlob() {
        const cv = $('liveChart');
        let src = window.FluxionExtras ? window.FluxionExtras.hiRes(cv, 3) : cv;
        if (src === cv) {
            const o = document.createElement('canvas');
            o.width = cv.width;
            o.height = cv.height;
            const c = o.getContext('2d');
            if (!window.FluxionExtras || window.FluxionExtras.getExportBg()) {
                c.fillStyle = '#FFFFFF';
                c.fillRect(0, 0, o.width, o.height);
            }
            c.drawImage(cv, 0, 0);
            src = o;
        }
        return new Promise(resolve => src.toBlob(resolve, 'image/png'));
    }

    async function saveImage() {
        if (!controller.hasData()) {
            notify('Start a stream first, there is nothing to save yet', 'info');
            return;
        }
        const blob = await pngBlob();
        if (!blob) {
            notify('Could not create the image', 'error');
            return;
        }
        lastBlob = blob;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName();
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        shareBtn.disabled = false;
        notify('Image saved. You can share it now.', 'success');
    }

    async function shareImage() {
        if (!lastBlob) {
            notify('Save the image first', 'info');
            return;
        }
        const file = new File([lastBlob], fileName(), { type: 'image/png' });
        try {
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: 'Fluxion live chart' });
            } else if (navigator.clipboard && window.ClipboardItem) {
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': lastBlob })]);
                notify('Image copied. Paste it into any chat, mail or document.', 'success');
            } else {
                notify('Sharing is not supported in this browser. Use the saved PNG file.', 'info');
            }
        } catch (error) {
            if (error && error.name !== 'AbortError') notify('Could not share the image: ' + error.message, 'error');
        }
    }

    // ---------- source + dataset controls ----------
    function onSourceChange() {
        const source = dataSource.value;
        show(datasetGroup, source === 'dataset');
        show(xGroup, source === 'dataset');
        show(yGroup, source === 'dataset');
        show(rowGroup, source === 'dataset');
        apiIds.forEach(id => show($(id), source === 'api'));
    }

    async function onDatasetChange() {
        xSelect.length = 1;
        ySelect.length = 1;
        if (!datasetSelect.value) return;
        try {
            const response = await fetch('/get-dataset-columns/' + datasetSelect.value);
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.error || 'Server error (' + response.status + ')');
            data.columns.forEach(function (col) {
                [xSelect, ySelect].forEach(function (select) {
                    const option = document.createElement('option');
                    option.value = col;
                    option.textContent = col;
                    select.appendChild(option);
                });
            });
        } catch (error) {
            notify('Could not load the columns: ' + error.message, 'error');
        }
    }

    function testApi() {
        const url = $('apiUrl').value.trim();
        if (!url) {
            notify('Enter the API endpoint URL first', 'error');
            return;
        }
        $('apiTestResult').textContent = 'Testing...';
        socket.emit('test_api_endpoint', { api_url: url });
    }

    // ---------- socket ----------
    function connectSocket() {
        socket = io();
        socket.on('connect', function () { if (!streaming) setStatus('connected', 'Connected'); });
        socket.on('connect_error', function () { setStatus('', 'Disconnected'); });
        socket.on('disconnect', function () {
            setStatus('', 'Disconnected');
            if (streaming) finish('Connection lost', '');
        });
        socket.on('new_data_point', onPoint);
        socket.on('simulation_started', () => notify('Simulation started', 'success'));
        socket.on('dataset_stream_started', () => notify('Streaming your dataset', 'success'));
        socket.on('stream_stopped', function () { if (streaming) finish('Stopped'); });
        socket.on('stream_finished', function () { finish('Finished', 'connected'); notify('Stream finished', 'info'); });
        socket.on('api_test_success', function () {
            $('apiTestResult').textContent = 'API works';
            notify('API endpoint is working', 'success');
        });
        socket.on('api_test_failed', function (data) {
            $('apiTestResult').textContent = 'Failed';
            notify((data && data.message) || 'API test failed', 'error');
        });
        socket.on('api_error', function (data) {
            apiErrors += 1;
            if (Date.now() - lastApiNotice > 5000) {
                lastApiNotice = Date.now();
                notify(((data && data.message) || 'API error') + ' (' + apiErrors + ' so far)', 'error');
            }
        });
        socket.on('error', function (data) {
            notify((data && data.message) || 'Something went wrong', 'error');
            if (streaming) finish('Stopped', 'connected');
        });
    }

    // ---------- page setup ----------
    function showGuide() {
        if (window.FluxionGuide) FluxionGuide.showGuide(typeSelect.value);
    }

    document.addEventListener('DOMContentLoaded', function () {
        window.getViewFileDataset = function () {
            if (!datasetSelect.value) return null;
            const option = datasetSelect.options[datasetSelect.selectedIndex];
            return { id: Number(datasetSelect.value), filename: option ? option.textContent.trim() : 'Dataset' };
        };
        controller.setType(typeSelect.value);
        controller.setScheme(schemeSelect.value);
        controller.setMax(maxInput.value);
        controller.setSpeed(speedSelect.value);
        onSourceChange();
        showGuide();
        setButtons();
        shareBtn.disabled = true;
        connectSocket();

        dataSource.addEventListener('change', onSourceChange);
        datasetSelect.addEventListener('change', onDatasetChange);
        typeSelect.addEventListener('change', function () { controller.setType(typeSelect.value); showGuide(); });
        schemeSelect.addEventListener('change', () => controller.setScheme(schemeSelect.value));
        maxInput.addEventListener('change', () => controller.setMax(maxInput.value));
        speedSelect.addEventListener('change', () => controller.setSpeed(speedSelect.value));
        startBtn.addEventListener('click', startStream);
        pauseBtn.addEventListener('click', togglePause);
        stopBtn.addEventListener('click', stopStream);
        clearBtn.addEventListener('click', clearData);
        exportBtn.addEventListener('click', saveImage);
        shareBtn.addEventListener('click', shareImage);
        $('testApiBtn').addEventListener('click', testApi);
        // ready-made public APIs (no key): the reply has the price in data.amount, there is no label so the time is used
        const examples = {
            btc: ['https://api.coinbase.com/v2/prices/BTC-USD/spot', 'data.amount', 'timestamp'],
            eth: ['https://api.coinbase.com/v2/prices/ETH-USD/spot', 'data.amount', 'timestamp']
        };
        document.querySelectorAll('[data-api-example]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const ex = examples[btn.dataset.apiExample];
                if (!ex) return;
                $('apiUrl').value = ex[0];
                $('apiValuePath').value = ex[1];
                $('apiLabelPath').value = ex[2];
                intervalInput.value = Math.max(Number(intervalInput.value) || 0, 3000);
                notify('Example filled in. Press Test API Endpoint, then Start Stream.', 'info');
            });
        });
        window.addEventListener('beforeunload', function () { if (socket) socket.disconnect(); });
    });
})();