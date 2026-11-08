// Chart type registry (JS side). Mirror of charts/registry.py:
// tools/test_registry.py fails if the two key lists differ.
// fields: 'xy' = X column + Y column(s) | 'label-value' = labels + values | 'x' = one numeric column
// multiY: more than one Y column allowed
window.FluxionTypes = (function () {
    const T = {
        bar: { title: 'Bar', fields: 'xy', multiY: true },
        line: { title: 'Line', fields: 'xy', multiY: true },
        pie: { title: 'Pie', fields: 'label-value', multiY: false },
        scatter: { title: 'Scatter', fields: 'xy', multiY: false },
        hbar: { title: 'Horizontal Bar', fields: 'xy', multiY: true },
        area: { title: 'Area', fields: 'xy', multiY: true },
        doughnut: { title: 'Doughnut', fields: 'label-value', multiY: false },
        radar: { title: 'Radar', fields: 'xy', multiY: true },
        stacked: { title: 'Stacked Bar', fields: 'xy', multiY: true },
        combo: { title: 'Combo', fields: 'xy', multiY: true },
        histogram: { title: 'Histogram', fields: 'x', multiY: false }
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
        supportsMultiY: function (type) { return get(type).multiY; }
    };
})();