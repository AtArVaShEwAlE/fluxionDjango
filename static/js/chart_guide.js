// Chart guide: short "what / which data / tip" text for every chart type.
// Used by: the Create Chart page (intro card, grouped type buttons, column suggestions)
// and the FAQ page ("Chart types" section). tools/test_registry.py checks every type has an entry.
window.FluxionGuide = (function () {
    const GUIDE = {
        bar: ['Bar', 'Compares a number across categories.', 'One text column for the categories and one or more number columns.', 'Use Sort and Show top N to keep long lists readable.'],
        hbar: ['Horizontal Bar', 'Like a bar chart, but long category names are easier to read.', 'One text column and one or more number columns.', 'Sort descending to make a ranking.'],
        line: ['Line', 'Shows how numbers change over time or in order.', 'A date (or ordered) column and one or more number columns.', 'Switch Smooth curves off to see exact steps.'],
        area: ['Area', 'A line with the area filled in, good for volume over time.', 'A date (or ordered) column and one or more number columns.', 'Gradient fill off gives a flat look.'],
        pie: ['Pie', 'Shows each category as a share of the total.', 'One text column (labels) and one number column (values).', 'Keep it to about 6 slices; use Show top N to group the rest as Other.'],
        doughnut: ['Doughnut', 'A pie with a hole, handy for showing the total in the centre.', 'One text column (labels) and one number column (values).', 'Turn on Centre total.'],
        scatter: ['Scatter', 'Shows whether two numbers move together.', 'Two number columns.', 'Turn on Trendline to see the direction.'],
        radar: ['Radar', 'Compares several items across the same measures.', 'Text categories and one or more number columns.', 'Works best with 3 to 8 categories.'],
        stacked: ['Stacked Bar', 'Splits each total into its parts.', 'One text column and two or more number columns.', 'Keep the parts in the same order everywhere.'],
        combo: ['Combo', 'Bars for one number and a line for another.', 'One text column and two or more number columns.', 'Turn on Second axis when the two scales are very different.'],
        histogram: ['Histogram', 'Shows how values are spread across ranges.', 'One number column.', 'Bar height is the number of rows in each range.'],
        stacked_area: ['Stacked Area', 'Shows parts of a total over time, stacked on top of each other.', 'A date (or ordered) column and two or more number columns.', 'Show top N keeps only the biggest series.'],
        dual_line: ['Dual-Axis Line', 'Two lines with their own axes, for numbers on different scales.', 'A date (or ordered) column and exactly two number columns.', 'The first line uses the left axis, the second the right axis.'],
        bubble: ['Bubble', 'Two numbers plus a third shown as the bubble size.', 'Three number columns: X, Y and Size.', 'Bubble area shows size. Use Show top N to reduce crowding.'],
        waterfall: ['Waterfall', 'Shows how steps add up to a total, with gains and losses.', 'A text column of steps and a number column of changes (negative = loss).', 'Increase, decrease and total colours can be changed in Customise.'],
        funnel: ['Funnel', 'Shows how much is left after each stage.', 'A text column of stages and a number column.', 'Stages are sorted largest first. Show top N keeps the first stages.'],
        pareto: ['Pareto', 'Shows that a few causes make most of the total (80/20).', 'A text column of categories and a number column of counts or amounts.', 'The line shows the running total; the dashed line marks 80%.'],
        bullet: ['Bullet', 'Compares an actual number with a target for each category.', 'A text column, an Actual number column and a Target number column.', 'The black tick is the target.'],
        density: ['Density', 'A smooth picture of how values are spread. Several columns can share one chart.', 'One or more number columns.', 'Use Value range (min / max) to zoom in on a part.'],
        gantt: ['Gantt', 'Shows tasks as bars along a timeline.', 'A text column of tasks, a Start column and an End column (dates or numbers).', 'Rows where End is before Start are skipped.'],
        gauge: ['Gauge', 'Shows one number against a range, like a dial.', 'One number column, plus the minimum and maximum of the dial.', 'Calculate decides if the dial shows the total, average, minimum or maximum.'],
        sparkline: ['Sparkline', 'A tiny trend line with the latest value.', 'A date (or ordered) column and one number column.', 'Group dates by month or week; mark highest and lowest in Customise.'],
        table: ['Table', 'Shows your rows and columns as they are.', 'One or more columns of any type.', 'Use Rows from / to in Customise to pick which rows to show.'],
        pivot: ['Pivot Table', 'Sums (or averages) a number for every row and column combination, with totals.', 'A Rows text column, a Columns text column and a Value number column.', 'Calculate decides sum, average, count, minimum or maximum. Keep both text columns to a few unique values.'],
        heatmap: ['Heatmap', 'A treemap: bigger value = bigger and darker cell. Rows are groups, Columns are the cells inside.', 'A Rows text column, a Columns text column and a Value number column.', 'Zero and negative values are left out. Shows up to 30 rows and 12 columns.'],
        boxplot: ['Box Plot', 'Shows the spread of a number for each group: middle value, the middle 50%, and outliers.', 'A Groups text column and a Values number column.', 'The line in the box is the median. Circles are unusual values. Shows up to 30 groups.'],
        sankey: ['Sankey', 'Shows how amounts flow from one set of items to another.', 'A Source text column, a Target text column and a Value number column.', 'Band width is the amount. Shows the 60 biggest flows.'],
        sunburst: ['Sunburst', 'Rings that split a total into groups and then into parts of each group.', 'An Inner ring text column, an Outer ring text column and a Value number column.', 'Zero and negative values are left out.'],
        marimekko: ['Marimekko', 'Bars where the width is the group total and the stacked parts show each share.', 'A Bar groups text column, a Stack segments text column and a Value number column.', 'Good for market share. Zero and negative values are left out.'],
        influencers: ['Key Influencers', 'Ranks which columns have the strongest link to one number you want to explain.', 'One Target number column. All other columns are compared with it.', 'Needs at least 10 rows. Columns with a unique value per row (like IDs) are skipped.']
    };

    const GROUPS = [
        ['Compare', ['bar', 'hbar', 'stacked', 'combo', 'radar', 'bullet']],
        ['Trend', ['line', 'area', 'stacked_area', 'dual_line', 'sparkline']],
        ['Parts of a whole', ['pie', 'doughnut', 'funnel', 'waterfall', 'pareto']],
        ['Spread', ['histogram', 'density', 'boxplot']],
        ['Relationship', ['scatter', 'bubble', 'influencers']],
        ['Plan and progress', ['gantt', 'gauge']],
        ['Tables', ['table', 'pivot', 'heatmap']],
        ['Flow and hierarchy', ['sankey', 'sunburst', 'marimekko']]
    ];

    function $(id) { return document.getElementById(id); }

    // ---------- Create Chart: group the type buttons ----------
    function groupButtons() {
        const grid = document.querySelector('.chart-type-grid');
        if (!grid || grid.classList.contains('chart-type-groups')) return;
        const buttons = {};
        grid.querySelectorAll('.chart-type-btn').forEach(b => { buttons[b.dataset.type] = b; });
        grid.classList.add('chart-type-groups');
        GROUPS.forEach(function (g) {
            const box = document.createElement('div');
            box.className = 'chart-type-group';
            const h = document.createElement('h6');
            h.textContent = g[0];
            const row = document.createElement('div');
            row.className = 'chart-type-row';
            g[1].forEach(t => { if (buttons[t]) { row.appendChild(buttons[t]); delete buttons[t]; } });
            box.append(h, row);
            grid.appendChild(box);
        });
        const left = Object.keys(buttons);   // a type without a group still shows up
        if (left.length) {
            const box = document.createElement('div');
            box.className = 'chart-type-group';
            const row = document.createElement('div');
            row.className = 'chart-type-row';
            left.forEach(t => row.appendChild(buttons[t]));
            box.appendChild(row);
            grid.appendChild(box);
        }
    }

    // ---------- Create Chart: intro card ----------
    function showGuide(type) {
        const card = $('chartGuide');
        if (!card) return;
        const g = GUIDE[type];
        card.hidden = !g;
        if (!g) return;
        $('guideTitle').textContent = g[0];
        $('guideWhat').textContent = g[1];
        $('guideData').textContent = g[2];
        $('guideTip').textContent = g[3];
    }

    // ---------- Create Chart: column suggestions ----------
    function describe(ds) {
        const stats = ds.column_stats || {};
        const types = ds.data_types || {};
        const cols = ds.column_names || [];
        const dateName = /(^|[_\s-])(date|time|day|month|year|period|timestamp)([_\s-]|$)/i;
        const isDate = c => /datetime|date/i.test(types[c] || '') || dateName.test(c) ||
            (stats[c] && stats[c].type === 'text' && /^\d{4}-\d{2}-\d{2}/.test(String(stats[c].top || '')));
        return {
            dates: cols.filter(isDate),
            nums: cols.filter(c => !isDate(c) && stats[c] && stats[c].type === 'numeric'),
            texts: cols.filter(c => !isDate(c) && stats[c] && stats[c].type === 'text' && stats[c].unique >= 2 && stats[c].unique <= 40),
            uniq: c => (stats[c] && stats[c].unique) || 0
        };
    }

    function ideas(ds) {
        const d = describe(ds);
        const out = [];
        const add = (type, x, ys, why) => { if (out.length < 8 && !out.some(o => o.type === type)) out.push({ type: type, x: x, ys: ys, why: why }); };
        const name = t => (GUIDE[t] || [t])[0];
        const n1 = d.nums[0], n2 = d.nums[1], n3 = d.nums[2];
        if (d.dates.length && n1) {
            add('line', d.dates[0], [n1], n1 + ' over ' + d.dates[0]);
            add('area', d.dates[0], [n1], n1 + ' over ' + d.dates[0]);
            add('sparkline', d.dates[0], [n1], 'Trend of ' + n1);
            if (n2) add('dual_line', d.dates[0], [n1, n2], n1 + ' and ' + n2 + ' over time');
        }
        if (d.texts.length && n1) {
            const t = d.texts[0];
            add('bar', t, [n1], n1 + ' by ' + t);
            if (d.uniq(t) <= 8) add('pie', t, [n1], 'Share of ' + n1 + ' by ' + t);
            if (d.uniq(t) <= 12) add('funnel', t, [n1], n1 + ' by stage (' + t + ')');
            add('pareto', t, [n1], 'Which ' + t + ' makes most of ' + n1);
            if (d.uniq(t) <= 25) add('waterfall', t, [n1], 'How ' + t + ' adds up to the total');
            if (n2) add('stacked', t, [n1, n2], n1 + ' and ' + n2 + ' by ' + t);
        }
        if (n1 && n2) add('scatter', n1, [n2], n2 + ' against ' + n1);
        if (n1 && n2 && n3) add('bubble', n1, [n2, n3], 'Size = ' + n3);
        if (n1) {
            add('histogram', n1, [], 'How ' + n1 + ' is spread');
            add('density', '', d.nums.slice(0, 3), 'Spread of ' + d.nums.slice(0, 3).join(', '));
        }
        const start = d.dates.find(c => /start|begin|from/i.test(c));
        const end = d.dates.find(c => /end|finish|to$|until/i.test(c));
        if (start && end && start !== end && d.texts.length) add('gantt', d.texts[0], [start, end], 'Tasks over time');
        return out.map(o => Object.assign({ label: name(o.type) }, o));
    }

    function setSelect(id, value) {
        const s = $(id);
        if (!s) return;
        s.value = value || '';
        s.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function applyIdea(idea) {
        const btn = document.querySelector('.chart-type-btn[data-type="' + idea.type + '"]');
        if (btn) btn.click();
        const label = (window.FluxionTypes && FluxionTypes.usesLabelValue(idea.type));
        if (label) {
            setSelect('labelSelect', idea.x);
            setSelect('valueSelect', idea.ys[0]);
        } else {
            setSelect('xAxisSelect', idea.x);
            if (idea.ys.length) setSelect('yAxisSelect', idea.ys[0]);
            const multi = window.FluxionTypes && FluxionTypes.supportsMultiY(idea.type);
            for (let i = 1; i < idea.ys.length; i++) {
                if (multi) { const add = $('addYBtn'); if (add) add.click(); }
                const rows = document.querySelectorAll('#extraYRows select');
                const row = rows[i - 1];
                if (row) { row.value = idea.ys[i]; row.dispatchEvent(new Event('change', { bubbles: true })); }
            }
        }
        if (typeof handleUpdateChart === 'function') handleUpdateChart();
    }

    function renderSuggestions(ds) {
        const box = $('chartSuggest');
        const list = $('chartSuggestList');
        if (!box || !list || !ds) return;
        const found = ideas(ds);
        list.replaceChildren();
        box.hidden = found.length === 0;
        found.forEach(function (idea) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'suggest-chip';
            const strong = document.createElement('strong');
            strong.textContent = idea.label;
            const span = document.createElement('span');
            span.textContent = idea.why;
            b.append(strong, span);
            b.addEventListener('click', () => applyIdea(idea));
            list.appendChild(b);
        });
    }

    // ---------- FAQ: "Chart types" section ----------
    function renderFaq() {
        const list = $('faqList');
        if (!list) return;
        Object.keys(GUIDE).forEach(function (type) {
            const g = GUIDE[type];
            const item = document.createElement('details');
            item.className = 'faq-item';
            item.dataset.cat = 'types';
            const summary = document.createElement('summary');
            summary.textContent = g[0] + ': when to use it';
            const answer = document.createElement('div');
            answer.className = 'faq-answer';
            [['Shows: ', g[1]], ['Data: ', g[2]], ['Tip: ', g[3]]].forEach(function (pair) {
                const p = document.createElement('p');
                const b = document.createElement('strong');
                b.textContent = pair[0];
                p.append(b, document.createTextNode(pair[1]));
                answer.appendChild(p);
            });
            item.append(summary, answer);
            list.appendChild(item);
        });
    }

    renderFaq();
    document.addEventListener('DOMContentLoaded', groupButtons);

    return { GUIDE: GUIDE, GROUPS: GROUPS, showGuide: showGuide, renderSuggestions: renderSuggestions, ideas: ideas };
})();