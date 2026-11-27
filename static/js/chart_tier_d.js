// Phase 22: box plot, Sankey, sunburst, Marimekko drawn on canvas.
// Same idea as chart_tables.js: an empty carrier chart + a plugin that draws. Boards, reports,
// shared pages and PNG / PDF export work like any chart. Loaded after chart_tables.js (uses FluxionCanvas).
// Data: box plot + Sankey have their own shapes (datasets/shapes.py). Sunburst + Marimekko reuse the pivot shape.
(function () {
    const A = window.FluxionTierA;
    const C = window.FluxionCanvas;
    if (!A || !C) return;
    const INK = C.INK;
    const SOFT = C.SOFT;
    const LINE = C.LINE;
    const FONT = C.FONT;
    const NOTE_H = C.NOTE_H;
    const PI2 = Math.PI * 2;

    function palette(name) {
        return A.kit().palette(name, null);
    }

    function accentOf(name, o) {
        return A.kit().palette(name, o.series_colors)[0];
    }

    function note(b, text) {
        const ctx = b.ctx;
        ctx.fillStyle = SOFT;
        ctx.font = '400 ' + (b.size - 1) + 'px ' + FONT;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(C.fit(ctx, text, b.W), b.x, b.y + b.H - NOTE_H / 2);
    }

    function niceTicks(lo, hi, count) {
        const span = (hi - lo) || 1;
        const raw = span / count;
        const mag = Math.pow(10, Math.floor(Math.log10(raw)));
        const norm = raw / mag;
        const step = (norm < 1.5 ? 1 : (norm < 3 ? 2 : (norm < 7 ? 5 : 10))) * mag;
        const out = [];
        for (let v = Math.floor(lo / step) * step; v <= hi + step * 0.5; v += step) {
            out.push(Number(v.toPrecision(12)));
        }
        return out;
    }

    // rows x columns of positive numbers (pivot shape) -> groups with cells
    function groupsOf(result) {
        const out = [];
        let grand = 0;
        result.labels.forEach(function (label, r) {
            const cells = [];
            let total = 0;
            result.series.forEach(function (s, c) {
                const v = s.values[r];
                if (typeof v === 'number' && v > 0) {
                    cells.push({ name: s.name, value: v, c: c });
                    total += v;
                }
            });
            if (total > 0) {
                out.push({ label: String(label), cells: cells, total: total });
                grand += total;
            }
        });
        return { groups: out, grand: grand };
    }

    // ---------- Box plot ----------
    function drawBox(chart, result, o, accent) {
        const b = C.box(chart, o);
        const ctx = b.ctx;
        const K = A.kit();
        const meta = result.meta || {};
        const s = result.series || [];
        const n = result.labels.length;
        if (s.length < 5 || !n || b.W < 120 || b.H < 100) return;
        const F = A.fmtFor(o, meta.value).full;
        const outliers = meta.outliers || [];
        let lo = Infinity;
        let hi = -Infinity;
        for (let i = 0; i < n; i++) {
            lo = Math.min(lo, s[0].values[i]);
            hi = Math.max(hi, s[4].values[i]);
            (outliers[i] || []).forEach(function (v) { lo = Math.min(lo, v); hi = Math.max(hi, v); });
        }
        if (!Number.isFinite(lo) || !Number.isFinite(hi)) return;
        if (lo === hi) { lo -= 1; hi += 1; }
        const ticks = niceTicks(lo, hi, 5);
        lo = ticks[0];
        hi = ticks[ticks.length - 1];

        ctx.font = '400 ' + (b.size - 1) + 'px ' + FONT;
        let axisW = 0;
        ticks.forEach(function (v) { axisW = Math.max(axisW, ctx.measureText(F(v)).width); });
        axisW += 12;
        const labelH = b.size + 12;
        const px = b.x + axisW;
        const pw = b.W - axisW;
        const py = b.y + 6;
        const ph = b.H - labelH - NOTE_H - 6;
        if (pw < 60 || ph < 40) return;
        const Y = v => py + ph - (v - lo) / (hi - lo) * ph;

        ctx.strokeStyle = LINE;
        ctx.lineWidth = 1;
        ctx.fillStyle = SOFT;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ticks.forEach(function (v) {
            const y = Math.round(Y(v)) + 0.5;
            ctx.beginPath();
            ctx.moveTo(px, y);
            ctx.lineTo(px + pw, y);
            ctx.stroke();
            ctx.fillText(F(v), px - 6, y);
        });

        const band = pw / n;
        const bw = Math.min(70, band * 0.6);
        for (let i = 0; i < n; i++) {
            const cx = px + band * (i + 0.5);
            const mn = s[0].values[i];
            const q1 = s[1].values[i];
            const md = s[2].values[i];
            const q3 = s[3].values[i];
            const mx = s[4].values[i];
            ctx.strokeStyle = accent;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(cx, Y(mx));
            ctx.lineTo(cx, Y(q3));
            ctx.moveTo(cx, Y(q1));
            ctx.lineTo(cx, Y(mn));
            ctx.moveTo(cx - bw * 0.25, Y(mx));
            ctx.lineTo(cx + bw * 0.25, Y(mx));
            ctx.moveTo(cx - bw * 0.25, Y(mn));
            ctx.lineTo(cx + bw * 0.25, Y(mn));
            ctx.stroke();
            const top = Y(q3);
            const height = Math.max(1, Y(q1) - Y(q3));
            ctx.fillStyle = K.alpha(accent, 0.3);
            ctx.fillRect(cx - bw / 2, top, bw, height);
            ctx.strokeRect(cx - bw / 2, top, bw, height);
            ctx.strokeStyle = INK;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cx - bw / 2, Y(md));
            ctx.lineTo(cx + bw / 2, Y(md));
            ctx.stroke();
            ctx.strokeStyle = accent;
            ctx.lineWidth = 1.2;
            (outliers[i] || []).forEach(function (v) {
                ctx.beginPath();
                ctx.arc(cx, Y(v), 3, 0, PI2);
                ctx.stroke();
            });
            ctx.fillStyle = INK;
            ctx.font = '400 ' + b.size + 'px ' + FONT;
            ctx.textAlign = 'center';
            ctx.fillText(C.fit(ctx, result.labels[i], band - 4), cx, py + ph + labelH / 2 + 2);
        }
        const text = ['Box = middle 50% \u00B7 line = median \u00B7 whiskers = up to 1.5 x box height \u00B7 circles = outliers'];
        if (meta.truncated) text.push('Largest ' + n + ' of ' + meta.groups_total + ' groups');
        note(b, text.join(' \u00B7 '));
    }

    // ---------- Marimekko ----------
    function drawMekko(chart, result, o, pal) {
        const b = C.box(chart, o);
        const ctx = b.ctx;
        const meta = result.meta || {};
        const g = groupsOf(result);
        if (!g.groups.length || b.W < 100) return;
        const F = A.fmtFor(o, meta.value).full;
        const labelH = b.size + 10;
        const legendH = b.size + 12;
        const plotH = b.H - labelH - legendH - NOTE_H;
        if (plotH < 40) return;
        const gap = 2;
        const usable = b.W - gap * (g.groups.length - 1);
        let x = b.x;
        ctx.textBaseline = 'middle';
        g.groups.forEach(function (grp) {
            const gw = usable * grp.total / g.grand;
            let y = b.y + plotH;
            grp.cells.forEach(function (cell) {
                const ch = plotH * cell.value / grp.total;
                y -= ch;
                ctx.fillStyle = pal[cell.c % pal.length];
                ctx.fillRect(x, y + 0.5, gw, Math.max(0, ch - 1));
                if (gw > 52 && ch > b.size * 1.9) {
                    ctx.fillStyle = '#FFFFFF';
                    ctx.textAlign = 'center';
                    ctx.font = '700 ' + b.size + 'px ' + FONT;
                    const pct = Math.round(cell.value / grp.total * 100) + '%';
                    const two = ch > b.size * 3.4;
                    ctx.fillText(pct, x + gw / 2, y + ch / 2 - (two ? b.size * 0.6 : 0));
                    if (two) {
                        ctx.font = '400 ' + b.size + 'px ' + FONT;
                        ctx.fillText(C.fit(ctx, F(cell.value), gw - 8), x + gw / 2, y + ch / 2 + b.size * 0.8);
                    }
                }
            });
            ctx.fillStyle = INK;
            ctx.textAlign = 'center';
            ctx.font = '600 ' + b.size + 'px ' + FONT;
            ctx.fillText(C.fit(ctx, grp.label, gw - 4), x + gw / 2, b.y + plotH + labelH / 2);
            x += gw + gap;
        });
        // legend
        let lx = b.x;
        const ly = b.y + plotH + labelH + legendH / 2;
        ctx.font = '400 ' + b.size + 'px ' + FONT;
        ctx.textAlign = 'left';
        for (let c = 0; c < result.series.length; c++) {
            const name = String(result.series[c].name);
            const w = ctx.measureText(name).width + 22;
            if (lx + w > b.x + b.W) break;
            ctx.fillStyle = pal[c % pal.length];
            ctx.fillRect(lx, ly - 5, 10, 10);
            ctx.fillStyle = INK;
            ctx.fillText(name, lx + 15, ly);
            lx += w + 8;
        }
        const text = ['Bar width = group total \u00B7 segment height = share of the group'];
        if (meta.rows_total > result.labels.length) text.push('First ' + result.labels.length + ' of ' + meta.rows_total + ' rows');
        if (meta.cols_total > result.series.length) text.push('First ' + result.series.length + ' of ' + meta.cols_total + ' columns');
        note(b, text.join(' \u00B7 '));
    }

    // ---------- Sunburst ----------
    function wedge(ctx, cx, cy, ri, ro, a0, a1, fill) {
        ctx.beginPath();
        ctx.arc(cx, cy, ro, a0, a1);
        ctx.arc(cx, cy, ri, a1, a0, true);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    function wedgeLabel(b, cx, cy, ri, ro, a0, a1, text, color) {
        const ctx = b.ctx;
        const am = (a0 + a1) / 2;
        const rm = (ri + ro) / 2;
        const arc = (a1 - a0) * rm;
        if (arc < 46 || ro - ri < b.size * 1.6) return;
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '600 ' + b.size + 'px ' + FONT;
        ctx.fillText(C.fit(ctx, text, Math.min(arc, (ro - ri) * 1.7)), cx + Math.cos(am) * rm, cy + Math.sin(am) * rm);
    }

    function drawSun(chart, result, o, pal) {
        const b = C.box(chart, o);
        const ctx = b.ctx;
        const K = A.kit();
        const meta = result.meta || {};
        const g = groupsOf(result);
        if (!g.groups.length || b.W < 100) return;
        const F = A.fmtFor(o, meta.value).full;
        const H = b.H - NOTE_H;
        const cx = b.x + b.W / 2;
        const cy = b.y + H / 2;
        const R = Math.min(b.W, H) / 2 - 4;
        if (R < 40) return;
        const r0 = R * 0.26;
        const r1 = R * 0.62;
        let a = -Math.PI / 2;
        g.groups.forEach(function (grp, gi) {
            const span = PI2 * grp.total / g.grand;
            const col = pal[gi % pal.length];
            wedge(ctx, cx, cy, r0, r1, a, a + span, col);
            wedgeLabel(b, cx, cy, r0, r1, a, a + span, grp.label, '#FFFFFF');
            let a2 = a;
            grp.cells.forEach(function (cell) {
                const s2 = span * cell.value / grp.total;
                wedge(ctx, cx, cy, r1, R, a2, a2 + s2, K.alpha(col, 0.55));
                wedgeLabel(b, cx, cy, r1, R, a2, a2 + s2, cell.name, INK);
                a2 += s2;
            });
            a += span;
        });
        if (r0 > 24) {
            ctx.fillStyle = INK;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = '700 ' + b.size + 'px ' + FONT;
            ctx.fillText(C.fit(ctx, F(g.grand), r0 * 1.8), cx, cy - b.size * 0.4);
            ctx.fillStyle = SOFT;
            ctx.font = '400 ' + (b.size - 1) + 'px ' + FONT;
            ctx.fillText('Total', cx, cy + b.size * 0.9);
        }
        const text = ['Inner ring = ' + (meta.row_label || 'rows') + ' \u00B7 outer ring = ' + (meta.col_label || 'columns') + ' \u00B7 angle = ' + (meta.agg || 'sum') + ' of ' + (meta.value || 'value')];
        if (meta.rows_total > result.labels.length) text.push('First ' + result.labels.length + ' of ' + meta.rows_total + ' rows');
        note(b, text.join(' \u00B7 '));
    }

    // ---------- Sankey ----------
    function drawSankey(chart, result, o, pal) {
        const b = C.box(chart, o);
        const ctx = b.ctx;
        const K = A.kit();
        const meta = result.meta || {};
        const series = result.series || [];
        if (series.length < 2 || b.W < 160 || b.H < 100) return;
        const F = A.fmtFor(o, meta.value).full;
        const sMap = new Map();
        const tMap = new Map();
        const links = [];
        result.labels.forEach(function (s, i) {
            const t = String(series[0].values[i]);
            const v = series[1].values[i];
            if (typeof v !== 'number' || v <= 0) return;
            const sn = String(s);
            sMap.set(sn, (sMap.get(sn) || 0) + v);
            tMap.set(t, (tMap.get(t) || 0) + v);
            links.push({ s: sn, t: t, v: v });
        });
        if (!links.length) return;
        const total = links.reduce((sum, l) => sum + l.v, 0);
        const toNodes = m => Array.from(m, e => ({ name: e[0], v: e[1], cur: 0 })).sort((p, q) => q.v - p.v);
        const sNodes = toNodes(sMap);
        const tNodes = toNodes(tMap);
        const sIdx = new Map(sNodes.map((n, i) => [n.name, i]));
        const tIdx = new Map(tNodes.map((n, i) => [n.name, i]));

        ctx.font = '400 ' + b.size + 'px ' + FONT;
        const width = nodes => nodes.reduce((m, n) => Math.max(m, ctx.measureText(n.name + ' \u00B7 ' + F(n.v)).width), 0) + 10;
        const leftW = Math.min(b.W * 0.24, width(sNodes));
        const rightW = Math.min(b.W * 0.24, width(tNodes));
        const barW = 12;
        const x0 = b.x + leftW + 4;
        const x1 = b.x + b.W - rightW - 4 - barW;
        if (x1 - x0 < 60) return;
        const plotH = b.H - NOTE_H - 4;
        const gapS = Math.min(8, plotH * 0.4 / Math.max(sNodes.length, 1));
        const gapT = Math.min(8, plotH * 0.4 / Math.max(tNodes.length, 1));
        const scale = Math.min((plotH - gapS * (sNodes.length - 1)) / total, (plotH - gapT * (tNodes.length - 1)) / total);
        if (!(scale > 0)) return;
        const place = function (nodes, gap) {
            const used = total * scale + gap * (nodes.length - 1);
            let y = b.y + (plotH - used) / 2;
            nodes.forEach(function (n) { n.y = y; n.h = n.v * scale; y += n.h + gap; });
        };
        place(sNodes, gapS);
        place(tNodes, gapT);
        links.forEach(function (l) { l.si = sIdx.get(l.s); l.ti = tIdx.get(l.t); l.h = l.v * scale; });
        sNodes.forEach(function (n, i) {
            links.filter(l => l.si === i).sort((p, q) => p.ti - q.ti).forEach(function (l) { l.sy = n.y + n.cur; n.cur += l.h; });
        });
        tNodes.forEach(function (n, i) {
            links.filter(l => l.ti === i).sort((p, q) => p.si - q.si).forEach(function (l) { l.ty = n.y + n.cur; n.cur += l.h; });
        });

        const xs = x0 + barW;
        const xm = (xs + x1) / 2;
        links.forEach(function (l) {
            ctx.beginPath();
            ctx.moveTo(xs, l.sy);
            ctx.bezierCurveTo(xm, l.sy, xm, l.ty, x1, l.ty);
            ctx.lineTo(x1, l.ty + l.h);
            ctx.bezierCurveTo(xm, l.ty + l.h, xm, l.sy + l.h, xs, l.sy + l.h);
            ctx.closePath();
            ctx.fillStyle = K.alpha(pal[l.si % pal.length], 0.35);
            ctx.fill();
        });
        ctx.textBaseline = 'middle';
        ctx.font = '400 ' + b.size + 'px ' + FONT;
        sNodes.forEach(function (n, i) {
            ctx.fillStyle = pal[i % pal.length];
            ctx.fillRect(x0, n.y, barW, Math.max(1, n.h));
            if (n.h >= b.size * 0.9) {
                ctx.fillStyle = INK;
                ctx.textAlign = 'right';
                ctx.fillText(C.fit(ctx, n.name + ' \u00B7 ' + F(n.v), leftW), x0 - 4, n.y + n.h / 2);
            }
        });
        tNodes.forEach(function (n, j) {
            ctx.fillStyle = pal[(sNodes.length + j) % pal.length];
            ctx.fillRect(x1, n.y, barW, Math.max(1, n.h));
            if (n.h >= b.size * 0.9) {
                ctx.fillStyle = INK;
                ctx.textAlign = 'left';
                ctx.fillText(C.fit(ctx, n.name + ' \u00B7 ' + F(n.v), rightW), x1 + barW + 4, n.y + n.h / 2);
            }
        });
        const text = [(meta.source || 'Source') + ' \u2192 ' + (meta.target || 'Target') + ' \u00B7 band width = ' + (meta.value || 'value')];
        if (meta.truncated) text.push('Top ' + meta.links + ' of ' + meta.links_total + ' flows');
        note(b, text.join(' \u00B7 '));
    }

    // ---------- Key influencers ----------
    function drawInfl(chart, result, o, accent) {
        const b = C.box(chart, o);
        const ctx = b.ctx;
        const meta = result.meta || {};
        const series = result.series || [];
        const n = result.labels.length;
        if (series.length < 2 || !n || b.W < 200 || b.H < 90) return;
        const strength = series[0].values;
        const dir = series[1].values;
        const details = meta.details || [];
        const rowH = Math.round(b.size * 3.1);
        const shown = Math.max(0, Math.min(n, Math.floor((b.H - NOTE_H) / rowH)));
        const labelW = Math.min(b.W * 0.34, 200);
        const valW = 44;
        const barX = b.x + labelW + 8;
        const barW = b.W - labelW - 8 - valW;
        if (barW < 40) return;
        const colors = { 1: accent, '-1': '#E5484D', 0: '#F59E0B' };
        ctx.textBaseline = 'middle';
        for (let i = 0; i < shown; i++) {
            const y = b.y + rowH * i;
            ctx.fillStyle = INK;
            ctx.textAlign = 'left';
            ctx.font = '600 ' + b.size + 'px ' + FONT;
            ctx.fillText(C.fit(ctx, result.labels[i], labelW), b.x, y + rowH * 0.32);
            ctx.fillStyle = SOFT;
            ctx.font = '400 ' + (b.size - 2) + 'px ' + FONT;
            const text = details[i] ? details[i].text : '';
            ctx.fillText(C.fit(ctx, text, b.W - 4), b.x, y + rowH * 0.74);
            const len = Math.max(2, barW * Math.min(1, strength[i]) * 0.95);
            ctx.fillStyle = colors[dir[i]] || accent;
            ctx.fillRect(barX, y + rowH * 0.12, len, rowH * 0.34);
            ctx.fillStyle = INK;
            ctx.textAlign = 'left';
            ctx.font = '600 ' + b.size + 'px ' + FONT;
            ctx.fillText(Number(strength[i]).toFixed(2), Math.min(barX + len + 6, b.x + b.W - valW + 6), y + rowH * 0.29);
        }
        const text = ['How strongly each column moves ' + (meta.x || 'the target') + ' (0 = no link, 1 = perfect link)',
                      'Green = rises with it \u00B7 red = falls \u00B7 amber = groups differ'];
        if (shown < n) text.push('Showing ' + shown + ' of ' + n);
        note(b, text.join(' \u00B7 '));
    }

    A.register('boxplot', function (result, name, opts, o) {
        const accent = accentOf(name, o);
        return C.shell(chart => drawBox(chart, result, o, accent), opts);
    });
    A.register('sankey', function (result, name, opts, o) {
        const pal = palette(name);
        return C.shell(chart => drawSankey(chart, result, o, pal), opts);
    });
    A.register('sunburst', function (result, name, opts, o) {
        const pal = palette(name);
        return C.shell(chart => drawSun(chart, result, o, pal), opts);
    });
    A.register('marimekko', function (result, name, opts, o) {
        const pal = palette(name);
        return C.shell(chart => drawMekko(chart, result, o, pal), opts);
    });
    A.register('influencers', function (result, name, opts, o) {
        const accent = accentOf(name, o);
        return C.shell(chart => drawInfl(chart, result, o, accent), opts);
    });
})();