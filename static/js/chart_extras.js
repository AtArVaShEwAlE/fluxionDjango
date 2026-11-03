// Phase 18B smart features. Loaded AFTER chart_render.js.
// chart_render.js calls FluxionExtras.prepare (reshape data) before building a
// config and FluxionExtras.apply (patch config + add plugins) after it.
// Without this file charts still render, just without the extras.
// Option keys match charts/options.py.
window.FluxionExtras = (function () {
    const SORT_OK = ['bar', 'hbar', 'pie', 'doughnut', 'stacked', 'combo'];
    const TOPN_OK = ['bar', 'hbar', 'pie', 'doughnut'];
    const REF_OK = ['bar', 'hbar', 'line', 'area', 'scatter', 'combo'];
    const TREND_OK = ['line', 'area', 'bar', 'scatter', 'combo'];
    const HI_OK = ['bar', 'hbar', 'line', 'area', 'scatter', 'combo', 'histogram'];
    const LOG_NO = ['stacked', 'histogram', 'radar', 'pie', 'doughnut'];
    const CURRENCY = { usd: 'USD', eur: 'EUR', inr: 'INR', gbp: 'GBP' };
    const PCT_NAME = /%|percent|pct/i;
    const COLORS = { avg: '#F59E0B', min: '#64748B', max: '#10201A', hiMax: '#157A56', hiMin: '#E5484D' };

    const FC = () => window.FluxionChart;
    const tok = () => FC().tokens;

    function num(v) {
        if (v === null || v === undefined || v === '') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }

    // ---------- data: sort, top N ----------
    function prepare(result, type, o) {
        o = o || {};
        const doSort = o.sort && SORT_OK.indexOf(type) !== -1;
        const doTop = o.top_n && TOPN_OK.indexOf(type) !== -1;
        if (!doSort && !doTop) return result;
        if (!result || !result.labels || !result.series || !result.series.length) return result;

        const n = result.labels.length;
        const keyOf = function (i) {
            if (type === 'stacked') {
                return result.series.reduce((s, ser) => s + (num(ser.values[i]) || 0), 0);
            }
            return num(result.series[0].values[i]);
        };
        const byDesc = (a, b) => {
            const x = keyOf(a), y = keyOf(b);
            if (x === null && y === null) return 0;
            if (x === null) return 1;
            if (y === null) return -1;
            return y - x;
        };
        const byAsc = (a, b) => {
            const x = keyOf(a), y = keyOf(b);
            if (x === null && y === null) return 0;
            if (x === null) return 1;
            if (y === null) return -1;
            return x - y;
        };

        let idx = Array.from({ length: n }, (_, i) => i);
        let rest = [];
        if (doTop) {
            idx.sort(byDesc);
            rest = idx.slice(o.top_n);
            idx = idx.slice(0, o.top_n);
        }
        if (o.sort === 'asc') idx.sort(byAsc);
        else if (o.sort === 'desc' || doTop) idx.sort(byDesc);

        const labels = idx.map(i => result.labels[i]);
        const series = result.series.map(s => ({
            column: s.column,
            values: idx.map(i => s.values[i])
        }));
        const round = type === 'pie' || type === 'doughnut';
        if (round && rest.length) {
            const other = rest.reduce((s, i) => s + (num(result.series[0].values[i]) || 0), 0);
            labels.push('Other');
            series[0].values.push(other);
        }
        return Object.assign({}, result, { labels: labels, series: series });
    }

    // ---------- number formats ----------
    function makeFmt(mode, column) {
        const fc = FC();
        if (!mode || mode === 'auto') {
            if (column && PCT_NAME.test(column)) mode = 'percent';
            else return null;
        }
        if (mode === 'plain') return { tick: fc.fmtFull, full: fc.fmtFull };
        if (mode === 'percent') {
            return {
                tick: v => fc.fmtCompact(v) + '%',
                full: v => fc.fmtFull(v) + '%'
            };
        }
        const code = CURRENCY[mode];
        if (!code) return null;
        try {
            const full = new Intl.NumberFormat('en-US', { style: 'currency', currency: code, maximumFractionDigits: 2 });
            const compact = new Intl.NumberFormat('en-US', { style: 'currency', currency: code, notation: 'compact', maximumFractionDigits: 1 });
            return {
                tick: v => (Number.isFinite(Number(v)) ? compact.format(Number(v)) : String(v)),
                full: v => (Number.isFinite(Number(v)) ? full.format(Number(v)) : '-')
            };
        } catch (e) {
            return null;
        }
    }

    // ---------- canvas helpers ----------
    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    // anchor: 'center' | 'left' | 'right' on cx. Stays inside the canvas.
    function pill(chart, text, cx, cy, bg, fg, size, anchor) {
        const ctx = chart.ctx;
        ctx.save();
        ctx.font = '600 ' + size + 'px ' + tok().font;
        const w = ctx.measureText(text).width + 12;
        const h = size + 8;
        let x = anchor === 'left' ? cx : anchor === 'right' ? cx - w : cx - w / 2;
        x = Math.max(2, Math.min(x, chart.width - w - 2));
        const reg = chart.$fxBoxes || (chart.$fxBoxes = []);
        const clampY = v => Math.max(2, Math.min(v, chart.height - h - 2));
        let y = clampY(cy - h / 2);
        const free = yy => !reg.some(r => x < r.x + r.w && x + w > r.x && yy < r.y + r.h && yy + h > r.y);
        const base = y;
        [0, 1, -1, 2, -2, 3, -3].some(function (t) {
            const yy = clampY(base + t * (h + 3));
            if (free(yy)) { y = yy; return true; }
            return false;
        });
        reg.push({ x: x, y: y, w: w, h: h });
        ctx.fillStyle = bg;
        roundRect(ctx, x, y, w, h, h / 2);
        ctx.fill();
        ctx.fillStyle = fg;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x + w / 2, y + h / 2 + 0.5);
        ctx.restore();
        return { x: x, y: y, w: w, h: h };
    }

    // remember a drawn text box so pills move out of its way
    function reserve(chart, cx, cy, tw, size, align, base) {
        const reg = chart.$fxBoxes || (chart.$fxBoxes = []);
        const x = align === 'center' ? cx - tw / 2 : align === 'left' ? cx : cx - tw;
        const y = base === 'bottom' ? cy - size : base === 'top' ? cy : cy - size / 2;
        reg.push({ x: x, y: y, w: tw, h: size });
    }

    const resetPlugin = {
        id: 'fxReset',
        beforeDatasetsDraw: function (chart) { chart.$fxBoxes = []; }
    };

    function numAt(ds, j) {
        const raw = ds.data[j];
        return num(raw && typeof raw === 'object' ? raw.y : raw);
    }

    function firstVisible(chart) {
        for (let i = 0; i < chart.data.datasets.length; i++) {
            if (chart.isDatasetVisible(i)) return i;
        }
        return -1;
    }

    function colorOf(ds, j, di) {
        if (typeof ds.hoverBackgroundColor === 'function') {
            try { return ds.hoverBackgroundColor({ dataIndex: j, datasetIndex: di }); } catch (e) { /* fall through */ }
        }
        if (Array.isArray(ds.backgroundColor)) return ds.backgroundColor[j];
        return typeof ds.backgroundColor === 'string' ? ds.backgroundColor : ds.borderColor;
    }

    function textOn(color) {
        if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) return '#FFFFFF';
        const n = parseInt(color.slice(1), 16);
        const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
        return lum > 0.62 ? tok().ink : '#FFFFFF';
    }

    function alpha(hex, a) {
        if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) return hex;
        const n = parseInt(hex.slice(1), 16);
        return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    }

    // ---------- plugins ----------
    function valueLabelsPlugin(o, F) {
        const size = o.font_size ? Math.max(10, o.font_size - 2) : 11;
        return {
            id: 'fxValueLabels',
            afterDatasetsDraw: function (chart) {
                const ctx = chart.ctx;
                const a = chart.chartArea;
                if (!a) return;
                const horiz = chart.options.indexAxis === 'y';
                ctx.save();
                ctx.font = '600 ' + size + 'px ' + tok().font;
                chart.data.datasets.forEach(function (ds, di) {
                    if (!chart.isDatasetVisible(di)) return;
                    const meta = chart.getDatasetMeta(di);
                    const kind = meta.type;
                    const stacked = !!(chart.options.scales && chart.options.scales.x && chart.options.scales.x.stacked);
                    let last = -1e9;

                    if (kind === 'pie' || kind === 'doughnut') {
                        const total = ds.data.reduce((s, v) => s + (num(v) || 0), 0);
                        if (!total) return;
                        meta.data.forEach(function (el, j) {
                            const v = num(ds.data[j]);
                            if (v === null) return;
                            const p = el.getProps(['x', 'y', 'startAngle', 'endAngle', 'innerRadius', 'outerRadius'], true);
                            if (p.endAngle - p.startAngle < 0.3) return;
                            const mid = (p.startAngle + p.endAngle) / 2;
                            const r = p.innerRadius ? (p.innerRadius + p.outerRadius) / 2 : p.outerRadius * 0.62;
                            ctx.fillStyle = textOn(colorOf(ds, j, di));
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(Math.round(v / total * 1000) / 10 + '%', p.x + Math.cos(mid) * r, p.y + Math.sin(mid) * r);
                        });
                        return;
                    }

                    meta.data.forEach(function (el, j) {
                        const v = numAt(ds, j);
                        if (v === null) return;
                        const txt = F.tick(v);
                        const tw = ctx.measureText(txt).width;
                        const p = el.getProps(['x', 'y', 'base', 'width', 'height'], true);
                        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;

                        if (kind === 'bar' && horiz) {
                            if (p.height < size - 2) return;
                            let x = v >= 0 ? p.x + 6 : p.x - 6;
                            let alignRight = v < 0;
                            let fill = tok().ink;
                            if (v >= 0 && x + tw > chart.width - 4) { x = p.x - 6; alignRight = true; fill = '#FFFFFF'; }
                            ctx.fillStyle = fill;
                            ctx.textAlign = alignRight ? 'right' : 'left';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(txt, x, p.y);
                            reserve(chart, x, p.y, tw, size, alignRight ? 'right' : 'left', 'middle');
                            return;
                        }
                        if (kind === 'bar' && stacked) {
                            if (Math.abs(p.base - p.y) < size + 4 || tw > p.width) return;
                            ctx.fillStyle = textOn(colorOf(ds, j, di));
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(txt, p.x, (p.y + p.base) / 2);
                            return;
                        }
                        if (p.x - tw / 2 < last + 6) return;
                        if (kind === 'bar') {
                            const neg = v < 0;
                            let y = neg ? p.y + 4 : p.y - 4;
                            let base = neg ? 'top' : 'bottom';
                            let fill = tok().ink;
                            if (!neg && y - size < a.top - 2) { y = p.y + 4; base = 'top'; fill = '#FFFFFF'; }
                            ctx.fillStyle = fill;
                            ctx.textAlign = 'center';
                            ctx.textBaseline = base;
                            ctx.fillText(txt, p.x, y);
                            reserve(chart, p.x, y, tw, size, 'center', base);
                        } else {
                            let y = p.y - 9;
                            let base = 'bottom';
                            if (y - size < a.top - 4) { y = p.y + 9; base = 'top'; }
                            ctx.textAlign = 'center';
                            ctx.textBaseline = base;
                            ctx.lineWidth = 3;
                            ctx.strokeStyle = '#FFFFFF';
                            ctx.strokeText(txt, p.x, y);
                            ctx.fillStyle = tok().ink;
                            ctx.fillText(txt, p.x, y);
                            reserve(chart, p.x, y, tw, size, 'center', base);
                        }
                        last = p.x + tw / 2;
                    });
                });
                ctx.restore();
            }
        };
    }

    function stats(ds) {
        const vals = [];
        for (let j = 0; j < ds.data.length; j++) {
            const v = numAt(ds, j);
            if (v !== null) vals.push(v);
        }
        if (!vals.length) return null;
        return {
            avg: vals.reduce((s, v) => s + v, 0) / vals.length,
            min: Math.min.apply(null, vals),
            max: Math.max.apply(null, vals),
            count: vals.length
        };
    }

    function refLinesPlugin(o, F) {
        const NAMES = { avg: 'Avg', min: 'Min', max: 'Max' };
        return {
            id: 'fxRefLines',
            afterDatasetsDraw: function (chart) {
                const a = chart.chartArea;
                const i = firstVisible(chart);
                if (!a || i < 0) return;
                const st = stats(chart.data.datasets[i]);
                if (!st) return;
                const horiz = chart.options.indexAxis === 'y';
                const scale = horiz ? chart.scales.x : chart.scales.y;
                if (!scale) return;
                const ctx = chart.ctx;
                let prev = -1e9;
                o.ref_lines.forEach(function (key, n) {
                    const pos = scale.getPixelForValue(st[key]);
                    if (!Number.isFinite(pos)) return;
                    const color = COLORS[key];
                    ctx.save();
                    ctx.setLineDash([6, 4]);
                    ctx.lineWidth = 1.5;
                    ctx.strokeStyle = color;
                    ctx.beginPath();
                    if (horiz) {
                        if (pos < a.left || pos > a.right) { ctx.restore(); return; }
                        ctx.moveTo(pos, a.top);
                        ctx.lineTo(pos, a.bottom);
                    } else {
                        if (pos < a.top || pos > a.bottom) { ctx.restore(); return; }
                        ctx.moveTo(a.left, pos);
                        ctx.lineTo(a.right, pos);
                    }
                    ctx.stroke();
                    ctx.restore();
                    const text = NAMES[key] + ' ' + F.tick(st[key]);
                    if (horiz) {
                        pill(chart, text, pos, a.top + 12 + n * 24, color, '#FFFFFF', 11, 'center');
                    } else {
                        let cy = pos - 11;
                        if (Math.abs(cy - prev) < 22) cy = prev + 22;
                        prev = cy;
                        pill(chart, text, a.right - 4, cy, color, '#FFFFFF', 11, 'right');
                    }
                });
            }
        };
    }

    function trendPlugin(o, F) {
        return {
            id: 'fxTrend',
            afterDatasetsDraw: function (chart) {
                const i = firstVisible(chart);
                if (i < 0) return;
                const ds = chart.data.datasets[i];
                const xs = [];
                const ys = [];
                for (let j = 0; j < ds.data.length; j++) {
                    const y = numAt(ds, j);
                    if (y === null) continue;
                    const raw = ds.data[j];
                    const x = raw && typeof raw === 'object' && num(raw.x) !== null ? num(raw.x) : j;
                    xs.push(x);
                    ys.push(y);
                }
                const n = xs.length;
                if (n < 3) return;
                const sx = xs.reduce((s, v) => s + v, 0);
                const sy = ys.reduce((s, v) => s + v, 0);
                const sxx = xs.reduce((s, v) => s + v * v, 0);
                const sxy = xs.reduce((s, v, k) => s + v * ys[k], 0);
                const den = n * sxx - sx * sx;
                if (!den) return;
                const slope = (n * sxy - sx * sy) / den;
                const icpt = (sy - slope * sx) / n;
                const x0 = Math.min.apply(null, xs);
                const x1 = Math.max.apply(null, xs);
                const xs_ = chart.scales.x;
                const ysc = chart.scales.y;
                if (!xs_ || !ysc) return;
                const px0 = xs_.getPixelForValue(x0);
                const px1 = xs_.getPixelForValue(x1);
                const py0 = ysc.getPixelForValue(slope * x0 + icpt);
                const py1 = ysc.getPixelForValue(slope * x1 + icpt);
                if (![px0, px1, py0, py1].every(Number.isFinite)) return;
                const ctx = chart.ctx;
                ctx.save();
                ctx.setLineDash([7, 5]);
                ctx.lineWidth = 2;
                ctx.lineCap = 'round';
                ctx.strokeStyle = alpha('#10201A', 0.55);
                ctx.beginPath();
                ctx.moveTo(px0, py0);
                ctx.lineTo(px1, py1);
                ctx.stroke();
                ctx.restore();
                const unit = ds.data[0] && typeof ds.data[0] === 'object' && num(ds.data[0].x) !== null ? 'unit' : 'step';
                const text = (slope >= 0 ? '\u2197 +' : '\u2198 ') + F.tick(Math.round(slope * 10) / 10) + ' / ' + unit;
                pill(chart, text, px1, py1 - 16, '#10201A', '#FFFFFF', 11, 'right');
            }
        };
    }

    function highlightPlugin(o, F) {
        return {
            id: 'fxHighlight',
            afterDatasetsDraw: function (chart) {
                const i = firstVisible(chart);
                const a = chart.chartArea;
                if (i < 0 || !a) return;
                const ds = chart.data.datasets[i];
                const meta = chart.getDatasetMeta(i);
                let hi = -1, lo = -1;
                let count = 0;
                for (let j = 0; j < ds.data.length; j++) {
                    const v = numAt(ds, j);
                    if (v === null) continue;
                    count++;
                    if (hi < 0 || v > numAt(ds, hi)) hi = j;
                    if (lo < 0 || v < numAt(ds, lo)) lo = j;
                }
                if (count < 3 || hi === lo) return;
                const horiz = chart.options.indexAxis === 'y';
                const isBar = meta.type === 'bar';
                const ctx = chart.ctx;
                const size = 11;
                [['Max', hi, COLORS.hiMax], ['Min', lo, COLORS.hiMin]].forEach(function (item) {
                    const el = meta.data[item[1]];
                    if (!el) return;
                    const p = el.getProps(['x', 'y'], true);
                    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
                    const v = numAt(ds, item[1]);
                    const color = item[2];
                    ctx.save();
                    ctx.fillStyle = alpha(color, 0.18);
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, isBar ? 8 : 12, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.lineWidth = 2.5;
                    ctx.strokeStyle = color;
                    ctx.fillStyle = '#FFFFFF';
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, isBar ? 4 : 6, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                    ctx.restore();
                    const text = item[0] + ' ' + F.tick(v);
                    if (horiz) {
                        const extra = o.value_labels ? 44 : 0;
                        pill(chart, text, p.x + 14 + extra, p.y, color, '#FFFFFF', size, 'left');
                    } else {
                        const lift = (isBar && o.value_labels) ? 34 : 20;
                        pill(chart, text, p.x, Math.max(p.y - lift, a.top - 2), color, '#FFFFFF', size, 'center');
                    }
                });
            }
        };
    }

    // ---------- config patch ----------
    function solidify(datasets) {
        datasets.forEach(function (ds) {
            if (typeof ds.hoverBackgroundColor === 'function' && typeof ds.backgroundColor === 'function') {
                ds.backgroundColor = ds.hoverBackgroundColor;
            } else if (ds.fill && typeof ds.backgroundColor === 'function') {
                ds.backgroundColor = alpha(ds.borderColor, 0.18);
            }
        });
    }

    function apply(config, result, type, o) {
        o = o || {};
        const opt = config.options || {};
        const plugins = opt.plugins || {};
        const scales = opt.scales || {};
        const round = type === 'pie' || type === 'doughnut';
        const radar = type === 'radar';
        const horiz = type === 'hbar';
        const valueKey = radar ? 'r' : horiz ? 'x' : 'y';
        const column = result && result.series && result.series[0] ? result.series[0].column : '';
        const fc = FC();

        const fmt = type === 'histogram' ? null : makeFmt(o.number_format, column);
        const F = fmt || { tick: fc.fmtCompact, full: fc.fmtFull };

        if (fmt) {
            if (!round && scales[valueKey] && scales[valueKey].ticks) {
                scales[valueKey].ticks.callback = v => fmt.tick(v);
            }
            const cb = plugins.tooltip && plugins.tooltip.callbacks;
            if (cb) {
                cb.label = function (ctx) {
                    if (round) {
                        const total = (ctx.dataset.data || []).reduce((s, v) => s + (Number(v) || 0), 0);
                        const pct = total ? Math.round(ctx.parsed / total * 1000) / 10 : 0;
                        return ' ' + ctx.label + ': ' + fmt.full(ctx.parsed) + ' (' + pct + '%)';
                    }
                    if (type === 'scatter') {
                        const raw = ctx.raw || {};
                        return ' (' + raw.x + ', ' + fmt.full(raw.y) + ')';
                    }
                    const p = ctx.parsed || {};
                    const v = radar ? p.r : (horiz ? p.x : p.y);
                    return ' ' + (ctx.dataset.label || '') + ': ' + fmt.full(v);
                };
            }
        }

        if (o.animate === false) opt.animation = false;
        if (o.gradient === false) solidify(config.data.datasets);

        if (o.log_scale && LOG_NO.indexOf(type) === -1 && scales[valueKey]) {
            const s = scales[valueKey];
            s.type = 'logarithmic';
            delete s.beginAtZero;
            s.ticks = Object.assign({}, s.ticks, {
                callback: function (v) {
                    const n = Number(v);
                    if (!(n > 0)) return '';
                    const m = n / Math.pow(10, Math.floor(Math.log10(n)));
                    const ok = [1, 2, 5].some(k => Math.abs(m - k) < 1e-6);
                    return ok ? F.tick(n) : '';
                }
            });
        }

        const list = [];
        if (o.value_labels && !radar) list.push(valueLabelsPlugin(o, F));
        if (Array.isArray(o.ref_lines) && o.ref_lines.length && REF_OK.indexOf(type) !== -1) list.push(refLinesPlugin(o, F));
        if (o.trendline && TREND_OK.indexOf(type) !== -1) list.push(trendPlugin(o, F));
        if (o.highlight && HI_OK.indexOf(type) !== -1) list.push(highlightPlugin(o, F));
        if (list.length) config.plugins = (config.plugins || []).concat([resetPlugin], list);
    }

    return { prepare: prepare, apply: apply };
})();