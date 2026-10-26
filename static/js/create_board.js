// Create / Edit Board page

const SIZE_OPTIONS = [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']];
const chartInfo = {};      // chart id (string) -> {title, type}
let boardItems = [];       // [{chart_id, size}] in display order
let editBoardId = null;    // set when editing an existing board

document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.board-picker-item').forEach(item => {
        const box = item.querySelector('.board-picker-checkbox');
        chartInfo[box.value] = { title: item.dataset.chartTitle, type: item.dataset.chartType };
        box.addEventListener('change', handlePick);
    });

    loadExistingBoard();

    const saveBtn = document.getElementById('saveBoardBtn');
    if (saveBtn) saveBtn.addEventListener('click', handleSaveBoard);

    renderLayout();
});

function pickerBox(chartId) {
    return document.querySelector(`.board-picker-checkbox[value="${chartId}"]`);
}

function handlePick(e) {
    const box = e.target;
    const chartId = parseInt(box.value, 10);
    const item = box.closest('.board-picker-item');

    if (box.checked) {
        item.classList.add('selected');
        if (!boardItems.some(it => it.chart_id === chartId)) {
            boardItems.push({ chart_id: chartId, size: 'm' });
        }
    } else {
        item.classList.remove('selected');
        boardItems = boardItems.filter(it => it.chart_id !== chartId);
    }
    renderLayout();
}

// Edit mode: server put the board in <script id="boardData">
function loadExistingBoard() {
    const el = document.getElementById('boardData');
    if (!el) return;

    let board;
    try {
        board = JSON.parse(el.textContent);
    } catch (e) {
        return;
    }
    if (!board) return;

    editBoardId = board.id;
    document.getElementById('boardTitle').value = board.title || '';
    document.getElementById('boardRefresh').value = String(board.refresh_seconds || 0);

    (board.items || []).forEach(it => {
        const box = pickerBox(it.chart_id);
        if (!box) return;   // chart deleted since the board was saved
        box.checked = true;
        box.closest('.board-picker-item').classList.add('selected');
        boardItems.push({ chart_id: it.chart_id, size: it.size || 'm' });
    });

    const saveBtn = document.getElementById('saveBoardBtn');
    if (saveBtn) saveBtn.textContent = 'Save Changes';
}

function rowButton(label, title, disabled, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'board-row-btn';
    btn.textContent = label;
    btn.title = title;
    btn.disabled = disabled;
    btn.addEventListener('click', onClick);
    return btn;
}

function renderLayout() {
    const list = document.getElementById('boardLayoutList');
    const summary = document.getElementById('boardSummary');
    if (!list) return;

    list.replaceChildren();

    if (boardItems.length === 0) {
        const hint = document.createElement('p');
        hint.className = 'board-layout-empty';
        hint.textContent = 'Tick charts on the left to add tiles';
        list.appendChild(hint);
    }

    boardItems.forEach((item, index) => {
        const info = chartInfo[String(item.chart_id)] || { title: 'Chart ' + item.chart_id };

        const row = document.createElement('div');
        row.className = 'board-layout-row';

        const num = document.createElement('span');
        num.className = 'board-order-badge';
        num.textContent = index + 1;

        const name = document.createElement('span');
        name.className = 'board-layout-title';
        name.textContent = info.title;
        name.title = info.title;

        const sizeSel = document.createElement('select');
        sizeSel.className = 'form-select board-size-select';
        SIZE_OPTIONS.forEach(([value, label]) => {
            const opt = document.createElement('option');
            opt.value = value;
            opt.textContent = label;
            sizeSel.appendChild(opt);
        });
        sizeSel.value = item.size;
        sizeSel.addEventListener('change', () => { item.size = sizeSel.value; });

        const up = rowButton('\u2191', 'Move up', index === 0, () => moveItem(index, -1));
        const down = rowButton('\u2193', 'Move down', index === boardItems.length - 1, () => moveItem(index, 1));
        const remove = rowButton('\u2715', 'Remove', false, () => removeItem(item.chart_id));

        row.append(num, name, sizeSel, up, down, remove);
        list.appendChild(row);
    });

    if (summary) {
        const n = boardItems.length;
        summary.textContent = n === 0 ? 'No charts selected yet' : `${n} chart${n !== 1 ? 's' : ''} selected`;
        summary.classList.toggle('has-selection', n > 0);
    }
}

function moveItem(index, step) {
    const target = index + step;
    if (target < 0 || target >= boardItems.length) return;
    const moved = boardItems.splice(index, 1)[0];
    boardItems.splice(target, 0, moved);
    renderLayout();
}

function removeItem(chartId) {
    boardItems = boardItems.filter(it => it.chart_id !== chartId);
    const box = pickerBox(chartId);
    if (box) {
        box.checked = false;
        box.closest('.board-picker-item').classList.remove('selected');
    }
    renderLayout();
}

async function handleSaveBoard() {
    const saveBtn = document.getElementById('saveBoardBtn');
    const title = document.getElementById('boardTitle').value.trim() || 'Untitled Board';
    const refresh = parseInt(document.getElementById('boardRefresh').value, 10) || 0;

    if (boardItems.length === 0) {
        alert('Please select at least one chart for the board');
        return;
    }

    const label = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    const url = editBoardId ? `/update-board/${editBoardId}` : '/save-board';
    const method = editBoardId ? 'PUT' : 'POST';

    try {
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: title, items: boardItems, refresh_seconds: refresh })
        });
        let data = {};
        try {
            data = await response.json();
        } catch (e) {
            // non-JSON body (server error page): fall through to the error alert
        }
        if (response.ok && data.success) {
            window.location.href = '/boards';
            return;
        }
        alert('Error saving board: ' + (data.error || `Server error (${response.status})`));
    } catch (error) {
        console.error('Error saving board:', error);
        alert('Error saving board: ' + error.message);
    }

    saveBtn.disabled = false;
    saveBtn.textContent = label;
}