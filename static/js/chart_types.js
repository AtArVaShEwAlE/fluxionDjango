// Chart type registry (JS side). Mirror of charts/registry.py:
// tools/test_registry.py fails if the two key lists differ.
// fields:  'xy' = X column + Y column(s) | 'label-value' = labels + values | 'x' = one numeric column | 'none' = no columns
// multiY:  any number of Y columns (+ Add column)
// slots:   fixed Y columns, in order, one dropdown each (labels shown in the builder)
// x / y:   label text of the X dropdown / first Y dropdown (default: X-Axis (Categories) / Y-Axis (Values))
// server:  builder asks the server to build the query (charts/queries.py), one source of truth
// colors:  'one' = one colour picker | 'pareto' = bars + cumulative line | (absent) = one per Y column
// widget:  settings a widget needs: agg, bucket, gauge. noX / noY hide the dropdown, xOptional = X may stay empty, noCustomise hides the Customise panel
window.FluxionTypes = (function () {
    const T = {
        bar: { title: 'Bar', fields: 'xy', multiY: true },
        line: { title: 'Line', fields: 'xy', multiY: true },
        pie: { title: 'Pie', fields: 'label-value', multiY: false },
        scatter: { title: 'Scatter', fields: 'xy', multiY: false, colors: 'one' },
        hbar: { title: 'Horizontal Bar', fields: 'xy', multiY: true },
        area: { title: 'Area', fields: 'xy', multiY: true },
        doughnut: { title: 'Doughnut', fields: 'label-value', multiY: false },
        radar: { title: 'Radar', fields: 'xy', multiY: true },
        stacked: { title: 'Stacked Bar', fields: 'xy', multiY: true },
        combo: { title: 'Combo', fields: 'xy', multiY: true },
        histogram: { title: 'Histogram', fields: 'x', multiY: false, x: 'Column (numbers)' },
        stacked_area: { title: 'Stacked Area', fields: 'xy', multiY: true, server: true },
        dual_line: { title: 'Dual-Axis Line', fields: 'xy', multiY: false, server: true, slots: ['Left axis (first line)', 'Right axis (second line)'] },
        bubble: { title: 'Bubble', fields: 'xy', multiY: false, server: true, colors: 'one', x: 'X (numbers)', slots: ['Y (numbers)', 'Size (numbers)'] },
        waterfall: { title: 'Waterfall', fields: 'xy', multiY: false, server: true, colors: 'one', x: 'Steps (labels)', y: 'Change (numbers)' },
        funnel: { title: 'Funnel', fields: 'xy', multiY: false, server: true, colors: 'one', x: 'Stages (labels)', y: 'Value (numbers)' },
        pareto: { title: 'Pareto', fields: 'xy', multiY: false, server: true, colors: 'pareto', x: 'Categories (labels)', y: 'Amount (numbers)' },
        bullet: { title: 'Bullet', fields: 'xy', multiY: false, server: true, colors: 'one', x: 'Categories (labels)', slots: ['Actual (numbers)', 'Target (numbers)'] },
        density: { title: 'Density', fields: 'x', multiY: false, server: true, colors: 'one', x: 'Column (numbers)' },
        gantt: { title: 'Gantt', fields: 'xy', multiY: false, server: true, colors: 'one', x: 'Tasks (labels)', slots: ['Start (date or number)', 'End (date or number)'] },
        gauge: { title: 'Gauge', fields: 'xy', multiY: false, server: true, colors: 'one', y: 'Value (numbers)', noX: true, noCustomise: true, widget: ['agg', 'gauge'] },
        sparkline: { title: 'Sparkline', fields: 'xy', multiY: false, server: true, colors: 'one', x: 'Date or category column', y: 'Value (numbers)', widget: ['agg', 'bucket'] }
    };
    const FALLBACK = { title: 'Chart', fields: 'xy', multiY: false };

    function get(type) {
        return Object.prototype.hasOwnProperty.call(T, type) ? T[type] : FALLBACK;
    }

    return {
        has: function (type) { return Object.prototype.hasOwnProperty.call(T, type); },
        keys: function () { return Object.keys(T); },
        title: function (type) { return get(type).title; },
        fields: function (type) { return get(type).fields; },
        usesLabelValue: function (type) { return get(type).fields === 'label-value'; },
        supportsMultiY: function (type) { return get(type).multiY; },
        slots: function (type) { return (get(type).slots || []).slice(); },
        serverSpec: function (type) { return get(type).server === true; },
        xLabel: function (type) { return get(type).x || 'X-Axis (Categories)'; },
        yLabel: function (type) { const t = get(type); return (t.slots && t.slots[0]) || t.y || 'Y-Axis (Values)'; },
        widgetParts: function (type) { return (get(type).widget || []).slice(); },
        isWidget: function (type) { return !!get(type).widget; },
        noX: function (type) { return get(type).noX === true; },
        noY: function (type) { return get(type).noY === true; },
        xOptional: function (type) { return get(type).xOptional === true; },
        noCustomise: function (type) { return get(type).noCustomise === true; },
        // One name per colour picker in the Customise panel
        seriesNames: function (type, ys) {
            const mode = get(type).colors;
            if (!ys.length) return ['Series 1'];
            if (mode === 'one') return [ys[0]];
            if (mode === 'pareto') return [ys[0], 'Cumulative %'];
            return ys;
        }
    };
})();