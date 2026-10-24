// Customise panel for the chart builder. Owns the chart_options object.
// State holds only what the user changed. Anything untouched stays at renderer defaults.
// Keys match charts/options.py. Server cleans again on save.
window.FluxionOptionsPanel = (function () {
    const ROUND = ['pie', 'doughnut'];
    const SMOOTH = ['line', 'area', 'combo'];
    const MAX_COLORS = 10;

    let state = {};
    let cfg = null;
    let ready = false;
    let colorSig = '';
    let timer = null;

    const $ = id => document.getElementById(id);

    function copy(o) {
        return JSON.parse(JSON.stringify(o || {}));
    }

    function changed() {
        clearTimeout(timer);
        timer = setTimeout(function () {
            if (cfg && cfg.onChange) cfg.onChange();
        }, 50);
    }

    function setOrDelete(key, value) {
        if (value === '' || value === undefined || value === null) delete state[key];
        else state[key] = value;
    }

    function listen(id, eventName, handler) {
        $(id).addEventListener(eventName, function (e) {
            handler(e);
            changed();
        });
    }

    function toHex(color) {
        return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : '#000000';
    }

    function palette() {
        const schemes = (window.FluxionChart && window.FluxionChart.colorSchemes) || {};
        return schemes[cfg.getScheme()] || schemes.default || ['#1F9D6E'];
    }

    function sig() {
        return [cfg.getType(), cfg.getScheme(), cfg.getSeriesNames().join('\u0001'),
                JSON.stringify(state.series_colors || null)].join('|');
    }

    function renderColors() {
        const box = $('optColors');
        const pal = palette();
        const custom = state.series_colors || [];
        box.replaceChildren();
        cfg.getSeriesNames().slice(0, MAX_COLORS).forEach(function (name, i) {
            const row = document.createElement('label');
            row.className = 'opt-color-row';
            const input = document.createElement('input');
            input.type = 'color';
            input.value = toHex(custom[i] || pal[i % pal.length]);
            const text = document.createElement('span');
            text.textContent = name;
            input.addEventListener('input', function () {
                state.series_colors = Array.from(box.querySelectorAll('input')).map(x => x.value);
                colorSig = sig();
                changed();
            });
            row.appendChild(input);
            row.appendChild(text);
            box.appendChild(row);
        });
    }

    function show(name, on) {
        const el = document.querySelector('#customisePanel [data-opt="' + name + '"]');
        if (el) el.style.display = on ? '' : 'none';
    }

    function applyVisibility() {
        const type = cfg.getType();
        const round = ROUND.indexOf(type) !== -1;
        show('axes', !round && type !== 'radar');
        show('grid', !round);
        show('smooth', SMOOTH.indexOf(type) !== -1);
        show('colors', !round);
    }

    function syncControls() {
        const legend = state.legend || {};
        $('optShowTitle').checked = state.show_title === true;
        $('optTitleText').value = state.title_text || '';
        $('optLegendShow').value = typeof legend.show === 'boolean' ? String(legend.show) : '';
        $('optLegendPosition').value = legend.position || 'bottom';
        $('optXTitle').value = state.x_title || '';
        $('optYTitle').value = state.y_title || '';
        $('optGrid').checked = state.grid !== false;
        $('optSmooth').checked = state.smooth !== false;
        $('optFontSize').value = state.font_size || '';
        applyVisibility();
        colorSig = sig();
        renderColors();
    }

    function readLegend() {
        const show = $('optLegendShow').value;
        const position = $('optLegendPosition').value;
        const legend = {};
        if (show === 'true') legend.show = true;
        if (show === 'false') legend.show = false;
        if (position !== 'bottom') legend.position = position;
        if (Object.keys(legend).length) state.legend = legend;
        else delete state.legend;
    }

    function readFont(clamp) {
        const el = $('optFontSize');
        if (el.value === '') {
            delete state.font_size;
            return;
        }
        const n = parseInt(el.value, 10);
        if (!Number.isFinite(n)) return;
        if (n >= 10 && n <= 24) {
            state.font_size = n;
        } else if (clamp) {
            const c = Math.min(24, Math.max(10, n));
            el.value = c;
            state.font_size = c;
        }
    }

    function bind() {
        listen('optShowTitle', 'change', e => { if (e.target.checked) state.show_title = true; else delete state.show_title; });
        listen('optTitleText', 'input', e => setOrDelete('title_text', e.target.value.trim()));
        listen('optLegendShow', 'change', readLegend);
        listen('optLegendPosition', 'change', readLegend);
        listen('optXTitle', 'input', e => setOrDelete('x_title', e.target.value.trim()));
        listen('optYTitle', 'input', e => setOrDelete('y_title', e.target.value.trim()));
        listen('optGrid', 'change', e => { if (e.target.checked) delete state.grid; else state.grid = false; });
        listen('optSmooth', 'change', e => { if (e.target.checked) delete state.smooth; else state.smooth = false; });
        listen('optFontSize', 'input', () => readFont(false));
        listen('optFontSize', 'change', () => readFont(true));
        listen('optColorsReset', 'click', () => {
            delete state.series_colors;
            colorSig = sig();
            renderColors();
        });
        listen('optReset', 'click', () => {
            state = {};
            syncControls();
        });
    }

    // cfg: { getType, getScheme, getSeriesNames, onChange }
    function init(config) {
        cfg = config;
        if (ready || !$('customisePanel')) return;
        bind();
        ready = true;
        syncControls();
    }

    function load(opts) {
        state = (opts && typeof opts === 'object' && !Array.isArray(opts)) ? copy(opts) : {};
        if (ready) syncControls();
    }

    // Call when type, scheme or Y columns may have changed. Cheap when nothing changed.
    function refresh() {
        if (!ready) return;
        applyVisibility();
        const s = sig();
        if (s !== colorSig) {
            colorSig = s;
            renderColors();
        }
    }

    function get() {
        return copy(state);
    }

    return { init: init, load: load, refresh: refresh, get: get };
})();