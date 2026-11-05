// Live page chart look (Phase 18C.2). Same soft style as the saved charts:
// gradient fills, rounded bars, card tooltips, compact numbers, Inter font.
// live_data.js calls LiveStyle.config() to build a chart and LiveStyle.sync()
// on every new data point. Without this file live_data.js falls back to its old look.
window.LiveStyle = (function () {
    const T = {
        ink: '#10201A',
        soft: '#55655F',
        grid: 'rgba(16,32,26,0.07)',
        track: '#E3E9E6',
        font: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
        tipBg: 'rgba(16,32,26,0.94)',
        tipBody: '#E6F5EF'
    };

    if (typeof window.Chart !== 'undefined' && window.Chart.defaults && window.Chart.defaults.font) {
        window.Chart.defaults.font.family = T.font;
        window.Chart.defaults.color = T.soft;
    }

    function alpha(hex, a) {
        if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) return hex;
        const n = parseInt(hex.slice(1), 16);
        return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    }

    function fmtFull(v) {
        const n = Number(v);
        if (v === null || v === undefined || !Number.isFinite(n)) return '-';
        return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    }

    function fmtCompact(v) {
        const n = Number(v);
        if (!Number.isFinite(n)) return String(v);
        const a = Math.abs(n);
        const t = x => String(Math.round(x * 10) / 10);
        if (a >= 1e9) return t(n / 1e9) + 'B';
        if (a >= 1e6) return t(n / 1e6) + 'M';
        if (a >= 1e3) return t(n / 1e3) + 'k';
        return fmtFull(n);
    }

    function reduceMotion() {
        return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    // colour of point i: chart.$liveColors is one colour string or an array
    function colorAt(chart, i) {
        const c = chart && chart.$liveColors;
        if (Array.isArray(c) && c.length) return c[(i || 0) % c.length];
        return typeof c === 'string' ? c : '#1F9D6E';
    }

    function barFill(ctx) {
        const chart = ctx.chart;
        const color = colorAt(chart, ctx.dataIndex);
        const scale = chart && chart.scales && chart.scales.y;
        const v = ctx.parsed && ctx.parsed.y;
        if (!scale || !chart.ctx || v === undefined || v === null) return color;
        const tip = scale.getPixelForValue(v);
        const base = scale.getPixelForValue(0);
        if (!Number.isFinite(tip) || !Number.isFinite(base) || Math.abs(tip - base) < 1) return color;
        const g = chart.ctx.createLinearGradient(0, tip, 0, base);
        g.addColorStop(0, color);
        g.addColorStop(1, alpha(color, 0.45));
        return g;
    }

    function areaFill(ctx) {
        const chart = ctx.chart;
        const color = colorAt(chart, 0);
        const a = chart && chart.chartArea;
        if (!a || !Number.isFinite(a.top) || !Number.isFinite(a.bottom)) return alpha(color, 0.2);
        const g = chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
        g.addColorStop(0, alpha(color, 0.34));
        g.addColorStop(1, alpha(color, 0.02));
        return g;
    }

    // ---------- plugins ----------
    // newest point: halo + value pill
    const headPlugin = {
        id: 'liveHead',
        afterDatasetsDraw: function (chart) {
            const meta = chart.getDatasetMeta(0);
            const ds = chart.data.datasets[0];
            if (!meta || !ds || !meta.data.length) return;
            const last = meta.data.length - 1;
            const el = meta.data[last];
            const raw = ds.data[last];
            const v = raw && typeof raw === 'object' ? raw.y : raw;
            if (v === null || v === undefined) return;
            const p = el.getProps(['x', 'y'], true);
            if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
            const color = colorAt(chart, last);
            const ctx = chart.ctx;
            ctx.save();
            ctx.fillStyle = alpha(color, 0.22);
            ctx.beginPath();
            ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#FFFFFF';
            ctx.strokeStyle = color;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 5.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            const text = fmtCompact(v);
            ctx.font = '600 11px ' + T.font;
            const w = ctx.measureText(text).width + 12;
            const h = 19;
            const x = Math.max(2, Math.min(p.x - w / 2, chart.width - w - 2));
            const y = Math.max(2, p.y - 18 - h);
            ctx.fillStyle = color;
            ctx.beginPath();
            const r = h / 2;
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + w, y, x + w, y + h, r);
            ctx.arcTo(x + w, y + h, x, y + h, r);
            ctx.arcTo(x, y + h, x, y, r);
            ctx.arcTo(x, y, x + w, y, r);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, x + w / 2, y + h / 2 + 0.5);
            ctx.restore();
        }
    };

    // soft glow behind scatter points
    const glowPlugin = {
        id: 'liveGlow',
        beforeDatasetsDraw: function (chart) {
            const meta = chart.getDatasetMeta(0);
            if (!meta || meta.data.length > 250) return;
            const ctx = chart.ctx;
            meta.data.forEach(function (el, i) {
                const p = el.getProps(['x', 'y'], true);
                if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
                const color = colorAt(chart, i);
                const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 17);
                g.addColorStop(0, alpha(color, 0.38));
                g.addColorStop(1, alpha(color, 0));
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(p.x, p.y, 17, 0, Math.PI * 2);
                ctx.fill();
            });
        }
    };

    // gauge: big latest value in the middle, 0 and max under the arc ends
    const gaugePlugin = {
        id: 'liveGauge',
        afterDatasetsDraw: function (chart) {
            const meta = chart.getDatasetMeta(0);
            if (!meta || !meta.data.length || chart.$gaugeValue === undefined || chart.$gaugeValue === null) return;
            const p = meta.data[0].getProps(['x', 'y', 'innerRadius', 'outerRadius'], true);
            if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
            const ctx = chart.ctx;
            const big = Math.max(18, Math.min(44, p.innerRadius * 0.55));
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = T.ink;
            ctx.font = '700 ' + big + 'px ' + T.font;
            ctx.fillText(fmtCompact(chart.$gaugeValue), p.x, p.y - big * 0.1);
            ctx.fillStyle = T.soft;
            ctx.font = '500 ' + Math.max(10, big * 0.36) + 'px ' + T.font;
            ctx.fillText('of ' + fmtCompact(chart.$gaugeMax), p.x, p.y + big * 0.42);
            const mid = (p.innerRadius + p.outerRadius) / 2;
            ctx.font = '500 11px ' + T.font;
            ctx.textBaseline = 'top';
            ctx.fillText('0', p.x - mid, p.y + 6);
            ctx.fillText(fmtCompact(chart.$gaugeMax), p.x + mid, p.y + 6);
            ctx.restore();
        }
    };

    // ---------- config ----------
    function config(type, speed) {
        const narrow = window.innerWidth < 600;
        const isGauge = type === 'gauge';
        const isBar = type === 'bar';
        const isScatter = type === 'scatter';
        const isLine = type === 'line';

        const tick = { color: T.soft, padding: 8, font: { size: narrow ? 10 : 12 } };
        const animation = (reduceMotion() || !(speed > 0)) ? false : { duration: speed, easing: 'easeOutCubic' };

        const tooltip = {
            enabled: !isGauge,
            backgroundColor: T.tipBg,
            titleColor: '#FFFFFF',
            bodyColor: T.tipBody,
            titleFont: { weight: '600', size: 13 },
            bodyFont: { size: 12 },
            padding: 12,
            cornerRadius: 10,
            caretSize: 6,
            boxPadding: 4,
            usePointStyle: true,
            animation: { duration: 120 },
            callbacks: {
                label: function (ctx) {
                    const p = ctx.parsed || {};
                    return ' ' + (ctx.dataset.label || 'Value') + ': ' + fmtFull(p.y);
                }
            }
        };

        let dataset;
        if (isGauge) {
            dataset = { label: 'Live Data', data: [], backgroundColor: [], borderWidth: 0, borderRadius: 8, spacing: 0 };
        } else if (isBar) {
            dataset = {
                label: 'Live Data', data: [],
                backgroundColor: barFill,
                hoverBackgroundColor: ctx => colorAt(ctx.chart, ctx.dataIndex),
                borderWidth: 0, borderRadius: 8, borderSkipped: 'start', pointStyle: 'rectRounded'
            };
        } else if (isScatter) {
            dataset = {
                label: 'Live Data', data: [],
                backgroundColor: ctx => alpha(colorAt(ctx.chart, ctx.dataIndex), 0.88),
                borderColor: '#FFFFFF', borderWidth: 2,
                pointStyle: 'circle', pointRadius: 6.5, pointHoverRadius: 9, pointHitRadius: 12
            };
        } else {
            dataset = {
                label: 'Live Data', data: [],
                borderColor: ctx => colorAt(ctx.chart, 0),
                backgroundColor: areaFill,
                fill: true,
                borderWidth: 2.5, borderCapStyle: 'round', borderJoinStyle: 'round',
                tension: 0.4, cubicInterpolationMode: 'monotone',
                pointStyle: 'circle',
                pointRadius: ctx => (ctx.chart.data.labels.length > 30 ? 0 : 3.5),
                pointBackgroundColor: '#FFFFFF',
                pointBorderColor: ctx => colorAt(ctx.chart, ctx.dataIndex),
                pointBorderWidth: 2, pointHoverRadius: 6, pointHitRadius: 14
            };
        }

        const options = {
            responsive: true,
            maintainAspectRatio: false,
            animation: animation,
            layout: { padding: { top: isGauge ? 4 : 28, right: 12 } },
            interaction: (isLine || isBar) ? { mode: 'index', intersect: false } : { mode: 'nearest', intersect: true },
            plugins: { legend: { display: false }, tooltip: tooltip },
            scales: isGauge ? {} : {
                y: {
                    beginAtZero: true,
                    grid: { color: T.grid, drawTicks: false, drawBorder: false },
                    border: { display: false },
                    ticks: Object.assign({}, tick, { callback: v => fmtCompact(v) })
                },
                x: Object.assign({
                    grid: { display: false, drawBorder: false },
                    border: { display: false },
                    ticks: Object.assign({}, tick, { maxTicksLimit: narrow ? 5 : 8, maxRotation: narrow ? 45 : 0 })
                }, isScatter ? { type: 'category' } : {})
            }
        };
        if (isGauge) {
            options.rotation = -90;
            options.circumference = 180;
            options.cutout = '74%';
        }

        const plugins = isGauge ? [gaugePlugin] : isScatter ? [glowPlugin, headPlugin] : [headPlugin];
        return {
            type: isGauge ? 'doughnut' : type,
            data: { labels: [], datasets: [dataset] },
            options: options,
            plugins: plugins
        };
    }

    function niceMax(value) {
        const raw = Math.max(value, 1) * 1.2;
        const step = Math.pow(10, Math.floor(Math.log10(raw))) / 2;
        return Math.ceil(raw / step) * step;
    }

    // colors: one colour string, or an array (one per point)
    function sync(chart, type, labels, values, colors) {
        if (!chart) return;
        chart.$liveColors = colors;
        const ds = chart.data.datasets[0];
        if (type === 'gauge') {
            if (!values.length) {
                chart.data.labels = [];
                ds.data = [];
                chart.$gaugeValue = null;
                return;
            }
            const latest = Number(values[values.length - 1]) || 0;
            const peak = Math.max.apply(null, values.map(v => Math.abs(Number(v) || 0)));
            chart.$gaugeMax = Math.max(chart.$gaugeMax || 0, niceMax(peak));
            chart.$gaugeValue = latest;
            const shown = Math.max(0, Math.min(latest, chart.$gaugeMax));
            const color = colorAt(chart, values.length - 1);
            chart.data.labels = ['Latest', 'Remaining'];
            ds.data = [shown, chart.$gaugeMax - shown];
            ds.backgroundColor = [color, T.track];
            return;
        }
        chart.data.labels = labels;
        if (type === 'scatter') {
            ds.data = values.map((v, i) => ({ x: String(labels[i]), y: v }));
        } else {
            ds.data = values;
        }
    }

    // Sharp copy on a white background (for Export Image)
    function hiRes(chart, scale) {
        const dpr0 = chart.options.devicePixelRatio;
        const anim0 = chart.options.animation;
        const s = Math.max(1, Math.min(scale || 3, 8000 / Math.max(chart.width, chart.height, 1)));
        try {
            chart.options.devicePixelRatio = s;
            chart.options.animation = false;
            chart.resize();
            const out = document.createElement('canvas');
            out.width = chart.canvas.width;
            out.height = chart.canvas.height;
            const c = out.getContext('2d');
            c.fillStyle = '#FFFFFF';
            c.fillRect(0, 0, out.width, out.height);
            c.drawImage(chart.canvas, 0, 0);
            return out;
        } finally {
            chart.options.devicePixelRatio = dpr0 || window.devicePixelRatio || 1;
            chart.options.animation = anim0;
            chart.resize();
        }
    }

    return { config: config, sync: sync, hiRes: hiRes, tokens: T };
})();