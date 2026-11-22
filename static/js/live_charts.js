// Live page chart engine. Draws a stream of points with the SAME renderers as saved charts
// (FluxionChart.buildConfig), but updates in place: old points stay where they are, only the
// new point is added (and highlighted). Axes only ever grow, so bars never jump up and down.
// Types that need several columns (stacked, combo, bubble, ...) are not offered on the live page.
window.LiveCharts = (function () {
    const GROUPS = [
        ['Compare', ['bar', 'hbar', 'radar']],
        ['Trend', ['line', 'area', 'sparkline']],
        ['Parts of a whole', ['pie', 'doughnut', 'funnel', 'waterfall', 'pareto']],
        ['Spread', ['histogram', 'density']],
        ['Relationship', ['scatter']],
        ['Plan and progress', ['gauge']]
    ];
    const SUPPORTED = [].concat.apply([], GROUPS.map(g => g[1]));
    // charts whose old numbers do not live in a plugin: they can be updated in place
    const IN_PLACE = ['line', 'area', 'bar', 'hbar', 'scatter', 'radar', 'pie', 'doughnut', 'histogram'];
    const FIXED_AXIS = ['line', 'area', 'bar', 'hbar', 'scatter'];
    const HEAD = ['line', 'area', 'bar', 'hbar', 'scatter', 'radar'];

    const FC = () => window.FluxionChart;

    function niceMax(value) {
        const raw = Math.max(value, 1) * 1.15;
        const step = Math.pow(10, Math.floor(Math.log10(raw))) / 2;
        return Math.ceil(raw / step) * step;
    }

    function num(v) {
        return Number.isFinite(Number(v)) ? Number(v) : 0;
    }

    function edge(v) {
        return String(Math.round(v * 100) / 100);
    }

    function reduceMotion() {
        return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    // ---------- turn the points into the "result" the saved-chart renderers expect ----------
    function series(values, agg) {
        return { name: 'Live Data', column: 'Live Data', agg: agg || null, values: values };
    }

    function histogram(values) {
        const empty = { labels: [], series: [series([], 'count')], meta: { mode: 'histogram' } };
        if (!values.length) return empty;
        let lo = Math.min.apply(null, values);
        let hi = Math.max.apply(null, values);
        if (lo === hi) { lo -= 0.5; hi += 0.5; }
        const bins = Math.max(3, Math.min(10, Math.ceil(Math.sqrt(values.length))));
        const step = (hi - lo) / bins;
        const counts = new Array(bins).fill(0);
        values.forEach(function (v) {
            let i = Math.floor((v - lo) / step);
            if (i >= bins) i = bins - 1;
            counts[i] += 1;
        });
        return {
            labels: counts.map((_, i) => edge(lo + i * step) + ' to ' + edge(lo + (i + 1) * step)),
            series: [series(counts, 'count')], meta: { mode: 'histogram' }
        };
    }

    function density(values) {
        const empty = { labels: [], series: [series([], 'density')], meta: { mode: 'density', x: 'Live Data' } };
        const n = values.length;
        if (n < 2) return empty;
        const mean = values.reduce((a, b) => a + b, 0) / n;
        const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (n - 1));
        if (!(sd > 0)) return empty;
        const bw = 0.9 * sd * Math.pow(n, -0.2);
        const lo = Math.min.apply(null, values) - 3 * bw;
        const hi = Math.max.apply(null, values) + 3 * bw;
        const labels = [];
        const ys = [];
        for (let g = 0; g < 100; g++) {
            const x = lo + (hi - lo) * g / 99;
            let d = 0;
            for (let i = 0; i < n; i++) {
                const z = (x - values[i]) / bw;
                d += Math.exp(-0.5 * z * z);
            }
            labels.push(Number(x.toPrecision(6)));
            ys.push(Number((d / (n * bw * Math.sqrt(2 * Math.PI))).toPrecision(6)));
        }
        return { labels: labels, series: [series(ys, 'density')], meta: { mode: 'density', x: 'Live Data' } };
    }

    function sortedPairs(points, limit) {
        return points.map(p => ({ label: p.label, value: p.value }))
            .sort((a, b) => b.value - a.value).slice(0, limit);
    }

    function shape(type, points, ctl) {
        const labels = points.map(p => p.label);
        const values = points.map(p => p.value);
        const latest = values.length ? values[values.length - 1] : null;
        if (type === 'scatter') {
            return { labels: points.map((p, i) => (p.row || i + 1)), series: [series(values)], meta: { mode: 'raw' } };
        }
        if (type === 'histogram') return histogram(values);
        if (type === 'density') return density(values);
        if (type === 'gauge') {
            ctl.gaugeMax = Math.max(ctl.gaugeMax, niceMax(Math.max.apply(null, values.concat([0]))));
            const pct = latest === null ? null : Math.round(latest / ctl.gaugeMax * 10000) / 100;
            return { labels: [], series: [series([latest])],
                meta: { mode: 'gauge', column: 'Live Data', agg: null, value: latest, min: 0, max: ctl.gaugeMax, pct: pct } };
        }
        if (type === 'waterfall') {
            const start = [], end = [];
            let run = 0;
            values.forEach(function (v) { start.push(run); run += v; end.push(run); });
            return {
                labels: labels.concat(['Total']),
                series: [series(values.concat([run]), 'sum'), { name: 'Start', column: 'Live Data', agg: null, values: start.concat([0]) },
                         { name: 'End', column: 'Live Data', agg: null, values: end.concat([run]) }],
                meta: { mode: 'waterfall', total: run, total_index: values.length }
            };
        }
        if (type === 'funnel') {
            const top = sortedPairs(points, 8);
            return { labels: top.map(p => p.label), series: [series(top.map(p => p.value), 'sum')], meta: { mode: 'grouped' } };
        }
        if (type === 'pareto') {
            const top = sortedPairs(points, 10).map(p => ({ label: p.label, value: Math.max(p.value, 0) }));
            const total = top.reduce((a, p) => a + p.value, 0);
            let run = 0;
            const cum = top.map(function (p) { run += p.value; return total > 0 ? Math.round(run / total * 10000) / 100 : 0; });
            return { labels: top.map(p => p.label),
                series: [series(top.map(p => p.value), 'sum'), { name: 'Cumulative %', column: 'Live Data', agg: 'cum_pct', values: cum }],
                meta: { mode: 'pareto', total: total } };
        }
        return { labels: labels, series: [series(values, 'sum')], meta: { mode: 'grouped' } };
    }

    // ---------- highlight of the newest point ----------
    function headPlugin(ctl) {
        return {
            id: 'liveHead',
            afterDatasetsDraw: function (chart) {
                const meta = chart.getDatasetMeta(0);
                const ds = chart.data.datasets[0];
                if (!meta || !ds || !meta.data.length) return;
                const last = meta.data.length - 1;
                const raw = ds.data[last];
                const v = raw && typeof raw === 'object' ? (raw.y !== undefined ? raw.y : raw.r) : raw;
                if (v === null || v === undefined) return;
                const p = meta.data[last].getProps(['x', 'y'], true);
                if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
                const color = FC().getColors(1, ctl.scheme)[0];
                const ctx = chart.ctx;
                ctx.save();
                ctx.fillStyle = color + '38';
                ctx.beginPath();
                ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#FFFFFF';
                ctx.strokeStyle = color;
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.arc(p.x, p.y, 5.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                const text = FC().fmtCompact(v);
                ctx.font = '600 11px ' + FC().tokens.font;
                const w = ctx.measureText(text).width + 12;
                const h = 19;
                const x = Math.max(2, Math.min(p.x - w / 2, chart.width - w - 2));
                const y = Math.max(2, p.y - 20 - h);
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
    }

    // ---------- controller ----------
    function create(canvas) {
        const ctl = { type: 'line', scheme: 'default', speed: 750, max: 20, points: [], chart: null,
                      builtType: null, peak: 0, floor: 0, gaugeMax: 0 };

        function animation(on) {
            if (!on || !(ctl.speed > 0) || reduceMotion()) return false;
            return { duration: Math.round(ctl.speed * 0.6), easing: 'easeOutCubic' };
        }

        function build() {
            const result = shape(ctl.type, ctl.points, ctl);
            const cfg = FC().buildConfig(result, ctl.type, ctl.scheme, { maintainAspectRatio: false, options: { animate: false } });
            const key = ctl.type === 'hbar' ? 'x' : 'y';
            if (FIXED_AXIS.indexOf(ctl.type) !== -1 && cfg.options.scales && cfg.options.scales[key]) {
                const sc = cfg.options.scales[key];
                delete sc.suggestedMax;
                sc.max = niceMax(ctl.peak);
                sc.min = ctl.floor < 0 ? -niceMax(-ctl.floor) : 0;
            }
            return cfg;
        }

        // append: a point was just added (animate only that one). slid: the window moved (no animation).
        function render(append, slid) {
            const cfg = build();
            if (IN_PLACE.indexOf(ctl.type) !== -1 && ctl.chart && ctl.builtType === ctl.type) {
                const chart = ctl.chart;
                chart.data.labels = cfg.data.labels;
                cfg.data.datasets.forEach(function (d, i) {
                    const target = chart.data.datasets[i];
                    if (!target) return;
                    target.data = d.data;
                    if (Array.isArray(d.backgroundColor)) target.backgroundColor = d.backgroundColor;
                    if (Array.isArray(d.borderColor)) target.borderColor = d.borderColor;
                });
                ['x', 'y'].forEach(function (k) {
                    const from = cfg.options.scales && cfg.options.scales[k];
                    const to = chart.options.scales && chart.options.scales[k];
                    if (from && to) { to.max = from.max; to.min = from.min; }
                });
                chart.options.animation = animation(append && !slid);
                chart.update(slid ? 'none' : undefined);
                return;
            }
            if (ctl.chart) ctl.chart.destroy();
            cfg.options.animation = false;
            cfg.plugins = (cfg.plugins || []).concat(HEAD.indexOf(ctl.type) !== -1 ? [headPlugin(ctl)] : []);
            ctl.chart = new window.Chart(canvas.getContext('2d'), cfg);
            ctl.builtType = ctl.type;
        }

        function trim() {
            let slid = false;
            while (ctl.points.length > ctl.max) { ctl.points.shift(); slid = true; }
            return slid;
        }

        return {
            canvas: canvas,
            push: function (point) {
                ctl.points.push(point);
                if (point.value > ctl.peak) ctl.peak = point.value;
                if (point.value < ctl.floor) ctl.floor = point.value;
                render(true, trim());
            },
            setType: function (type) {
                if (SUPPORTED.indexOf(type) === -1 || type === ctl.type) return;
                ctl.type = type;
                if (ctl.points.length) render(false, true);
                else if (ctl.chart) { ctl.chart.destroy(); ctl.chart = null; }
            },
            setScheme: function (scheme) {
                ctl.scheme = scheme;
                ctl.builtType = null;   // colours changed: rebuild once
                if (ctl.points.length) render(false, true);
            },
            setMax: function (n) {
                ctl.max = Math.max(3, Number(n) || 20);
                if (trim() && ctl.points.length) render(false, true);
            },
            setSpeed: function (ms) { ctl.speed = Math.max(0, Number(ms) || 0); },
            clear: function () {
                ctl.points = [];
                ctl.peak = 0;
                ctl.floor = 0;
                ctl.gaugeMax = 0;
                if (ctl.chart) { ctl.chart.destroy(); ctl.chart = null; }
                ctl.builtType = null;
            },
            points: function () { return ctl.points.slice(); },
            hasData: function () { return ctl.points.length > 0; },
            // sharp copy on a white background (for Save image)
            png: function () {
                const chart = ctl.chart;
                if (!chart) return Promise.resolve(null);
                const dpr0 = chart.options.devicePixelRatio;
                const anim0 = chart.options.animation;
                const scale = Math.max(1, Math.min(3, 8000 / Math.max(chart.width, chart.height, 1)));
                let out;
                try {
                    chart.options.devicePixelRatio = scale;
                    chart.options.animation = false;
                    chart.resize();
                    out = document.createElement('canvas');
                    out.width = chart.canvas.width;
                    out.height = chart.canvas.height;
                    const c = out.getContext('2d');
                    c.fillStyle = '#FFFFFF';
                    c.fillRect(0, 0, out.width, out.height);
                    c.drawImage(chart.canvas, 0, 0);
                } finally {
                    chart.options.devicePixelRatio = dpr0 || window.devicePixelRatio || 1;
                    chart.options.animation = anim0;
                    chart.resize();
                }
                return new Promise(resolve => out.toBlob(resolve, 'image/png'));
            }
        };
    }

    return { create: create, GROUPS: GROUPS, SUPPORTED: SUPPORTED };
})();