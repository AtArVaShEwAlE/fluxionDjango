// Phase 20: widgets drawn on the chart canvas (gauge, sparkline). They go through the same
// path as charts, so reports, boards, shared pages and board PNG/PDF export need no changes.
// Loaded after chart_tier_a.js, which gives us register(), kit() and fmtFor().
(function () {
    const A = window.FluxionTierA;
    if (!A || !A.register) return;
    const INK = '#10201A';
    const RED = '#E5484D';
    const GREEN = '#1F9D6E';
    const AGG_WORD = { sum: 'Total', avg: 'Average', count: 'Count', min: 'Minimum', max: 'Maximum' };

    const kit = () => A.kit();
    const FONT = () => kit().tokens.font;
    const SOFT = () => kit().tokens.soft;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    function fit(ctx, text, maxWidth) {
        if (ctx.measureText(text).width <= maxWidth) return text;
        let t = text;
        while (t.length > 1 && ctx.measureText(t + '\u2026').width > maxWidth) t = t.slice(0, -1);
        return t + '\u2026';
    }

    function numText(F, v) {
        if (v === null || v === undefined) return '-';
        return Math.abs(v) >= 100000 ? F.tick(v) : F.full(v);
    }

    function pctText(p) {
        return (Math.round(p * 10) / 10) + '%';
    }

    // A chart with no data and hidden axes. The plugin does all the drawing.
    function shell(opts, plugin, type, data, extra) {
        const hidden = { display: false, grid: { display: false }, ticks: {}, border: { display: false } };
        return {
            type: type || 'bar',
            data: data || { labels: [], datasets: [] },
            options: Object.assign({
                responsive: true,
                maintainAspectRatio: opts.maintainAspectRatio === undefined ? true : opts.maintainAspectRatio,
                animation: false,
                events: [],
                layout: { padding: 0 },
                plugins: { title: { display: false }, legend: { display: false }, tooltip: { enabled: false } },
                scales: { x: Object.assign({}, hidden), y: Object.assign({}, hidden) }
            }, extra || {}),
            plugins: [plugin]
        };
    }

    function label(ctx, text, x, y, size, maxWidth) {
        ctx.font = '600 ' + size + 'px ' + FONT();
        ctx.fillStyle = SOFT();
        ctx.textAlign = 'left';
        ctx.fillText(fit(ctx, text, maxWidth), x, y);
    }

    function pill(ctx, pct, x, y, size) {
        if (pct === null || pct === undefined) return;
        const up = pct >= 0;
        ctx.font = '700 ' + size + 'px ' + FONT();
        ctx.fillStyle = up ? GREEN : RED;
        ctx.textAlign = 'left';
        ctx.fillText((up ? '\u25B2 ' : '\u25BC ') + pctText(Math.abs(pct)), x, y);
    }

    // ---------- Gauge: dial with 3 zones, ticks and a needle ----------
    function gauge(result, name, opts, o) {
        const meta = result.meta || {};
        const F = A.fmtFor(o, meta.column);
        const accent = kit().palette(name, o.series_colors)[0];
        const plugin = {
            id: 'fxGauge',
            afterDraw: function (chart) {
                const ctx = chart.ctx, w = chart.width, h = chart.height;
                if (w < 120 || h < 110) return;
                const k = kit();
                const pad = Math.max(10, Math.min(w, h) * 0.05);
                const small = clamp(h * 0.065, 11, 14);
                const valSize = clamp(h * 0.13, 18, 40);
                const r = Math.max(40, Math.min(w * 0.44, h - pad * 2 - valSize * 1.25 - small * 2.2));
                const cx = w / 2;
                const cy = pad + r + 4;
                const thick = r * 0.2;
                const mid = r - thick / 2;
                const raw = meta.pct === null || meta.pct === undefined ? 0 : meta.pct;
                const p = clamp(raw / 100, 0, 1);
                ctx.save();
                // three zones, light to strong
                ctx.lineWidth = thick;
                ctx.lineCap = 'butt';
                [0.28, 0.55, 1].forEach(function (alpha, i) {
                    ctx.strokeStyle = k.alpha(accent, alpha);
                    ctx.beginPath();
                    ctx.arc(cx, cy, mid, Math.PI + Math.PI * i / 3 + 0.025, Math.PI + Math.PI * (i + 1) / 3 - 0.025);
                    ctx.stroke();
                });
                // ticks inside the ring
                ctx.strokeStyle = 'rgba(16,32,26,0.35)';
                ctx.lineWidth = 1.2;
                ctx.lineCap = 'round';
                for (let t = 0; t <= 10; t++) {
                    const ang = Math.PI + Math.PI * t / 10;
                    const r1 = r - thick - 5;
                    const r2 = r1 - (t % 5 === 0 ? 9 : 5);
                    ctx.beginPath();
                    ctx.moveTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
                    ctx.lineTo(cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2);
                    ctx.stroke();
                }
                // needle + hub
                const a = Math.PI + Math.PI * p;
                const tip = r - thick - 16;
                ctx.strokeStyle = INK;
                ctx.lineWidth = Math.max(2.5, r * 0.035);
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(cx + Math.cos(a) * tip, cy + Math.sin(a) * tip);
                ctx.stroke();
                ctx.fillStyle = INK;
                ctx.beginPath();
                ctx.arc(cx, cy, Math.max(5, r * 0.07), 0, Math.PI * 2);
                ctx.fill();
                // min / max under the ring ends
                ctx.textBaseline = 'alphabetic';
                ctx.textAlign = 'center';
                ctx.font = '500 ' + small + 'px ' + FONT();
                ctx.fillStyle = SOFT();
                ctx.fillText(numText(F, meta.min), cx - mid, cy + small * 1.3);
                ctx.fillText(numText(F, meta.max), cx + mid, cy + small * 1.3);
                // value + caption
                const text = numText(F, meta.value);
                let size = valSize;
                ctx.font = '700 ' + size + 'px ' + FONT();
                while (size > 14 && ctx.measureText(text).width > r * 1.1) {
                    size -= 2;
                    ctx.font = '700 ' + size + 'px ' + FONT();
                }
                const vy = cy + small * 1.3 + size * 1.05;
                ctx.fillStyle = INK;
                ctx.fillText(text, cx, vy);
                ctx.font = '500 ' + small + 'px ' + FONT();
                ctx.fillStyle = SOFT();
                const cap = (AGG_WORD[meta.agg] || '') + ' \u00B7 ' + (meta.column || '') +
                    (meta.pct === null || meta.pct === undefined ? '' : ' \u00B7 ' + pctText(meta.pct) + ' of range');
                ctx.fillText(fit(ctx, cap, w - pad * 2), cx, vy + small * 1.5);
                ctx.restore();
            }
        };
        return shell(opts, plugin);
    }

    // ---------- Sparkline (Customise: colour, smooth, fill, points, high/low, header, number format, animate) ----------
    function sparkline(result, name, opts, o) {
        const k = kit();
        const s = result.series[0];
        const F = A.fmtFor(o, s.column);
        const accent = k.palette(name, o.series_colors)[0];
        const vals = s.values;
        const n = result.labels.length;
        const header = o.spark_header !== false;
        const showMinMax = o.spark_minmax === true;
        const idx = [];
        vals.forEach(function (v, i) { if (v !== null) idx.push(i); });
        const last = idx.length ? vals[idx[idx.length - 1]] : null;
        const prev = idx.length > 1 ? vals[idx[idx.length - 2]] : null;
        const change = last !== null && prev ? (last - prev) / Math.abs(prev) * 100 : null;
        let hi = -1, lo = -1;
        idx.forEach(function (i) {
            if (hi < 0 || vals[i] > vals[hi]) hi = i;
            if (lo < 0 || vals[i] < vals[lo]) lo = i;
        });
        const plugin = {
            id: 'fxSparkline',
            afterDatasetsDraw: function (chart) {
                if (!showMinMax || hi < 0 || hi === lo) return;
                const ctx = chart.ctx;
                const meta = chart.getDatasetMeta(0);
                const small = 11;
                ctx.save();
                ctx.font = '700 ' + small + 'px ' + FONT();
                ctx.textAlign = 'center';
                [[hi, GREEN, -9], [lo, RED, 16]].forEach(function (m) {
                    const el = meta.data[m[0]];
                    if (!el || !Number.isFinite(el.x) || !Number.isFinite(el.y)) return;
                    ctx.fillStyle = '#FFFFFF';
                    ctx.beginPath();
                    ctx.arc(el.x, el.y, 5.5, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = m[1];
                    ctx.beginPath();
                    ctx.arc(el.x, el.y, 4, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = INK;
                    ctx.fillText(numText(F, vals[m[0]]), clamp(el.x, 24, chart.width - 24), clamp(el.y + m[2], 11, chart.height - 3));
                });
                ctx.restore();
            },
            afterDraw: function (chart) {
                if (!header) return;
                const ctx = chart.ctx, w = chart.width, h = chart.height;
                if (w < 80 || h < 70) return;
                const pad = 12;
                const small = clamp(h * 0.07, 11, 14);
                ctx.save();
                ctx.textBaseline = 'alphabetic';
                label(ctx, (AGG_WORD[s.agg] || '') + ' \u00B7 ' + s.column, pad, pad + small, small, w - pad * 2);
                const text = numText(F, last);
                const size = clamp(h * 0.18, 20, 40);
                ctx.font = '700 ' + size + 'px ' + FONT();
                ctx.fillStyle = INK;
                ctx.textAlign = 'left';
                ctx.fillText(text, pad, pad + small + size + 4);
                const tw = ctx.measureText(text).width;
                if (change !== null && w - pad * 2 - tw > 70) pill(ctx, change, pad + tw + 12, pad + small + size + 4, small + 1);
                ctx.restore();
            }
        };
        return shell(opts, plugin, 'line', {
            labels: result.labels,
            datasets: [Object.assign({ label: s.column, data: vals },
                k.lineStyle(accent, o.smooth === false ? 0 : 0.4, n, o.gradient !== false),
                { pointRadius: o.spark_points === true ? 3 : 0, pointHoverRadius: 5, borderWidth: 2.5 })]
        }, {
            animation: o.animate === false ? false : k.animation(Math.max(n, 1)),
            events: ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove'],
            interaction: { mode: 'index', intersect: false },
            layout: { padding: { top: header ? 62 : (showMinMax ? 24 : 10), left: 6, right: 6, bottom: showMinMax ? 18 : 4 } },
            plugins: {
                title: { display: false }, legend: { display: false },
                tooltip: k.tooltip({
                    title: items => (items.length ? String(items[0].label) : ''),
                    label: ctx => ' ' + F.full(ctx.parsed.y)
                })
            },
            scales: {
                x: { display: false, grid: { display: false }, ticks: {}, border: { display: false } },
                y: { display: false, beginAtZero: false, grace: '8%', grid: { display: false }, ticks: {}, border: { display: false } }
            }
        });
    }

    A.register('gauge', gauge);
    A.register('sparkline', sparkline);
})();