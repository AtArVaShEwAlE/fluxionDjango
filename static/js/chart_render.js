// Shared chart renderer. Turns a server query result {labels, series, meta}
// into a full Chart.js config, so a chart looks the same in the builder,
// My Charts, Reports, Boards and the public pages.
// Phase 18A: one soft design system (tokens, gradients, rounded shapes,
// card tooltips, compact numbers, lively entry animation).
window.FluxionChart = (function () {
    const colorSchemes = {
        default: ['#1F9D6E', '#34C08D', '#157A56', '#6EE7B7', '#0E5C40'],
        blue: ['#3B82F6', '#2563EB', '#1D4ED8', '#1E40AF', '#1E3A8A'],
        purple: ['#8B5CF6', '#7C3AED', '#6D28D9', '#5B21B6', '#4C1D95'],
        rainbow: ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#3B82F6', '#8B5CF6']
    };
    // Chart.js has no 'hbar' / 'area' type: they are bar / line plus options.
    const JS_TYPE = { hbar: 'bar', area: 'line', stacked: 'bar', combo: 'bar', histogram: 'bar' };

    // Design tokens
    const T = {
        ink: '#10201A',
        soft: '#55655F',
        grid: 'rgba(16,32,26,0.07)',
        font: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
        tipBg: 'rgba(16,32,26,0.94)',
        tipBody: '#E6F5EF'
    };

    if (typeof window.Chart !== 'undefined' && window.Chart.defaults && window.Chart.defaults.font) {
        window.Chart.defaults.font.family = T.font;
        window.Chart.defaults.color = T.soft;
    }

    function reduceMotion() {
        return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    function withAlpha(hex, alpha) {
        const n = parseInt(hex.slice(1), 16);
        return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
    }

    // ---- number formatting ----
    function fmtFull(v) {
        const n = Number(v);
        if (v === null || v === undefined || !Number.isFinite(n)) return '-';
        return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    }

    function trim1(x) {
        return String(Math.round(x * 10) / 10);
    }

    // 1.2k, 3.4M, 2B. Used on value-axis ticks only.
    function fmtCompact(v) {
        const n = Number(v);
        if (!Number.isFinite(n)) return String(v);
        const a = Math.abs(n);
        if (a >= 1e9) return trim1(n / 1e9) + 'B';
        if (a >= 1e6) return trim1(n / 1e6) + 'M';
        if (a >= 1e3) return trim1(n / 1e3) + 'k';
        return fmtFull(n);
    }

    // ---- fills ----
    // Per-bar gradient: tip = full colour, base = softer. Positions come from
    // the value scale (not the bar element, which has no size on first draw).
    function barFill(colorAt, horizontal) {
        return function (ctx) {
            const color = colorAt(ctx.dataIndex, ctx.datasetIndex);
            const chart = ctx.chart;
            const scale = chart && chart.scales && chart.scales[horizontal ? 'x' : 'y'];
            const parsed = ctx.parsed;
            if (!scale || !parsed || !chart.ctx) return color;
            const v = horizontal ? parsed.x : parsed.y;
            const tip = scale.getPixelForValue(v);
            const base = scale.getPixelForValue(0);
            if (!Number.isFinite(tip) || !Number.isFinite(base) || Math.abs(tip - base) < 1) return color;
            const g = horizontal
                ? chart.ctx.createLinearGradient(tip, 0, base, 0)
                : chart.ctx.createLinearGradient(0, tip, 0, base);
            g.addColorStop(0, color);
            g.addColorStop(1, withAlpha(color, 0.45));
            return g;
        };
    }

    // Area fill: colour at top of the plot fading to nothing at the bottom.
    function areaFill(color) {
        return function (ctx) {
            const area = ctx.chart && ctx.chart.chartArea;
            if (!area || !Number.isFinite(area.top) || !Number.isFinite(area.bottom)) return withAlpha(color, 0.2);
            const g = ctx.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
            g.addColorStop(0, withAlpha(color, 0.38));
            g.addColorStop(1, withAlpha(color, 0.02));
            return g;
        };
    }

    // Scatter X that is not all numbers (text, dates): use a category axis
    function isCategorical(labels) {
        return labels.some(l => !Number.isFinite(Number(l)));
    }

    // one tick per distinct value, dates sorted
    function categoryLabels(labels) {
        const uniq = [...new Set(labels.map(String))];
        if (uniq.every(l => /^\d{4}-\d{2}-\d{2}$/.test(l))) uniq.sort();
        return uniq;
    }

    function schemeName(name) {
        return colorSchemes[name] ? name : 'default';
    }

    function getColors(count, name) {
        const palette = colorSchemes[schemeName(name)];
        const colors = [];
        for (let i = 0; i < count; i++) {
            colors.push(palette[i % palette.length]);
        }
        return colors;
    }

    // ---- dataset styles ----
    function barStyle(colorAt, horizontal, radius, solid) {
        return {
            backgroundColor: solid ? function (ctx) { return colorAt(ctx.dataIndex, ctx.datasetIndex); } : barFill(colorAt, horizontal),
            hoverBackgroundColor: function (ctx) { return colorAt(ctx.dataIndex, ctx.datasetIndex); },
            borderWidth: 0,
            borderRadius: radius,
            borderSkipped: radius ? 'start' : false,
            pointStyle: 'rectRounded'
        };
    }

    function lineStyle(color, curve, count, fill) {
        return {
            borderColor: color,
            borderWidth: 2.5,
            borderCapStyle: 'round',
            borderJoinStyle: 'round',
            backgroundColor: fill ? areaFill(color) : color,
            fill: !!fill,
            tension: curve,
            ...(curve ? { cubicInterpolationMode: 'monotone' } : {}),
            pointStyle: 'circle',
            pointRadius: count > 40 ? 0 : 3.5,
            pointBackgroundColor: '#FFFFFF',
            pointBorderColor: color,
            pointBorderWidth: 2,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: color,
            pointHoverBorderColor: withAlpha(color, 0.25),
            pointHoverBorderWidth: 8,
            pointHitRadius: 14
        };
    }

    function toChartJsData(result, chartType, name, extra) {
        const scheme = schemeName(name);
        const custom = (extra && extra.colors) || [];
        const base = colorSchemes[scheme];
        const palette = Array.from({ length: Math.max(base.length, custom.length) }, (_, i) => custom[i] || base[i]);
        const curve = (extra && extra.smooth === false) ? 0 : 0.4;
        const labels = result.labels;
        const series = result.series[0];
        const values = series.values;

        if (chartType === 'pie' || chartType === 'doughnut') {
            const pl = [];
            const pv = [];
            labels.forEach((label, i) => {
                if (values[i] !== null) {
                    pl.push(label);
                    pv.push(values[i]);
                }
            });
            return {
                labels: pl,
                datasets: [{
                    data: pv,
                    backgroundColor: pv.map((_, i) => palette[i % palette.length]),
                    borderColor: '#FFFFFF',
                    borderWidth: 2,
                    borderRadius: 6,
                    spacing: 2,
                    hoverOffset: 12,
                    pointStyle: 'circle'
                }]
            };
        }

        if (chartType === 'scatter') {
            const categorical = isCategorical(labels);
            const points = [];
            labels.forEach((label, i) => {
                if (values[i] === null) return;
                points.push({ x: categorical ? String(label) : Number(label), y: values[i] });
            });
            return {
                datasets: [{
                    label: series.column,
                    data: points,
                    backgroundColor: withAlpha(palette[0], 0.7),
                    borderColor: '#FFFFFF',
                    borderWidth: 1.5,
                    pointStyle: 'circle',
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    pointHoverBackgroundColor: palette[0],
                    pointHoverBorderColor: withAlpha(palette[0], 0.25),
                    pointHoverBorderWidth: 8,
                    pointHitRadius: 10
                }]
            };
        }

        if (chartType === 'histogram') {
            return {
                labels: labels,
                datasets: [Object.assign({
                    label: series.column,
                    data: values,
                    barPercentage: 0.94,
                    categoryPercentage: 1
                }, barStyle(() => palette[0], false, 4))]
            };
        }

        const n = result.series.length;
        const horizontal = chartType === 'hbar';
        // one hue looks cleaner; per-bar colours only for the rainbow scheme
        const perIndex = n === 1 && !custom.length && scheme === 'rainbow' && ['bar', 'hbar', 'stacked', 'combo'].indexOf(chartType) !== -1;

        return {
            labels: labels,
            datasets: result.series.map((s, i) => {
                const color = palette[i % palette.length];
                const common = { label: s.column, data: s.values };

                if (chartType === 'area' || chartType === 'line') {
                    return Object.assign(common, lineStyle(color, curve, labels.length, chartType === 'area'));
                }
                if (chartType === 'radar') {
                    return Object.assign(common, {
                        backgroundColor: withAlpha(color, 0.22),
                        borderColor: color,
                        borderWidth: 2.5,
                        fill: true,
                        pointStyle: 'circle',
                        pointRadius: 3.5,
                        pointBackgroundColor: '#FFFFFF',
                        pointBorderColor: color,
                        pointBorderWidth: 2,
                        pointHoverRadius: 6,
                        pointHoverBackgroundColor: color
                    });
                }
                if (chartType === 'combo' && i > 0) {
                    return Object.assign(common, lineStyle(color, curve, labels.length, false), { type: 'line', order: 0 });
                }
                const colorAt = perIndex
                    ? (di => palette[di % palette.length])
                    : (() => color);
                const radius = chartType === 'stacked' ? 0 : 8;
                const style = barStyle(colorAt, horizontal, radius, chartType === 'stacked');
                if (chartType === 'stacked') {
                    style.borderWidth = 1;
                    style.borderColor = '#FFFFFF';
                }
                return Object.assign(common, style, chartType === 'combo' ? { type: 'bar', order: 1 } : {});
            })
        };
    }

    // ---- tooltip ----
    function tooltipConfig(chartType, isRound, horizontal) {
        const interactive = !isRound && chartType !== 'scatter' && chartType !== 'radar';
        return {
            enabled: true,
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
            animation: { duration: 160 },
            callbacks: {
                title: isRound ? function () { return ''; } : undefined,
                label: function (ctx) {
                    if (isRound) {
                        const total = (ctx.dataset.data || []).reduce((s, v) => s + (Number(v) || 0), 0);
                        const pct = total ? Math.round(ctx.parsed / total * 1000) / 10 : 0;
                        return ' ' + ctx.label + ': ' + fmtFull(ctx.parsed) + ' (' + pct + '%)';
                    }
                    if (chartType === 'scatter') {
                        const raw = ctx.raw || {};
                        return ' (' + raw.x + ', ' + fmtFull(raw.y) + ')';
                    }
                    const p = ctx.parsed || {};
                    const v = chartType === 'radar' ? p.r : (horizontal ? p.x : p.y);
                    return ' ' + (ctx.dataset.label || '') + ': ' + fmtFull(v);
                }
            },
            _interactive: interactive
        };
    }

    // opts: { title: 'text' (omit for no title), maintainAspectRatio: true|false }
    function buildBaseConfig(result, chartType, name, opts) {
        opts = opts || {};
        const extra = extraFrom(opts.options);
        const isRound = chartType === 'pie' || chartType === 'doughnut';
        const isRadar = chartType === 'radar';
        const isHBar = chartType === 'hbar';
        const isStacked = chartType === 'stacked';
        const isHistogram = chartType === 'histogram';
        const isScatter = chartType === 'scatter';
        const scatterCategorical = isScatter && isCategorical(result.labels);
        const narrow = typeof window !== 'undefined' && window.innerWidth < 600;

        const tick = { color: T.soft, padding: 8, font: { size: narrow ? 10 : 12 } };
        if (narrow) tick.maxRotation = 50;
        const grid = { color: T.grid, drawTicks: false, drawBorder: false };
        const noGrid = { display: false, drawBorder: false };
        const noBorder = { display: false };
        const valueTicks = Object.assign({}, tick, { callback: v => fmtCompact(v) });

        const tooltip = tooltipConfig(chartType, isRound, isHBar);
        const interactive = tooltip._interactive;
        delete tooltip._interactive;

        const count = Math.max(result.labels.length, 1);
        const step = Math.min(40, 700 / count);
        let settled = false;
        const animation = reduceMotion() ? false : {
            duration: 900,
            easing: 'easeOutQuart',
            delay: function (ctx) {
                if (settled || ctx.type !== 'data' || ctx.mode !== 'default') return 0;
                return ctx.dataIndex * step + (ctx.datasetIndex || 0) * 90;
            },
            onComplete: function () { settled = true; }
        };

        let scales;
        if (isRound) {
            scales = {};
        } else if (isRadar) {
            scales = {
                r: {
                    beginAtZero: true, grid: grid, angleLines: grid, border: noBorder,
                    pointLabels: { color: T.soft, padding: 10, font: { size: narrow ? 10 : 12 } },
                    ticks: { color: T.soft, backdropColor: 'transparent', callback: v => fmtCompact(v) }
                }
            };
        } else if (isHBar) {
            scales = {
                x: { beginAtZero: true, grid: grid, border: noBorder, ticks: valueTicks },
                y: { grid: noGrid, border: noBorder, ticks: tick }
            };
        } else {
            scales = {
                y: {
                    stacked: isStacked, beginAtZero: true, grid: grid, border: noBorder,
                    ticks: isHistogram ? Object.assign({}, valueTicks, { precision: 0 }) : valueTicks,
                    ...(isHistogram ? { title: { display: true, text: 'Count', color: T.soft } } : {})
                },
                x: {
                    stacked: isStacked,
                    grid: isScatter ? grid : noGrid,
                    border: noBorder,
                    ticks: tick,
                    ...(scatterCategorical ? { type: 'category', labels: categoryLabels(result.labels) } : {}),
                    ...(isHistogram ? { title: { display: true, text: result.series[0].column, color: T.soft } } : {})
                }
            };
        }

        return {
            type: JS_TYPE[chartType] || chartType,
            data: toChartJsData(result, chartType, name, extra),
            options: {
                indexAxis: isHBar ? 'y' : 'x',
                responsive: true,
                maintainAspectRatio: opts.maintainAspectRatio === undefined ? true : opts.maintainAspectRatio,
                layout: { padding: { top: 6, right: 8 } },
                animation: animation,
                transitions: { active: { animation: { duration: 180 } } },
                interaction: interactive
                    ? { mode: 'index', intersect: false, axis: isHBar ? 'y' : 'x' }
                    : { mode: 'nearest', intersect: true },
                ...(isRound ? { cutout: chartType === 'doughnut' ? '62%' : 0 } : {}),
                plugins: {
                    title: opts.title
                        ? { display: true, text: opts.title, font: { size: 16, weight: '600' }, color: T.ink }
                        : { display: false },
                    legend: {
                        display: isRound || result.series.length > 1,
                        position: 'bottom',
                        labels: {
                            color: T.soft,
                            usePointStyle: true,
                            pointStyle: 'circle',
                            boxWidth: narrow ? 8 : 9,
                            boxHeight: narrow ? 8 : 9,
                            padding: narrow ? 10 : 16,
                            font: { size: narrow ? 11 : 12 }
                        }
                    },
                    tooltip: tooltip
                },
                scales: scales
            }
        };
    }

    function extraFrom(o) {
        o = o || {};
        return { colors: Array.isArray(o.series_colors) ? o.series_colors : [], smooth: o.smooth };
    }

    // Customisation panel options (charts/options.py whitelist) on top of the base config.
    // Only keys the user set change anything.
    function applyOptions(config, o, opts) {
        const plugins = config.options.plugins;
        const scales = config.options.scales || {};
        const size = o.font_size;

        const text = o.title_text || opts.title || opts.chartTitle || '';
        const showTitle = o.show_title === undefined ? !!opts.title : (o.show_title && !!text);
        plugins.title = showTitle
            ? { display: true, text: text, font: { size: size ? size + 4 : 16, weight: '600' }, color: T.ink }
            : { display: false };

        if (o.legend) {
            if (typeof o.legend.show === 'boolean') plugins.legend.display = o.legend.show;
            if (o.legend.position) plugins.legend.position = o.legend.position;
        }
        if (o.grid === false) {
            Object.values(scales).forEach(ax => {
                ax.grid = Object.assign({}, ax.grid, { display: false });
                if (ax.angleLines) ax.angleLines = Object.assign({}, ax.angleLines, { display: false });
            });
        }
        [['x', o.x_title], ['y', o.y_title]].forEach(pair => {
            if (pair[1] && scales[pair[0]]) {
                scales[pair[0]].title = { display: true, text: pair[1], color: T.soft };
            }
        });
        if (size) {
            const font = { size: size };
            plugins.legend.labels = Object.assign({}, plugins.legend.labels, { font: font });
            Object.values(scales).forEach(ax => {
                ax.ticks = Object.assign({}, ax.ticks, { font: font });
                if (ax.title) ax.title = Object.assign({}, ax.title, { font: font });
                if (ax.pointLabels) ax.pointLabels = Object.assign({}, ax.pointLabels, { font: font });
            });
        }
    }

    // opts also takes: options (chart_options dict), chartTitle (fallback title text)
    function buildConfig(result, chartType, name, opts) {
        opts = opts || {};
        const config = buildBaseConfig(result, chartType, name, opts);
        const o = opts.options;
        if (o && Object.keys(o).length) applyOptions(config, o, opts);
        return config;
    }

    return { colorSchemes, getColors, toChartJsData, buildConfig, tokens: T, fmtFull, fmtCompact };
})();