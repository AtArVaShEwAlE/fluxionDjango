"""Phase 19B: query shapes + spec_from_chart for the Tier A types."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()

import numpy as np
import pandas as pd
from charts.queries import spec_from_chart
from datasets.services import run_query

rows = []


def check(label, got, expected):
    ok = got == expected
    rows.append(('PASS' if ok else 'FAIL', label, got, expected))


def raises(label, fn):
    try:
        fn()
        rows.append(('FAIL', label, 'no error', 'ValueError'))
    except ValueError:
        rows.append(('PASS', label, 'ValueError', 'ValueError'))
    except Exception as e:
        rows.append(('FAIL', label, type(e).__name__, 'ValueError'))


def safe(r):
    return bool(json.dumps(r, allow_nan=False))


# ---------- spec_from_chart ----------
cfg = lambda *ys, x='cat': {'x_axis': x, 'y_axes': list(ys)}
check('spec stacked_area multi series', spec_from_chart('stacked_area', cfg('a', 'b')),
      {'x': 'cat', 'series': [{'column': 'a', 'agg': 'sum'}, {'column': 'b', 'agg': 'sum'}], 'sort': 'none'})
check('spec dual_line keeps first two', spec_from_chart('dual_line', cfg('a', 'b', 'c'))['series'],
      [{'column': 'a', 'agg': 'sum'}, {'column': 'b', 'agg': 'sum'}])
check('spec bullet actual+target', spec_from_chart('bullet', cfg('a', 't'))['series'],
      [{'column': 'a', 'agg': 'sum'}, {'column': 't', 'agg': 'sum'}])
check('spec funnel sorted desc', spec_from_chart('funnel', cfg('a')),
      {'x': 'cat', 'series': [{'column': 'a', 'agg': 'sum'}], 'sort': 'value_desc'})
check('spec waterfall', spec_from_chart('waterfall', cfg('a')),
      {'x': 'cat', 'series': [{'column': 'a', 'agg': 'sum'}], 'shape': 'waterfall'})
check('spec pareto', spec_from_chart('pareto', cfg('a'))['shape'], 'pareto')
check('spec bubble y+size', spec_from_chart('bubble', cfg('y', 's')),
      {'x': 'cat', 'series': [{'column': 'y'}, {'column': 's'}], 'shape': 'bubble'})
check('spec gantt start+end', spec_from_chart('gantt', cfg('s', 'e', x='task')),
      {'x': 'task', 'series': [{'column': 's'}, {'column': 'e'}], 'shape': 'gantt'})
check('spec density needs only x', spec_from_chart('density', {'x_axis': 'v'}), {'x': 'v', 'shape': 'density'})
check('spec old y_axis still works', spec_from_chart('waterfall', {'x_axis': 'c', 'y_axis': 'a'})['series'],
      [{'column': 'a', 'agg': 'sum'}])
for t in ('stacked_area', 'bubble', 'waterfall', 'funnel', 'pareto', 'bullet', 'dual_line', 'gantt', 'density'):
    raises(f'spec {t} no x', lambda t=t: spec_from_chart(t, {'y_axes': ['a', 'b']}))
for t in ('bubble', 'bullet', 'dual_line', 'gantt'):
    raises(f'spec {t} one Y only', lambda t=t: spec_from_chart(t, cfg('a')))
raises('spec waterfall no Y', lambda: spec_from_chart('waterfall', {'x_axis': 'c'}))
check('spec bar unchanged', spec_from_chart('bar', cfg('a'))['sort'], 'none')
check('spec scatter unchanged', spec_from_chart('scatter', cfg('a')).get('raw'), True)
check('spec histogram unchanged', spec_from_chart('histogram', {'x_axis': 'v'}), {'x': 'v', 'histogram': True})
check('spec pie unchanged', spec_from_chart('pie', {'label_column': 'l', 'value_column': 'v'})['x'], 'l')

# ---------- bubble ----------
bdf = pd.DataFrame({'x': [1, 2, 3, 4, 5, 6], 'y': [10, 20, None, 40, 50, 60],
                    's': [5, 0, 3, -2, 8, 1], 'name': list('abcdef')})
r = run_query(bdf, {'x': 'x', 'series': [{'column': 'y'}, {'column': 's'}], 'shape': 'bubble'})
check('bubble keeps only valid rows (x, y, size > 0)', r['labels'], [1, 5, 6])
check('bubble y values', r['series'][0]['values'], [10, 50, 60])
check('bubble size values', r['series'][1]['values'], [5, 8, 1])
check('bubble meta', (r['meta']['mode'], r['meta']['points'], r['meta']['size_min'], r['meta']['size_max']), ('bubble', 3, 1, 8))
check('bubble json safe', safe(r), True)
big = pd.DataFrame({'x': range(2000), 'y': range(2000), 's': 1})
r = run_query(big, {'x': 'x', 'series': [{'column': 'y'}, {'column': 's'}], 'shape': 'bubble'})
check('bubble cap 500', len(r['labels']), 500)
check('bubble sampled flag', r['meta']['sampled'], True)
raises('bubble text X', lambda: run_query(bdf, {'x': 'name', 'series': [{'column': 'y'}, {'column': 's'}], 'shape': 'bubble'}))
raises('bubble one column only', lambda: run_query(bdf, {'x': 'x', 'series': [{'column': 'y'}], 'shape': 'bubble'}))
raises('bubble unknown column', lambda: run_query(bdf, {'x': 'x', 'series': [{'column': 'y'}, {'column': 'nope'}], 'shape': 'bubble'}))
raises('bubble all sizes zero', lambda: run_query(bdf.assign(s=0), {'x': 'x', 'series': [{'column': 'y'}, {'column': 's'}], 'shape': 'bubble'}))

# ---------- waterfall ----------
wdf = pd.DataFrame({'step': ['Start', 'Sales', 'Costs', 'Sales', 'Tax'], 'v': [100, 50, -30, 20, None]})
r = run_query(wdf, {'x': 'step', 'series': [{'column': 'v', 'agg': 'sum'}], 'shape': 'waterfall'})
check('waterfall labels keep first-seen order + Total', r['labels'], ['Start', 'Sales', 'Costs', 'Tax', 'Total'])
check('waterfall change (missing stays None, total last)', r['series'][0]['values'], [100, 70, -30, None, 140])
check('waterfall start', r['series'][1]['values'], [0, 100, 170, 140, 0])
check('waterfall end', r['series'][2]['values'], [100, 170, 140, 140, 140])
check('waterfall meta', (r['meta']['mode'], r['meta']['total'], r['meta']['total_index']), ('waterfall', 140, 4))
check('waterfall json safe', safe(r), True)
raises('waterfall text values', lambda: run_query(wdf.assign(v='x'), {'x': 'step', 'series': [{'column': 'v'}], 'shape': 'waterfall'}))
raises('waterfall no series', lambda: run_query(wdf, {'x': 'step', 'series': [], 'shape': 'waterfall'}))

# ---------- pareto ----------
pdf = pd.DataFrame({'issue': list('ABCDE'), 'n': [10, 50, 5, 30, None]})
r = run_query(pdf, {'x': 'issue', 'series': [{'column': 'n', 'agg': 'sum'}], 'shape': 'pareto'})
check('pareto sorted desc', r['labels'][:4], ['B', 'D', 'A', 'C'])
check('pareto values', r['series'][0]['values'], [50, 30, 10, 5, None])
check('pareto cumulative %', r['series'][1]['values'], [52.63, 84.21, 94.74, 100.0, 100.0])
check('pareto series names', [s['name'] for s in r['series']], ['n', 'Cumulative %'])
check('pareto meta', (r['meta']['mode'], r['meta']['total']), ('pareto', 95))
check('pareto json safe', safe(r), True)
raises('pareto negative value', lambda: run_query(pdf.assign(n=[1, -2, 3, 4, 5]), {'x': 'issue', 'series': [{'column': 'n'}], 'shape': 'pareto'}))
raises('pareto all zero', lambda: run_query(pdf.assign(n=0), {'x': 'issue', 'series': [{'column': 'n'}], 'shape': 'pareto'}))

# ---------- density ----------
rng = np.random.default_rng(1)
ddf = pd.DataFrame({'v': rng.normal(50, 10, 800), 'name': ['a'] * 800})
r = run_query(ddf, {'x': 'v', 'shape': 'density'})
dens = r['series'][0]['values']
check('density 100 grid points', len(r['labels']), 100)
check('density values positive', min(dens) > 0, True)
grid = np.array(r['labels'], dtype=float)
area = float(np.sum(np.array(dens)[:-1] * np.diff(grid)))
check('density area is about 1', 0.97 <= area <= 1.03, True)
check('density peak near the mean', abs(grid[int(np.argmax(dens))] - 50) < 5, True)
check('density bandwidth near Silverman (about 2.4 for sd 10, n 800)', 1.8 <= r['meta']['bandwidth'] <= 3.0, True)
check('density peak height near true normal (about 0.04)', 0.034 <= max(dens) <= 0.046, True)
check('density labels ascending', bool(np.all(np.diff(grid) > 0)), True)
check('density meta', (r['meta']['mode'], r['meta']['values_used'], r['meta']['sampled']), ('density', 800, False))
check('density json safe', safe(r), True)
tiny = run_query(pd.DataFrame({'v': np.linspace(1e-6, 5e-6, 50)}), {'x': 'v', 'shape': 'density'})
check('density tiny scale keeps values (6 sig digits)', max(tiny['series'][0]['values']) > 0, True)
r = run_query(pd.DataFrame({'v': rng.normal(0, 1, 6000)}), {'x': 'v', 'shape': 'density'})
check('density samples above 5000', (r['meta']['sampled'], r['meta']['values_used']), (True, 6000))
r = run_query(pd.DataFrame({'v': [1, 2, None, float('inf'), 3]}), {'x': 'v', 'shape': 'density'})
check('density skips NaN and inf', r['meta']['values_used'], 3)
raises('density constant column', lambda: run_query(pd.DataFrame({'v': [5, 5, 5]}), {'x': 'v', 'shape': 'density'}))
raises('density one number', lambda: run_query(pd.DataFrame({'v': [5]}), {'x': 'v', 'shape': 'density'}))
raises('density text column', lambda: run_query(ddf, {'x': 'name', 'shape': 'density'}))
raises('density date column', lambda: run_query(pd.DataFrame({'d': pd.to_datetime(['2024-01-01', '2024-01-02'])}), {'x': 'd', 'shape': 'density'}))

# ---------- gantt ----------
gdf = pd.DataFrame({'task': ['Build', 'Design', 'Test', 'Design', 'Bad', 'Gap'],
                    'start': ['2024-01-10', '2024-01-02', '2024-02-01', '2024-01-04', '2024-03-01', None],
                    'end': ['2024-01-31', '2024-01-05', '2024-02-10', '2024-01-20', '2024-02-01', '2024-03-01']})
r = run_query(gdf, {'x': 'task', 'series': [{'column': 'start'}, {'column': 'end'}], 'shape': 'gantt'})
check('gantt sorted by start, repeated task merged', r['labels'], ['Design', 'Build', 'Test'])
check('gantt start = days since 1970-01-01', r['series'][0]['values'], [19724, 19732, 19754])
check('gantt end merged to latest', r['series'][1]['values'], [19742, 19753, 19763])
check('gantt meta kind/tasks/dropped', (r['meta']['kind'], r['meta']['tasks'], r['meta']['dropped']), ('date', 3, 2))
check('gantt json safe', safe(r), True)
ndf = pd.DataFrame({'t': ['a', 'b'], 's': [3, 1], 'e': [9, 4]})
r = run_query(ndf, {'x': 't', 'series': [{'column': 's'}, {'column': 'e'}], 'shape': 'gantt'})
check('gantt numeric kind, sorted by start', (r['meta']['kind'], r['labels'], r['series'][0]['values']), ('number', ['b', 'a'], [1, 3]))
many = pd.DataFrame({'t': [f't{i}' for i in range(150)], 's': range(150), 'e': range(1, 151)})
r = run_query(many, {'x': 't', 'series': [{'column': 's'}, {'column': 'e'}], 'shape': 'gantt'})
check('gantt cap 100 tasks', (len(r['labels']), r['meta']['truncated']), (100, True))
raises('gantt all rows end before start', lambda: run_query(ndf.assign(e=0), {'x': 't', 'series': [{'column': 's'}, {'column': 'e'}], 'shape': 'gantt'}))
raises('gantt text dates', lambda: run_query(gdf.assign(start='soon', end='later'), {'x': 'task', 'series': [{'column': 'start'}, {'column': 'end'}], 'shape': 'gantt'}))
raises('gantt one column', lambda: run_query(gdf, {'x': 'task', 'series': [{'column': 'start'}], 'shape': 'gantt'}))

# ---------- types that reuse the grouped engine ----------
fdf = pd.DataFrame({'stage': ['Lead', 'Won', 'Qualified'], 'n': [100, 20, 60], 'target': [90, 25, 70]})
r = run_query(fdf, spec_from_chart('funnel', {'x_axis': 'stage', 'y_axes': ['n']}))
check('funnel largest first', (r['labels'], r['series'][0]['values']), (['Lead', 'Qualified', 'Won'], [100, 60, 20]))
r = run_query(fdf, spec_from_chart('bullet', {'x_axis': 'stage', 'y_axes': ['n', 'target']}))
check('bullet actual + target, data order', (r['labels'], r['series'][0]['values'], r['series'][1]['values']),
      (['Lead', 'Won', 'Qualified'], [100, 20, 60], [90, 25, 70]))
r = run_query(fdf, spec_from_chart('dual_line', {'x_axis': 'stage', 'y_axes': ['n', 'target']}))
check('dual_line two series', len(r['series']), 2)
r = run_query(fdf, spec_from_chart('stacked_area', {'x_axis': 'stage', 'y_axes': ['n', 'target']}))
check('stacked_area two series, data order', (len(r['series']), r['labels']), (2, ['Lead', 'Won', 'Qualified']))

# ---------- bad shapes ----------
raises('unknown shape', lambda: run_query(fdf, {'x': 'stage', 'series': [{'column': 'n'}], 'shape': 'bogus'}))
raises('shape as list', lambda: run_query(fdf, {'x': 'stage', 'series': [{'column': 'n'}], 'shape': ['pareto']}))
raises('shape needs known x', lambda: run_query(fdf, {'x': 'nope', 'series': [{'column': 'n'}], 'shape': 'pareto'}))
check('plain query unaffected by shape code', run_query(fdf, {'x': 'stage', 'series': [{'column': 'n'}]})['meta']['mode'], 'grouped')

w = max(len(r[1]) for r in rows)
for res, label, got, exp in rows:
    if res == 'FAIL':
        print(f'{res:<5} {label:<{w}} {got}  {exp}')
fails = [r for r in rows if r[0] == 'FAIL']
print(f"\n{len(rows)} checks, {len(fails)} FAIL")