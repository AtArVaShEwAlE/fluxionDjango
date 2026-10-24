// Shared chart renderer. Turns a server query result {labels, series, meta}
// into a full Chart.js config, so a chart looks the same in the builder,
// My Charts, Reports and the public pages.
window.FluxionChart = (function () {
    const colorSchemes = {
        default: ['#1F9D6E', '#34C08D', '#157A56', '#6EE7B7', '#0E5C40'],
        blue: ['#3B82F6', '#2563EB', '#1D4ED8', '#1E40AF', '#1E3A8A'],
        purple: ['#8B5CF6', '#7C3AED', '#6D28D9', '#5B21B6', '#4C1D95'],
        rainbow: ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#3B82F6', '#8B5CF6']
    };
    // Chart.js has no 'hbar' / 'area' type: they are bar / line plus options.
    const JS_TYPE = { hbar: 'bar', area: 'line', stacked: 'bar', combo: 'bar', histogram: 'bar' };

    function withAlpha(hex, alpha) {
        const n = parseInt(hex.slice(1), 16);
        return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
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
            return { labels: pl, datasets: [{ data: pv, backgroundColor: pv.map((_, i) => palette[i % palette.length]) }] };
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
                    backgroundColor: palette[0]
                }]
            };
        }
        if (chartType === 'histogram') {
            return {
                labels: labels,
                datasets: [{
                    label: series.column,
                    data: values,
                    backgroundColor: palette[0],
                    borderColor: '#FFFFFF',
                    borderWidth: 1,
                    barPercentage: 1,
                    categoryPercentage: 1
                }]
            };
        }

        if (result.series.length > 1) {
            const filled = chartType === 'area' || chartType === 'radar';
            return {
                labels: labels,
                datasets: result.series.map((s, i) => {
                    const color = palette[i % palette.length];
                    const isCombo = chartType === 'combo';
                    return {
                        label: s.column,
                        data: s.values,
                        backgroundColor: filled ? withAlpha(color, 0.25) : color,
                        borderColor: color,
                        borderWidth: (chartType === 'bar' || chartType === 'hbar' || chartType === 'stacked' || (isCombo && i === 0)) ? 1 : 2,
                        fill: filled,
                        tension: (chartType === 'line' || chartType === 'area' || (isCombo && i > 0)) ? curve : 0,
                        pointBackgroundColor: color,
                        ...(isCombo ? { type: i === 0 ? 'bar' : 'line', order: i === 0 ? 1 : 0 } : {})
                    };
                })
            };
        }

        if (chartType === 'area' || chartType === 'radar') {
            return {
                labels: labels,
                datasets: [{
                    label: series.column,
                    data: values,
                    backgroundColor: withAlpha(palette[0], 0.25),
                    borderColor: palette[0],
                    borderWidth: 2,
                    fill: true,
                    tension: chartType === 'area' ? curve : 0,
                    pointBackgroundColor: palette[0]
                }]
            };
        }
        return {
            labels: labels,
            datasets: [{
                label: series.column,
                data: values,
                backgroundColor: custom.length ? palette[0] : getColors(values.length, scheme),
                borderColor: palette[0],
                borderWidth: chartType === 'line' ? 2 : 1,
                tension: chartType === 'line' ? curve : 0
            }]
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
        const scatterCategorical = chartType === 'scatter' && isCategorical(result.labels);
        const grid = { color: '#E3E9E6' };
        const ticks = { color: '#55655F' };

        return {
            type: JS_TYPE[chartType] || chartType,
            data: toChartJsData(result, chartType, name, extra),
            options: {
                indexAxis: isHBar ? 'y' : 'x',
                responsive: true,
                maintainAspectRatio: opts.maintainAspectRatio === undefined ? true : opts.maintainAspectRatio,
                plugins: {
                    title: opts.title
                        ? { display: true, text: opts.title, font: { size: 16, weight: 'bold' }, color: '#10201A' }
                        : { display: false },
                    legend: { display: isRound || result.series.length > 1, position: 'bottom', labels: { color: '#55655F' } }
                },
                scales: isRound ? {} : isRadar ? {
                    r: { beginAtZero: true, grid: grid, angleLines: grid, pointLabels: { color: '#55655F' }, ticks: { color: '#55655F', backdropColor: 'transparent' } }
                } : isHBar ? {
                    x: { beginAtZero: true, grid: grid, ticks: ticks },
                    y: { grid: grid, ticks: ticks }
                } : {
                    y: { stacked: isStacked, beginAtZero: true, grid: grid, ticks: ticks, ...(isHistogram ? { ticks: { color: '#55655F', precision: 0 }, title: { display: true, text: 'Count', color: '#55655F' } } : {}) },
                    x: { stacked: isStacked, grid: grid, ticks: ticks, ...(scatterCategorical ? { type: 'category', labels: categoryLabels(result.labels) } : {}), ...(isHistogram ? { title: { display: true, text: result.series[0].column, color: '#55655F' } } : {}) }
                }
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
            ? { display: true, text: text, font: { size: size ? size + 4 : 16, weight: 'bold' }, color: '#10201A' }
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
                scales[pair[0]].title = { display: true, text: pair[1], color: '#55655F' };
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
            ? { display: true, text: text, font: { size: size ? size + 4 : 16, weight: 'bold' }, color: '#10201A' }
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
                scales[pair[0]].title = { display: true, text: pair[1], color: '#55655F' };
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

    return { colorSchemes, getColors, toChartJsData, buildConfig };
})();