// "View file" window on the Create Chart page: read-only table of the uploaded dataset with
// 1-based row numbers, so you can pick a row range (Customise > Rows from / to).
(function () {
    const openBtn = document.getElementById('viewFileBtn');
    if (!openBtn) return;
    // Create Chart has `currentDataset`; the Live page provides window.getViewFileDataset()
    function datasetNow() {
        if (typeof currentDataset !== 'undefined' && currentDataset) return currentDataset;
        return typeof window.getViewFileDataset === 'function' ? window.getViewFileDataset() : null;
    }
    const state = { page: 1, size: 50, pages: 1, total: 0, jump: null };
    let modal = null;
    let busy = false;

    function el(tag, cls, text) {
        const node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function build() {
        modal = el('div', 'fv-modal');
        modal.hidden = true;
        const overlay = el('div', 'fv-overlay');
        const panel = el('div', 'fv-panel');
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');

        const head = el('div', 'fv-head');
        head.id = 'fvTitle';
        const title = el('h3', 'fv-title', 'Dataset rows');
        title.id = 'fvName';
        const close = el('button', 'fv-close', '\u00D7');
        close.type = 'button';
        close.setAttribute('aria-label', 'Close');
        head.append(title, close);

        const bar = el('div', 'fv-bar');
        const sizeLabel = el('label', 'fv-field', 'Rows per page ');
        const size = el('select', 'form-select');
        size.id = 'fvSize';
        [25, 50, 100].forEach(n => {
            const o = el('option', '', String(n));
            o.value = String(n);
            if (n === state.size) o.selected = true;
            size.appendChild(o);
        });
        sizeLabel.appendChild(size);
        const goLabel = el('label', 'fv-field', 'Go to row ');
        const go = el('input', 'form-input');
        go.type = 'number';
        go.min = '1';
        go.id = 'fvGo';
        go.placeholder = 'Row no.';
        goLabel.appendChild(go);
        const prev = el('button', 'btn btn-secondary btn-sm', 'Previous');
        prev.type = 'button';
        prev.id = 'fvPrev';
        const next = el('button', 'btn btn-secondary btn-sm', 'Next');
        next.type = 'button';
        next.id = 'fvNext';
        const info = el('span', 'fv-info', '');
        info.id = 'fvInfo';
        bar.append(sizeLabel, goLabel, prev, next, info);

        const body = el('div', 'fv-body');
        body.id = 'fvBody';
        panel.append(head, bar, body);
        modal.append(overlay, panel);
        document.body.appendChild(modal);

        close.addEventListener('click', hide);
        overlay.addEventListener('click', hide);
        prev.addEventListener('click', () => load(state.page - 1));
        next.addEventListener('click', () => load(state.page + 1));
        size.addEventListener('change', () => { state.size = parseInt(size.value, 10) || 50; load(1); });
        go.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter') return;
            const row = parseInt(go.value, 10);
            if (Number.isFinite(row) && row >= 1) {
                state.jump = row;
                load(Math.ceil(row / state.size));
            }
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && modal && !modal.hidden) hide();
        });
    }

    function hide() {
        if (modal) modal.hidden = true;
        document.body.style.overflow = '';
    }

    function message(text) {
        const body = document.getElementById('fvBody');
        body.replaceChildren(el('p', 'fv-msg', text));
    }

    function render(data) {
        const body = document.getElementById('fvBody');
        const table = el('table', 'fv-table');
        const thead = el('thead');
        const hr = el('tr');
        hr.appendChild(el('th', 'fv-rownum', '#'));
        data.columns.forEach(function (col) {
            const th = el('th');
            th.title = col;
            th.appendChild(el('span', 'fv-col', col));
            const type = (data.types && data.types[col]) || 'text';
            th.appendChild(el('span', 'fv-badge fv-' + type, type === 'number' ? '123' : type === 'date' ? 'date' : 'abc'));
            hr.appendChild(th);
        });
        thead.appendChild(hr);
        const tbody = el('tbody');
        data.rows.forEach(function (row) {
            const tr = el('tr');
            tr.dataset.row = String(row[0]);
            row.forEach(function (value, i) {
                const td = el(i === 0 ? 'td' : 'td', i === 0 ? 'fv-rownum' : '', value === null || value === undefined ? '' : String(value));
                if (i > 0) td.title = td.textContent;
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
        table.append(thead, tbody);
        body.replaceChildren(table);
        if (state.jump) {
            const hit = tbody.querySelector('tr[data-row="' + state.jump + '"]');
            if (hit) {
                hit.classList.add('fv-hit');
                hit.scrollIntoView({ block: 'center' });
            }
            state.jump = null;
        } else {
            body.scrollTop = 0;
        }
    }

    async function load(page) {
        const ds = datasetNow();
        if (busy || !ds) return;
        busy = true;
        message('Loading...');
        try {
            const response = await fetch('/dataset-rows/' + ds.id + '?page=' + Math.max(1, page) + '&size=' + state.size);
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.error || 'Server error (' + response.status + ')');
            state.page = data.page;
            state.pages = data.pages;
            state.total = data.total;
            render(data);
            const first = data.rows.length ? data.rows[0][0] : 0;
            const last = data.rows.length ? data.rows[data.rows.length - 1][0] : 0;
            document.getElementById('fvInfo').textContent = 'Rows ' + first + '-' + last + ' of ' + data.total.toLocaleString() + '  \u00B7  page ' + data.page + ' of ' + data.pages;
            document.getElementById('fvPrev').disabled = data.page <= 1;
            document.getElementById('fvNext').disabled = data.page >= data.pages;
        } catch (error) {
            message('Could not load the file: ' + error.message);
        } finally {
            busy = false;
        }
    }

    openBtn.addEventListener('click', function () {
        const ds = datasetNow();
        if (!ds) {
            alert('Choose a dataset first');
            return;
        }
        if (!modal) build();
        document.getElementById('fvName').textContent = (ds.filename || 'Dataset') + ' - rows';
        modal.hidden = false;
        document.body.style.overflow = 'hidden';
        load(1);
    });
})();