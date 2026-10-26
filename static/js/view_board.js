// Board view page: tile grid, manual refresh, optional auto-refresh

const boardEl = document.getElementById('boardData');
const boardData = boardEl ? JSON.parse(boardEl.textContent) : null;

const tiles = [];          // {spec, canvas, note, chart, token}
let refreshing = false;
let lastRefresh = 0;

document.addEventListener('DOMContentLoaded', initBoard);

function initBoard() {
    const grid = document.getElementById('boardGrid');
    const refreshBtn = document.getElementById('refreshBoardBtn');
    if (!boardData || !grid) return;

    const specs = boardData.tiles || [];
    if (specs.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'board-empty';
        empty.textContent = 'No charts left in this board. They may have been deleted - edit the board to add some.';
        grid.appendChild(empty);
        setStatus('0 charts');
        if (refreshBtn) refreshBtn.disabled = true;
        return;
    }

    specs.forEach(spec => tiles.push(buildTile(grid, spec)));

    if (refreshBtn) refreshBtn.addEventListener('click', () => refreshAll(true));
    refreshAll(true);

    const secs = boardData.refresh_seconds || 0;
    if (secs > 0) {
        setInterval(() => {
            if (!document.hidden) refreshAll(false);   // skip while tab hidden
        }, secs * 1000);
        document.addEventListener('visibilitychange', () => {
            // back on the tab after a long wait: refresh now, not at next tick
            if (!document.hidden && Date.now() - lastRefresh >= secs * 1000) refreshAll(false);
        });
    }
}

function buildTile(grid, spec) {
    const size = ['s', 'm', 'l'].includes(spec.size) ? spec.size : 'm';

    const tile = document.createElement('article');
    tile.className = `board-tile board-tile-${size}`;

    const heading = document.createElement('h4');
    heading.textContent = spec.title;
    heading.title = spec.title;

    const wrap = document.createElement('div');
    wrap.className = 'board-tile-canvas';
    const canvas = document.createElement('canvas');
    wrap.appendChild(canvas);

    const note = document.createElement('p');
    note.className = 'board-tile-note';
    note.hidden = true;

    tile.append(heading, wrap, note);
    grid.appendChild(tile);
    return { spec: spec, canvas: canvas, note: note, chart: null, token: 0 };
}

function showNote(tile, text) {
    tile.note.textContent = text;
    tile.note.hidden = !text;
}

// Returns true when the tile shows fresh data. Failure keeps the old chart.
async function loadTile(tile, animate) {
    const myToken = ++tile.token;
    let result;
    try {
        const response = await fetch(tile.spec.data_url || `/chart-data/${tile.spec.chart_id}`);
        result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || `Server error (${response.status})`);
        }
    } catch (error) {
        if (myToken === tile.token) showNote(tile, 'Could not load this chart: ' + error.message);
        return false;
    }
    if (myToken !== tile.token) return true;   // a newer load took over

    try {
        const cfg = tile.spec.config || {};
        const config = FluxionChart.buildConfig(result, tile.spec.chart_type, cfg.color_scheme, {
            maintainAspectRatio: false,
            options: cfg.chart_options,
            chartTitle: tile.spec.title
        });
        if (!animate) config.options.animation = false;
        if (tile.chart) tile.chart.destroy();
        tile.chart = new Chart(tile.canvas.getContext('2d'), config);
        showNote(tile, '');
    } catch (error) {
        console.error('Error drawing chart:', error);
        showNote(tile, 'Could not draw this chart: ' + error.message);
        return false;
    }
    return true;
}

async function refreshAll(animate) {
    if (refreshing) return;
    refreshing = true;

    const refreshBtn = document.getElementById('refreshBoardBtn');
    if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.textContent = 'Refreshing...';
    }

    const results = await Promise.all(tiles.map(tile => loadTile(tile, animate)));

    refreshing = false;
    lastRefresh = Date.now();
    if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.textContent = 'Refresh';
    }

    const failed = results.filter(ok => !ok).length;
    let status = `${tiles.length} chart${tiles.length !== 1 ? 's' : ''} \u00B7 ${refreshLabel()} \u00B7 Updated ${new Date().toLocaleTimeString()}`;
    if (failed) status += ` \u00B7 ${failed} failed`;
    setStatus(status);
}

function refreshLabel() {
    const secs = boardData.refresh_seconds || 0;
    if (!secs) return 'manual refresh';
    return secs < 60 ? `auto-refresh every ${secs} sec` : `auto-refresh every ${secs / 60} min`;
}

function setStatus(text) {
    const el = document.getElementById('boardStatus');
    if (el) el.textContent = text;
}