// Phase 21: tables drawn on canvas (table, pivot table, heatmap).
// A Chart.js plugin does the drawing, so reports, boards, shared pages and PNG / PDF export work like any chart.
// Data shapes: datasets/shapes.py (_table, _pivot). Loaded after chart_widgets.js.
(function () {
    const A = window.FluxionTierA;
    if (!A || !window.FluxionChart) return;
    const INK = '#10201A';
    const SOFT = '#55655F';
    const LINE = '#E3E9E6';
    const ZEBRA = '#F6F9F7';
    const FONT = 'Inter, Arial, sans-serif';
    const PAD = 8;
    const NOTE_H = 22;

    function fit(ctx, text, maxW) {
        text = String(text === null || text === undefined ? '' : text);
        if (maxW <= 8) return '';
        if (ctx.measureText(text).width <= maxW) return text;
        let t = text;
        while (t.length > 1 && ctx.measureText(t + '\u2026').width > maxW) t = t.slice(0, -1);
        return t + '\u2026';
    }

    function put(ctx, text, x, y, w, align) {
        ctx.textAlign = align;
        const at = align === 'right' ? x + w - PAD : (align === 'center' ? x + w / 2 : x + PAD);
        ctx.fillText(fit(ctx, text, w - PAD * 2), at, y);
    }

    function plain(v) {
        if (v === null || v === undefined || v === '') return '';
        if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(4)));
        return String(v);
    }

    function firstValue(values) {
        return (values || []).find(v => v !== null && v !== undefined && v !== '');
    }

    // Empty bar chart as a carrier: no axes, no tooltip. The plugin draws the table on top.
    function shell(draw, opts) {
        return {
            type: 'bar',
            data: { labels: [], datasets: [] },
            options: {
                responsive: true,
                maintainAspectRatio: opts.maintainAspectRatio !== false,
                animation: false,
                plugins: { legend: { display: false }, title: { display: false }, tooltip: { enabled: false } },
                scales: { x: { display: false }, y: { display: false } }
            },
            plugins: [{
                id: 'fxTable',
                afterDraw: function (chart) {
                    chart.ctx.save();
                    try { draw(chart); } finally { chart.ctx.restore(); }
                }
            }]
        };
    }

    function box(chart, o) {
        const a = chart.chartArea;
        const W = Math.max(0, a.right - a.left - 4);
        const size = o.font_size || (W < 420 ? 11 : 13);
        return { ctx: chart.ctx, x: a.left + 2, y: a.top + 2, W: W,
                 H: Math.max(0, a.bottom - a.top - 4), size: size, rowH: Math.round(size * 2.2) };
    }

    function drawTable(chart, result, o, accent) {
        const b = box(chart, o);
        const ctx = b.ctx;
        const K = A.kit();
        const meta = result.meta || {};
        const series = result.series || [];
        if (!series.length || b.W < 40) return;
        const fmt = o.number_format ? series.map(s => A.fmtFor(o, s.column).full) : null;
        const names = ['#'].concat(series.map(s => s.name));
        const align = ['left'].concat(series.map(s => typeof firstValue(s.values) === 'number' ? 'right' : 'left'));
        const rows = result.labels.length;
        const text = function (r, c) {
            if (c === 0) return String(result.labels[r]);
            const v = series[c - 1].values[r];
            return (fmt && typeof v === 'number') ? fmt[c - 1](v) : plain(v);
        };

        ctx.textBaseline = 'middle';
        ctx.font = '600 ' + b.size + 'px ' + FONT;
        const want = names.map(n => ctx.measureText(n).width);
        ctx.font = '400 ' + b.size + 'px ' + FONT;
        const sample = Math.min(rows, 40);
        for (let c = 0; c < names.length; c++) {
            for (let r = 0; r < sample; r++) want[c] = Math.max(want[c], ctx.measureText(text(r, c)).width);
        }
        let widths = want.map(w => Math.min(w + PAD * 2, b.W * 0.45));
        const sum = widths.reduce((s, w) => s + w, 0);
        widths = widths.map(w => sum > b.W ? w * b.W / sum : w + (b.W - sum) / widths.length);

        const shown = Math.max(0, Math.min(rows, Math.floor((b.H - b.rowH - NOTE_H) / b.rowH)));

        ctx.fillStyle = K.alpha(accent, 0.14);
        ctx.fillRect(b.x, b.y, b.W, b.rowH);
        ctx.fillStyle = INK;
        ctx.font = '600 ' + b.size + 'px ' + FONT;
        let x = b.x;
        names.forEach(function (n, c) {
            put(ctx, n, x, b.y + b.rowH / 2, widths[c], align[c]);
            x += widths[c];
        });

        ctx.strokeStyle = LINE;
        ctx.lineWidth = 1;
        for (let r = 0; r < shown; r++) {
            const y = b.y + b.rowH * (r + 1);
            if (r % 2 === 1) {
                ctx.fillStyle = ZEBRA;
                ctx.fillRect(b.x, y, b.W, b.rowH);
            }
            ctx.fillStyle = INK;
            ctx.font = '400 ' + b.size + 'px ' + FONT;
            x = b.x;
            for (let c = 0; c < names.length; c++) {
                put(ctx, text(r, c), x, y + b.rowH / 2, widths[c], align[c]);
                x += widths[c];
            }
            ctx.beginPath();
            ctx.moveTo(b.x, y + b.rowH - 0.5);
            ctx.lineTo(b.x + b.W, y + b.rowH - 0.5);
            ctx.stroke();
        }

        const total = meta.rows_in || rows;
        if (shown < total) {
            ctx.fillStyle = SOFT;
            ctx.font = '400 ' + (b.size - 1) + 'px ' + FONT;
            ctx.textAlign = 'left';
            ctx.fillText('Showing ' + shown + ' of ' + total.toLocaleString() + ' rows. Use Rows from / to to pick others.',
                         b.x, b.y + b.rowH * (shown + 1) + NOTE_H / 2 + 2);
        }
    }

    // Pivot table (numbers + totals) and heatmap (colour by value) share this grid.
    function drawGrid(chart, result, o, heat, accent) {
        const b = box(chart, o);
        const ctx = b.ctx;
        const K = A.kit();
        const meta = result.meta || {};
        const series = result.series || [];
        if (!series.length || b.W < 80) return;
        const F = A.fmtFor(o, meta.value).full;
        const totals = !heat && Array.isArray(meta.row_totals) && Array.isArray(meta.col_totals);

        ctx.textBaseline = 'middle';
        ctx.font = '600 ' + b.size + 'px ' + FONT;
        let labelW = ctx.measureText(String(meta.row_label || '')).width;
        result.labels.forEach(l => { labelW = Math.max(labelW, ctx.measureText(String(l)).width); });
        labelW = Math.min(Math.max(labelW + PAD * 2, 60), b.W * 0.3);
        const nCols = series.length + (totals ? 1 : 0);
        const cw = (b.W - labelW) / nCols;

        const fitRows = Math.floor((b.H - b.rowH - NOTE_H) / b.rowH) - (totals ? 1 : 0);
        const shown = Math.max(0, Math.min(result.labels.length, fitRows));
        const rh = heat ? Math.max(b.rowH, Math.min(Math.floor((b.H - b.rowH - NOTE_H) / Math.max(shown, 1)), b.rowH * 2)) : b.rowH;
        const cellAlign = heat ? 'center' : 'right';

        let lo = Infinity;
        let hi = -Infinity;
        series.forEach(s => s.values.forEach(v => {
            if (typeof v === 'number') { lo = Math.min(lo, v); hi = Math.max(hi, v); }
        }));
        const level = v => hi > lo ? (v - lo) / (hi - lo) : 1;

        // header
        ctx.fillStyle = K.alpha(accent, 0.14);
        ctx.fillRect(b.x, b.y, b.W, b.rowH);
        ctx.fillStyle = INK;
        ctx.font = '600 ' + b.size + 'px ' + FONT;
        put(ctx, meta.row_label || '', b.x, b.y + b.rowH / 2, labelW, 'left');
        series.forEach((s, c) => put(ctx, s.name, b.x + labelW + cw * c, b.y + b.rowH / 2, cw, cellAlign));
        if (totals) put(ctx, 'Total', b.x + labelW + cw * series.length, b.y + b.rowH / 2, cw, cellAlign);

        // body
        ctx.strokeStyle = LINE;
        ctx.lineWidth = 1;
        for (let r = 0; r < shown; r++) {
            const y = b.y + b.rowH + rh * r;
            ctx.fillStyle = INK;
            ctx.font = '600 ' + b.size + 'px ' + FONT;
            put(ctx, result.labels[r], b.x, y + rh / 2, labelW, 'left');
            ctx.font = '400 ' + b.size + 'px ' + FONT;
            series.forEach(function (s, c) {
                const v = s.values[r];
                const cx = b.x + labelW + cw * c;
                if (typeof v !== 'number') return;
                if (heat) {
                    const a = 0.1 + 0.85 * level(v);
                    ctx.fillStyle = K.alpha(accent, a);
                    ctx.fillRect(cx + 1, y + 1, cw - 2, rh - 2);
                    ctx.fillStyle = a > 0.55 ? '#FFFFFF' : INK;
                } else {
                    ctx.fillStyle = INK;
                }
                put(ctx, F(v), cx, y + rh / 2, cw, cellAlign);
            });
            if (totals && typeof meta.row_totals[r] === 'number') {
                ctx.fillStyle = INK;
                ctx.font = '600 ' + b.size + 'px ' + FONT;
                put(ctx, F(meta.row_totals[r]), b.x + labelW + cw * series.length, y + rh / 2, cw, cellAlign);
            }
            if (!heat) {
                ctx.beginPath();
                ctx.moveTo(b.x, y + rh - 0.5);
                ctx.lineTo(b.x + b.W, y + rh - 0.5);
                ctx.stroke();
            }
        }

        // totals row
        let endY = b.y + b.rowH + rh * shown;
        if (totals) {
            ctx.fillStyle = ZEBRA;
            ctx.fillRect(b.x, endY, b.W, b.rowH);
            ctx.fillStyle = INK;
            ctx.font = '600 ' + b.size + 'px ' + FONT;
            put(ctx, 'Total', b.x, endY + b.rowH / 2, labelW, 'left');
            series.forEach((s, c) => {
                if (typeof meta.col_totals[c] === 'number') put(ctx, F(meta.col_totals[c]), b.x + labelW + cw * c, endY + b.rowH / 2, cw, cellAlign);
            });
            if (typeof meta.grand_total === 'number') put(ctx, F(meta.grand_total), b.x + labelW + cw * series.length, endY + b.rowH / 2, cw, cellAlign);
            endY += b.rowH;
        }

        // note
        const notes = [];
        if (heat && Number.isFinite(lo)) notes.push('Low ' + F(lo) + ' to high ' + F(hi) + ' (' + (meta.agg || 'sum') + ' of ' + (meta.value || '') + ')');
        if (shown < result.labels.length) notes.push('Showing ' + shown + ' of ' + (meta.rows_total || result.labels.length) + ' rows');
        else if (meta.rows_total > result.labels.length) notes.push('First ' + result.labels.length + ' of ' + meta.rows_total + ' rows');
        if (meta.cols_total > series.length) notes.push('First ' + series.length + ' of ' + meta.cols_total + ' columns');
        if (notes.length) {
            ctx.fillStyle = SOFT;
            ctx.font = '400 ' + (b.size - 1) + 'px ' + FONT;
            ctx.textAlign = 'left';
            ctx.fillText(fit(ctx, notes.join(' \u00B7 '), b.W), b.x, endY + NOTE_H / 2 + 2);
        }
    }

    // Heatmap = treemap: cell area = value, colour = value. Rows are the groups, Columns are the cells.
    function squarify(items, x, y, w, h) {
        const total = items.reduce((s, i) => s + i.value, 0);
        if (!items.length || total <= 0 || w <= 0 || h <= 0) return;
        const scale = (w * h) / total;
        const worst = function (row, side) {
            let sum = 0;
            let mx = 0;
            let mn = Infinity;
            row.forEach(function (i) {
                const v = i.value * scale;
                sum += v;
                mx = Math.max(mx, v);
                mn = Math.min(mn, v);
            });
            return Math.max(side * side * mx / (sum * sum), (sum * sum) / (side * side * mn));
        };
        let rest = items.slice();
        let rx = x;
        let ry = y;
        let rw = w;
        let rh = h;
        while (rest.length) {
            const side = Math.min(rw, rh);
            let row = [rest[0]];
            let k = 1;
            while (k < rest.length) {
                const next = row.concat(rest[k]);
                if (worst(next, side) > worst(row, side)) break;
                row = next;
                k++;
            }
            const area = row.reduce((s, i) => s + i.value * scale, 0);
            if (rw >= rh) {
                const colW = area / rh;
                let cy = ry;
                row.forEach(function (i) {
                    const ih = i.value * scale / colW;
                    i.x = rx; i.y = cy; i.w = colW; i.h = ih;
                    cy += ih;
                });
                rx += colW;
                rw -= colW;
            } else {
                const rowH = area / rw;
                let cx = rx;
                row.forEach(function (i) {
                    const iw = i.value * scale / rowH;
                    i.x = cx; i.y = ry; i.w = iw; i.h = rowH;
                    cx += iw;
                });
                ry += rowH;
                rh -= rowH;
            }
            rest = rest.slice(row.length);
        }
    }

    function drawTreemap(chart, result, o, accent) {
        const b = box(chart, o);
        const ctx = b.ctx;
        const K = A.kit();
        const meta = result.meta || {};
        const series = result.series || [];
        if (!series.length || b.W < 80) return;
        const F = A.fmtFor(o, meta.value).full;
        const groups = [];
        let lo = Infinity;
        let hi = -Infinity;
        let skipped = 0;
        result.labels.forEach(function (label, r) {
            const cells = [];
            series.forEach(function (s) {
                const v = s.values[r];
                if (typeof v === 'number' && v > 0) {
                    cells.push({ value: v, name: s.name });
                    lo = Math.min(lo, v);
                    hi = Math.max(hi, v);
                } else if (typeof v === 'number') {
                    skipped++;
                }
            });
            if (cells.length) {
                cells.sort((p, q) => q.value - p.value);
                groups.push({ value: cells.reduce((s, c) => s + c.value, 0), name: String(label), cells: cells });
            }
        });
        if (!groups.length) return;
        groups.sort((p, q) => q.value - p.value);
        const level = v => hi > lo ? (v - lo) / (hi - lo) : 1;
        const H = b.H - NOTE_H;
        squarify(groups, b.x, b.y, b.W, H);
        ctx.textBaseline = 'middle';
        groups.forEach(function (g) {
            const gx = g.x + 1;
            const gy = g.y + 1;
            const gw = g.w - 2;
            const gh = g.h - 2;
            if (gw < 4 || gh < 4) return;
            const head = (gw > 60 && gh > b.size * 3) ? b.size + 8 : 0;
            ctx.fillStyle = ZEBRA;
            ctx.fillRect(gx, gy, gw, gh);
            if (head) {
                ctx.fillStyle = INK;
                ctx.font = '700 ' + b.size + 'px ' + FONT;
                ctx.textAlign = 'left';
                ctx.fillText(fit(ctx, g.name + ' \u00B7 ' + F(g.value), gw - 8), gx + 4, gy + head / 2);
            }
            squarify(g.cells, gx + 1, gy + head, gw - 2, gh - head - 1);
            g.cells.forEach(function (c) {
                if (c.w < 3 || c.h < 3) return;
                const a = 0.2 + 0.75 * level(c.value);
                ctx.fillStyle = K.alpha(accent, a);
                ctx.fillRect(c.x + 0.5, c.y + 0.5, c.w - 1, c.h - 1);
                if (c.w < 46 || c.h < b.size * 1.8) return;
                const big = c.w > 150 && c.h > 90;
                const fs = big ? b.size + 3 : b.size;
                ctx.fillStyle = a > 0.55 ? '#FFFFFF' : INK;
                ctx.textAlign = 'center';
                ctx.font = '700 ' + fs + 'px ' + FONT;
                const two = c.h > fs * 3.2;
                ctx.fillText(fit(ctx, c.name, c.w - 8), c.x + c.w / 2, c.y + c.h / 2 - (two ? fs * 0.6 : 0));
                if (two) {
                    ctx.font = '400 ' + fs + 'px ' + FONT;
                    ctx.fillText(fit(ctx, F(c.value), c.w - 8), c.x + c.w / 2, c.y + c.h / 2 + fs * 0.8);
                }
            });
        });
        const notes = ['Cell size and colour = ' + (meta.agg || 'sum') + ' of ' + (meta.value || 'value')];
        if (skipped) notes.push(skipped + ' zero or negative cells left out');
        if (meta.rows_total > result.labels.length) notes.push('First ' + result.labels.length + ' of ' + meta.rows_total + ' rows');
        if (meta.cols_total > series.length) notes.push('First ' + series.length + ' of ' + meta.cols_total + ' columns');
        ctx.fillStyle = SOFT;
        ctx.font = '400 ' + (b.size - 1) + 'px ' + FONT;
        ctx.textAlign = 'left';
        ctx.fillText(fit(ctx, notes.join(' \u00B7 '), b.W), b.x, b.y + H + NOTE_H / 2 + 2);
    }

    function accentOf(name, o) {
        return A.kit().palette(name, o.series_colors)[0];
    }

    A.register('table', function (result, name, opts, o) {
        const accent = accentOf(name, o);
        return shell(chart => drawTable(chart, result, o, accent), opts);
    });
    A.register('pivot', function (result, name, opts, o) {
        const accent = accentOf(name, o);
        return shell(chart => drawGrid(chart, result, o, false, accent), opts);
    });
    A.register('heatmap', function (result, name, opts, o) {
        const accent = accentOf(name, o);
        return shell(chart => drawTreemap(chart, result, o, accent), opts);
    });
    window.FluxionCanvas = { shell: shell, box: box, fit: fit, put: put, plain: plain,
                             INK: INK, SOFT: SOFT, LINE: LINE, ZEBRA: ZEBRA, FONT: FONT, PAD: PAD, NOTE_H: NOTE_H };
})();