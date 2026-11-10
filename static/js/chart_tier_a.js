// Phase 19C-1: Tier A chart types (stacked area, dual-axis line, bubble, waterfall,
// funnel, Pareto, bullet, density, Gantt). Loaded after chart_render.js and chart_extras.js.
// chart_render.js hands these types to FluxionTierA.build() instead of its own builder;
// the Customise options (title, legend, grid, font size) and hi-res export still run after.
// Result shapes come from datasets/shapes.py (charts/queries.py picks the shape per type).
window.FluxionTierA = (function () {
    const INK = '#10201A';
    const RED = '#E5484D';
    const AMBER = '#F59E0B';
    const FC = () => window.FluxionChart;
    // Building blocks that give these types the same look as the built-in ones.
    // Uses what chart_render.js exposes in FluxionChart.internals.
    function makeKit(fc) {
        const I = fc.internals;
        const T = fc.tokens;
        const kit = {
            tokens: T,
            alpha: I.withAlpha,
            lineStyle: I.lineStyle,
            barStyle: I.barStyle,
            areaFill: I.areaFill,
            grid: { color: T.grid, drawTicks: false, drawBorder: false },
            noGrid: { display: false, drawBorder: false },
            noBorder: { display: false },
            narrow: function () { return typeof window !== 'undefined' && window.innerWidth < 600; },
            palette: function (name, custom) {
                const base = fc.colorSchemes[I.schemeName(name)];
                custom = Array.isArray(custom) ? custom : [];
                return Array.from({ length: Math.max(base.length, custom.length) }, (_, i) => custom[i] || base[i]);
            },
            tick: function () {
                const n = kit.narrow();
                const t = { color: T.soft, padding: 8, font: { size: n ? 10 : 12 } };
                if (n) t.maxRotation = 50;
                return t;
            },
            animation: function (count) {
                const step = Math.min(40, 700 / Math.max(count, 1));
                let settled = false;
                return I.reduceMotion() ? false : {
                    duration: 900,
                    easing: 'easeOutQuart',
                    delay: function (ctx) {
                        if (settled || ctx.type !== 'data' || ctx.mode !== 'default') return 0;
                        return ctx.dataIndex * step + (ctx.datasetIndex || 0) * 90;
                    },
                    onComplete: function () { settled = true; }
                };
            },
            legend: function (display, labelsFn) {
                const n = kit.narrow();
                const labels = {
                    color: T.soft, usePointStyle: true, pointStyle: 'circle',
                    boxWidth: n ? 8 : 9, boxHeight: n ? 8 : 9, padding: n ? 10 : 16, font: { size: n ? 11 : 12 }
                };
                if (labelsFn) labels.generateLabels = labelsFn;
                return Object.assign({ display: !!display, position: 'bottom', labels: labels }, labelsFn ? { onClick: function () {} } : {});
            },
            // spec: tooltip callbacks (title, label...) plus an optional top-level filter
            tooltip: function (spec) {
                const callbacks = Object.assign({}, spec);
                delete callbacks.filter;
                return Object.assign({
                    enabled: true, backgroundColor: T.tipBg, titleColor: '#FFFFFF', bodyColor: T.tipBody,
                    titleFont: { weight: '600', size: 13 }, bodyFont: { size: 12 }, padding: 12, cornerRadius: 10,
                    caretSize: 6, boxPadding: 4, usePointStyle: true, animation: { duration: 160 }, callbacks: callbacks
                }, spec.filter ? { filter: spec.filter } : {});
            }
        };
        return kit;
    }
    let kitCache = null;
    const K = () => kitCache || (kitCache = makeKit(FC()));

    function fmtFor(o, column) {
        const X = window.FluxionExtras;
        const f = X && X.makeFmt ? X.makeFmt(o.number_format, column) : null;
        return f || { tick: FC().fmtCompact, full: FC().fmtFull };
    }

    // small or large numbers without rounding to 0: 0.00004, 3.5, 1.2k
    function numText(v) {
        const n = Number(v);
        if (!Number.isFinite(n)) return '-';
        if (Math.abs(n) >= 1000) return FC().fmtCompact(n);
        return String(Number(n.toPrecision(3)));
    }

    function dayText(v) {
        return new Date(Math.round(Number(v)) * 86400000).toISOString().slice(0, 10);
    }

    function need(result, count, what) {
        if (!result || !Array.isArray(result.series) || result.series.length < count) {
            throw new Error(what + ' needs ' + count + ' data series');
        }
    }

    // Common config shell. cfg: type, data, scales, interaction, tooltip, legend (bool), indexAxis, padding
    function shell(result, opts, cfg) {
        const k = K();
        return {
            type: cfg.type,
            data: cfg.data,
            options: {
                indexAxis: cfg.indexAxis || 'x',
                responsive: true,
                maintainAspectRatio: opts.maintainAspectRatio === undefined ? true : opts.maintainAspectRatio,
                layout: { padding: Object.assign({ top: 6, right: 8 }, cfg.padding || {}) },
                animation: k.animation(Math.max((result.labels || []).length, 1)),
                transitions: { active: { animation: { duration: 180 } } },
                interaction: cfg.interaction || { mode: 'index', intersect: false },
                plugins: {
                    title: { display: false },
                    legend: k.legend(!!cfg.legend, cfg.legendLabels),
                    tooltip: cfg.tooltip
                },
                scales: cfg.scales
            },
            plugins: cfg.plugins || []
        };
    }

    function axisTitle(text, color) {
        return text ? { display: true, text: text, color: color || K().tokens.soft } : { display: false };
    }

    // ---------- stacked area ----------
    function stackedArea(result, name, opts, o) {
        const k = K();
        const pal = k.palette(name, o.series_colors);
        const curve = o.smooth === false ? 0 : 0.4;
        const n = result.labels.length;
        const F = fmtFor(o, result.series[0].column);
        const datasets = result.series.map(function (s, i) {
            const c = pal[i % pal.length];
            return Object.assign({ label: s.column, data: s.values }, k.lineStyle(c, curve, n, false), {
                fill: i === 0 ? 'origin' : '-1',
                backgroundColor: k.alpha(c, 0.55),
                borderWidth: 2,
                pointRadius: n > 40 ? 0 : 2.5
            });
        });
        return shell(result, opts, {
            type: 'line',
            data: { labels: result.labels, datasets: datasets },
            legend: result.series.length > 1,
            tooltip: k.tooltip({
                label: ctx => ' ' + (ctx.dataset.label || '') + ': ' + F.full(ctx.parsed.y)
            }),
            scales: {
                y: { stacked: true, beginAtZero: true, grid: k.grid, border: k.noBorder,
                     ticks: Object.assign({}, k.tick(), { callback: v => F.tick(v) }) },
                x: { grid: k.noGrid, border: k.noBorder, ticks: k.tick() }
            }
        });
    }

    // ---------- dual-axis line ----------
    function dualLine(result, name, opts, o) {
        need(result, 2, 'Dual-axis line');
        const k = K();
        const pal = k.palette(name, o.series_colors);
        const custom = Array.isArray(o.series_colors) ? o.series_colors : [];
        const colors = [pal[0], custom[1] || AMBER];
        const curve = o.smooth === false ? 0 : 0.4;
        const n = result.labels.length;
        const F = [fmtFor(o, result.series[0].column), fmtFor(o, result.series[1].column)];
        const datasets = result.series.slice(0, 2).map(function (s, i) {
            return Object.assign({ label: s.column, data: s.values, yAxisID: i ? 'y1' : 'y' },
                k.lineStyle(colors[i], curve, n, false));
        });
        const side = function (i, position) {
            return {
                position: position, beginAtZero: true,
                grid: i ? { drawOnChartArea: false, drawTicks: false } : k.grid,
                border: k.noBorder,
                ticks: Object.assign({}, k.tick(), { color: colors[i], callback: v => F[i].tick(v) }),
                title: axisTitle(result.series[i].column, colors[i])
            };
        };
        return shell(result, opts, {
            type: 'line',
            data: { labels: result.labels, datasets: datasets },
            legend: true,
            tooltip: k.tooltip({
                label: ctx => ' ' + (ctx.dataset.label || '') + ': ' + F[ctx.datasetIndex].full(ctx.parsed.y)
            }),
            scales: { y: side(0, 'left'), y1: side(1, 'right'), x: { grid: k.noGrid, border: k.noBorder, ticks: k.tick() } }
        });
    }

    // ---------- bubble ----------
    function bubble(result, name, opts, o) {
        need(result, 2, 'Bubble chart');
        const k = K();
        const pal = k.palette(name, o.series_colors);
        const c = pal[0];
        const ys = result.series[0].values;
        const ss = result.series[1].values;
        const xs = result.labels;
        const meta = result.meta || {};
        const sizes = ss.filter(v => v !== null);
        const smin = sizes.length ? Math.min.apply(null, sizes) : 0;
        const smax = sizes.length ? Math.max.apply(null, sizes) : 1;
        const rMin = k.narrow() ? 3 : 4;
        const rMax = k.narrow() ? 16 : 26;
        const pts = [];
        xs.forEach(function (x, i) {
            if (ys[i] === null || ss[i] === null) return;
            const t = smax > smin ? Math.sqrt((ss[i] - smin) / (smax - smin)) : 0.5;   // area ~ size
            pts.push({ x: Number(x), y: ys[i], r: rMin + t * (rMax - rMin), size: ss[i] });
        });
        pts.sort((a, b) => b.size - a.size);   // small bubbles stay on top
        const xName = meta.x || 'X';
        const yName = result.series[0].column;
        const sName = result.series[1].column;
        const F = fmtFor(o, yName);
        return shell(result, opts, {
            type: 'bubble',
            data: { datasets: [{
                label: yName, data: pts,
                backgroundColor: k.alpha(c, 0.55), borderColor: c, borderWidth: 1.5,
                hoverBackgroundColor: k.alpha(c, 0.8), hoverBorderWidth: 2
            }] },
            legend: false,
            interaction: { mode: 'nearest', intersect: true },
            padding: { top: rMax, right: rMax },
            tooltip: k.tooltip({
                title: () => '',
                label: function (ctx) {
                    const p = ctx.raw || {};
                    return [' ' + xName + ': ' + numText(p.x), ' ' + yName + ': ' + F.full(p.y), ' ' + sName + ': ' + FC().fmtFull(p.size)];
                }
            }),
            scales: {
                x: { type: 'linear', grace: '6%', grid: k.grid, border: k.noBorder, ticks: Object.assign({}, k.tick(), { callback: v => numText(v) }), title: axisTitle(xName) },
                y: { type: 'linear', grace: '6%', grid: k.grid, border: k.noBorder, ticks: Object.assign({}, k.tick(), { callback: v => F.tick(v) }), title: axisTitle(yName) }
            }
        });
    }

    // ---------- waterfall ----------
    function waterfall(result, name, opts, o) {
        need(result, 3, 'Waterfall');
        const k = K();
        const pal = k.palette(name, o.series_colors);
        const change = result.series[0].values;
        const start = result.series[1].values;
        const end = result.series[2].values;
        const totalIdx = result.meta && Number.isInteger(result.meta.total_index) ? result.meta.total_index : result.labels.length - 1;
        const F = fmtFor(o, result.series[0].column);
        const up = [], down = [], total = [];
        result.labels.forEach(function (_, i) {
            up[i] = down[i] = total[i] = null;
            if (i === totalIdx) total[i] = [start[i], end[i]];
            else if (change[i] === null) return;
            else if (change[i] >= 0) up[i] = [start[i], end[i]];
            else down[i] = [start[i], end[i]];
        });
        const bar = function (label, data, color) {
            return { label: label, data: data, backgroundColor: color, hoverBackgroundColor: color, borderWidth: 0,
                     borderRadius: 6, borderSkipped: false, grouped: false, barPercentage: 0.72, categoryPercentage: 0.9, minBarLength: 2 };
        };
        const connectors = {
            id: 'fxWaterfallLines',
            afterDatasetsDraw: function (chart) {
                const y = chart.scales.y;
                if (!y) return;
                const ctx = chart.ctx;
                const metas = chart.data.datasets.map((_, di) => chart.getDatasetMeta(di));
                ctx.save();
                ctx.strokeStyle = 'rgba(16,32,26,0.35)';
                ctx.setLineDash([3, 3]);
                ctx.lineWidth = 1;
                for (let i = 0; i < result.labels.length - 1; i++) {
                    const a = metas.map(m => m.data[i]).find(el => el && !el.skip && el.width);
                    const b = metas.map(m => m.data[i + 1]).find(el => el && !el.skip && el.width);
                    if (!a || !b || end[i] === null) continue;
                    const py = y.getPixelForValue(end[i]);
                    ctx.beginPath();
                    ctx.moveTo(a.x + a.width / 2, py);
                    ctx.lineTo(b.x - b.width / 2, py);
                    ctx.stroke();
                }
                ctx.restore();
            }
        };
        const cfg = shell(result, opts, {
            type: 'bar',
            data: { labels: result.labels, datasets: [bar('Increase', up, pal[0]), bar('Decrease', down, RED), bar('Total', total, pal[2] || INK)] },
            legend: true,
            interaction: { mode: 'nearest', intersect: true },
            tooltip: k.tooltip({
                title: items => (items.length ? result.labels[items[0].dataIndex] : ''),
                label: function (ctx) {
                    const i = ctx.dataIndex;
                    if (i === totalIdx) return ' Total: ' + F.full(end[i]);
                    return ' ' + (change[i] >= 0 ? '+' : '') + F.full(change[i]) + '  \u2192  ' + F.full(end[i]);
                }
            }),
            scales: {
                y: { beginAtZero: true, grid: k.grid, border: k.noBorder, ticks: Object.assign({}, k.tick(), { callback: v => F.tick(v) }) },
                x: { grid: k.noGrid, border: k.noBorder, ticks: k.tick() }
            },
            plugins: [connectors]
        });
        return cfg;
    }

    // ---------- funnel ----------
    function funnel(result, name, opts, o) {
        const k = K();
        const pal = k.palette(name, o.series_colors);
        const vals = result.series[0].values;
        const n = result.labels.length;
        const first = vals.find(v => v !== null && v > 0) || 0;
        const maxV = Math.max.apply(null, vals.map(v => (v === null ? 0 : v)).concat([1]));
        const rainbow = name === 'rainbow' && !(Array.isArray(o.series_colors) && o.series_colors.length);
        const colorAt = function (i) {
            if (rainbow) return k.alpha(pal[i % pal.length], 0.9);
            return k.alpha(pal[0], 1 - 0.55 * (n > 1 ? i / (n - 1) : 0));
        };
        const F = fmtFor(o, result.series[0].column);
        const pctText = function (i) {
            const v = vals[i];
            return first && v !== null ? Math.round(v / first * 1000) / 10 + '%' : '';
        };
        const labelsPlugin = {
            id: 'fxFunnelLabels',
            afterDatasetsDraw: function (chart) {
                const meta = chart.getDatasetMeta(0);
                const xs = chart.scales.x;
                if (!xs) return;
                const ctx = chart.ctx;
                const size = o.font_size ? Math.max(10, o.font_size - 1) : 12;
                ctx.save();
                ctx.font = '600 ' + size + 'px ' + k.tokens.font;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                meta.data.forEach(function (el, i) {
                    if (vals[i] === null) return;
                    const p = el.getProps(['y', 'height'], true);
                    if (!Number.isFinite(p.y) || p.height < size) return;
                    const text = F.tick(vals[i]) + (i ? '  \u00B7  ' + pctText(i) : '');
                    ctx.lineWidth = 3;
                    ctx.strokeStyle = '#FFFFFF';
                    ctx.strokeText(text, xs.getPixelForValue(0), p.y);
                    ctx.fillStyle = INK;
                    ctx.fillText(text, xs.getPixelForValue(0), p.y);
                });
                ctx.restore();
            }
        };
        return shell(result, opts, {
            type: 'bar',
            indexAxis: 'y',
            data: { labels: result.labels, datasets: [{
                label: result.series[0].column,
                data: vals.map(v => (v === null ? null : [-v / 2, v / 2])),
                backgroundColor: (ctx) => colorAt(ctx.dataIndex),
                hoverBackgroundColor: (ctx) => colorAt(ctx.dataIndex),
                borderWidth: 0, borderRadius: 8, borderSkipped: false,
                barPercentage: 0.92, categoryPercentage: 0.94, minBarLength: 2
            }] },
            legend: false,
            interaction: { mode: 'nearest', intersect: true, axis: 'y' },
            tooltip: k.tooltip({
                title: items => (items.length ? result.labels[items[0].dataIndex] : ''),
                label: function (ctx) {
                    const i = ctx.dataIndex;
                    const prev = i > 0 ? vals[i - 1] : null;
                    let t = ' ' + F.full(vals[i]);
                    if (i > 0 && first) t += '  (' + pctText(i) + ' of first';
                    if (i > 0 && prev) t += ', ' + Math.round(vals[i] / prev * 1000) / 10 + '% of previous';
                    return i > 0 && first ? t + ')' : t;
                }
            }),
            scales: {
                x: { display: false, min: -maxV * 0.55, max: maxV * 0.55, grid: { display: false } },
                y: { grid: k.noGrid, border: k.noBorder, ticks: k.tick() }
            },
            plugins: [labelsPlugin]
        });
    }

    // ---------- Pareto ----------
    function pareto(result, name, opts, o) {
        need(result, 2, 'Pareto chart');
        const k = K();
        const pal = k.palette(name, o.series_colors);
        const n = result.labels.length;
        const F = fmtFor(o, result.series[0].column);
        const custom = Array.isArray(o.series_colors) ? o.series_colors : [];
        const lineColor = custom[1] || AMBER;
        const bars = Object.assign({ type: 'bar', label: result.series[0].column, data: result.series[0].values, yAxisID: 'y', order: 1 },
            k.barStyle(() => pal[0], false, 8));
        const line = Object.assign({ type: 'line', label: 'Cumulative %', data: result.series[1].values, yAxisID: 'y1', order: 0 },
            k.lineStyle(lineColor, 0, n, false));
        const eighty = {
            id: 'fxPareto80',
            afterDatasetsDraw: function (chart) {
                const y1 = chart.scales.y1;
                const a = chart.chartArea;
                if (!y1 || !a) return;
                const py = y1.getPixelForValue(80);
                const ctx = chart.ctx;
                ctx.save();
                ctx.strokeStyle = 'rgba(16,32,26,0.4)';
                ctx.setLineDash([5, 4]);
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(a.left, py);
                ctx.lineTo(a.right, py);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = k.tokens.soft;
                ctx.font = '600 11px ' + k.tokens.font;
                ctx.textAlign = 'right';
                ctx.textBaseline = 'bottom';
                ctx.fillText('80%', a.right - 4, py - 3);
                ctx.restore();
            }
        };
        return shell(result, opts, {
            type: 'bar',
            data: { labels: result.labels, datasets: [bars, line] },
            legend: true,
            tooltip: k.tooltip({
                label: function (ctx) {
                    if (ctx.datasetIndex === 1) return ' Cumulative: ' + ctx.parsed.y + '%';
                    return ' ' + (ctx.dataset.label || '') + ': ' + F.full(ctx.parsed.y);
                }
            }),
            scales: {
                y: { beginAtZero: true, grid: k.grid, border: k.noBorder, ticks: Object.assign({}, k.tick(), { callback: v => F.tick(v) }) },
                y1: { position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false, drawTicks: false }, border: k.noBorder,
                      ticks: Object.assign({}, k.tick(), { stepSize: 20, callback: v => v + '%' }) },
                x: { grid: k.noGrid, border: k.noBorder, ticks: k.tick() }
            },
            plugins: [eighty]
        });
    }

    // ---------- bullet ----------
    function bullet(result, name, opts, o) {
        need(result, 2, 'Bullet chart');
        const k = K();
        const pal = k.palette(name, o.series_colors);
        const actual = result.series[0].values;
        const target = result.series[1].values;
        const F = fmtFor(o, result.series[0].column);
        const band = function (frac, shade, order) {
            return { label: Math.round(frac * 100) + '% of target',
                     data: target.map(t => (t === null || t <= 0 ? null : t * frac)),
                     backgroundColor: 'rgba(16,32,26,' + shade + ')', hoverBackgroundColor: 'rgba(16,32,26,' + shade + ')',
                     borderWidth: 0, borderRadius: 0, grouped: false, barPercentage: 0.9, categoryPercentage: 0.9, order: order, fxBand: true };
        };
        const act = { label: result.series[0].column, data: actual, backgroundColor: pal[0], hoverBackgroundColor: pal[0],
                      borderWidth: 0, borderRadius: 4, borderSkipped: false, grouped: false, barPercentage: 0.36, categoryPercentage: 0.9, order: 0, fxActual: true };
        const top = Math.max.apply(null, target.map(t => (t === null ? 0 : t * 1.25)).concat(actual.map(a => (a === null ? 0 : a)), [1]));
        const marker = {
            id: 'fxBulletTarget',
            afterDatasetsDraw: function (chart) {
                const x = chart.scales.x;
                const bi = chart.data.datasets.findIndex(d => d.fxBand);
                if (!x || bi < 0) return;
                const meta = chart.getDatasetMeta(bi);
                const ctx = chart.ctx;
                ctx.save();
                ctx.strokeStyle = INK;
                ctx.lineWidth = 3;
                ctx.lineCap = 'round';
                target.forEach(function (t, i) {
                    const el = meta.data[i];
                    if (t === null || !el) return;
                    const p = el.getProps(['y', 'height'], true);
                    if (!Number.isFinite(p.y)) return;
                    const px = x.getPixelForValue(t);
                    ctx.beginPath();
                    ctx.moveTo(px, p.y - p.height * 0.36);
                    ctx.lineTo(px, p.y + p.height * 0.36);
                    ctx.stroke();
                });
                ctx.restore();
            }
        };
        return shell(result, opts, {
            type: 'bar',
            indexAxis: 'y',
            data: { labels: result.labels, datasets: [band(1.25, 0.06, 3), band(1, 0.13, 2), band(0.6, 0.22, 1), act] },
            legend: true,
            legendLabels: function () {
                return [
                    { text: 'Actual', fillStyle: pal[0], strokeStyle: pal[0], lineWidth: 0, hidden: false, pointStyle: 'rect' },
                    { text: 'Target', fillStyle: INK, strokeStyle: INK, lineWidth: 0, hidden: false, pointStyle: 'rectRot' }
                ];
            },
            interaction: { mode: 'index', intersect: false, axis: 'y' },
            tooltip: k.tooltip({
                filter: item => !!item.dataset.fxActual,
                title: items => (items.length ? result.labels[items[0].dataIndex] : ''),
                label: function (ctx) {
                    const i = ctx.dataIndex;
                    const t = target[i];
                    let s = ' Actual: ' + F.full(actual[i]);
                    if (t !== null) {
                        s += '  \u00B7  Target: ' + F.full(t);
                        if (t > 0 && actual[i] !== null) s += '  (' + Math.round(actual[i] / t * 1000) / 10 + '%)';
                    }
                    return s;
                }
            }),
            scales: {
                x: { beginAtZero: true, suggestedMax: top * 1.02, grid: k.grid, border: k.noBorder, ticks: Object.assign({}, k.tick(), { callback: v => F.tick(v) }) },
                y: { grid: k.noGrid, border: k.noBorder, ticks: k.tick() }
            },
            plugins: [marker]
        });
    }

    // ---------- density ----------
    function density(result, name, opts, o) {
        const k = K();
        const pal = k.palette(name, o.series_colors);
        const c = pal[0];
        const ys = result.series[0].values;
        const xName = (result.meta && result.meta.x) || result.series[0].column;
        const curve = o.smooth === false ? 0 : 0.4;
        const pts = result.labels.map((x, i) => ({ x: Number(x), y: ys[i] }));
        return shell(result, opts, {
            type: 'line',
            data: { datasets: [Object.assign({ label: 'Density', data: pts }, k.lineStyle(c, curve, 100, true), { pointRadius: 0, pointHoverRadius: 5, pointHitRadius: 10 })] },
            legend: false,
            interaction: { mode: 'nearest', axis: 'x', intersect: false },
            tooltip: k.tooltip({
                title: items => (items.length ? xName + ': ' + numText(items[0].parsed.x) : ''),
                label: ctx => ' Density: ' + Number(ctx.parsed.y.toPrecision(3))
            }),
            scales: {
                x: { type: 'linear', grid: k.noGrid, border: k.noBorder, ticks: Object.assign({}, k.tick(), { callback: v => numText(v) }), title: axisTitle(xName) },
                y: { beginAtZero: true, grid: k.grid, border: k.noBorder, ticks: Object.assign({}, k.tick(), { callback: v => numText(v) }), title: axisTitle('Density') }
            }
        });
    }

    // ---------- Gantt ----------
    function gantt(result, name, opts, o) {
        need(result, 2, 'Gantt chart');
        const k = K();
        const pal = k.palette(name, o.series_colors);
        const s = result.series[0].values;
        const e = result.series[1].values;
        const meta = result.meta || {};
        const isDate = meta.kind === 'date';
        const show = v => (isDate ? dayText(v) : numText(v));
        const rainbow = name === 'rainbow' && !(Array.isArray(o.series_colors) && o.series_colors.length);
        const lo = Number.isFinite(meta.min) ? meta.min : Math.min.apply(null, s.filter(v => v !== null));
        const hi = Number.isFinite(meta.max) ? meta.max : Math.max.apply(null, e.filter(v => v !== null));
        const pad = Math.max((hi - lo) * 0.03, isDate ? 1 : 0.5);
        return shell(result, opts, {
            type: 'bar',
            indexAxis: 'y',
            data: { labels: result.labels, datasets: [{
                label: 'Schedule',
                data: result.labels.map((_, i) => (s[i] === null || e[i] === null ? null : [s[i], e[i]])),
                backgroundColor: ctx => (rainbow ? pal[ctx.dataIndex % pal.length] : pal[0]),
                hoverBackgroundColor: ctx => (rainbow ? pal[ctx.dataIndex % pal.length] : pal[0]),
                borderWidth: 0, borderRadius: 6, borderSkipped: false, barPercentage: 0.62, categoryPercentage: 0.9, minBarLength: 3
            }] },
            legend: false,
            interaction: { mode: 'nearest', intersect: true, axis: 'y' },
            tooltip: k.tooltip({
                title: items => (items.length ? result.labels[items[0].dataIndex] : ''),
                label: function (ctx) {
                    const i = ctx.dataIndex;
                    const len = e[i] - s[i];
                    return ' ' + show(s[i]) + '  \u2192  ' + show(e[i]) + '  (' + numText(len) + (isDate ? ' days' : '') + ')';
                }
            }),
            scales: {
                x: { type: 'linear', min: lo - pad, max: hi + pad, grid: k.grid, border: k.noBorder,
                     ticks: Object.assign({}, k.tick(), isDate ? { precision: 0 } : {}, { maxTicksLimit: k.narrow() ? 4 : 9, callback: v => show(v) }) },
                y: { grid: k.noGrid, border: k.noBorder, ticks: k.tick() }
            }
        });
    }

    const BUILDERS = {
        stacked_area: stackedArea, dual_line: dualLine, bubble: bubble, waterfall: waterfall,
        funnel: funnel, pareto: pareto, bullet: bullet, density: density, gantt: gantt
    };

    return {
        has: function (type) { return Object.prototype.hasOwnProperty.call(BUILDERS, type); },
        keys: function () { return Object.keys(BUILDERS); },
        build: function (result, type, name, opts) {
            opts = opts || {};
            return BUILDERS[type](result, name, opts, opts.options || {});
        }
    };
})();