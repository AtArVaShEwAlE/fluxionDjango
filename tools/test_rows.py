"""Phase 20B: row range (Customise: Rows from / to), its options, density with several columns."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()

import numpy as np
import pandas as pd
from charts.options import clean_options
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


df = pd.DataFrame({'name': list('abcdefghij'), 'sales': list(range(1, 11)), 'cost': list(range(10, 0, -1))})


def q(**extra):
    spec = {'x': 'name', 'series': [{'column': 'sales'}], 'sort': 'none'}
    spec.update(extra)
    return run_query(df, spec)


# row range in the query engine (1-based, inclusive)
check('no range = all rows', len(q()['labels']), 10)
check('rows 3-5 labels', q(row_from=3, row_to=5)['labels'], ['c', 'd', 'e'])
check('rows 3-5 values', q(row_from=3, row_to=5)['series'][0]['values'], [3, 4, 5])
check('from only', q(row_from=8)['labels'], ['h', 'i', 'j'])
check('to only', q(row_to=2)['labels'], ['a', 'b'])
check('to beyond the end is clamped', q(row_from=9, row_to=999)['labels'], ['i', 'j'])
check('single row', q(row_from=4, row_to=4)['labels'], ['d'])
check('numeric text accepted', q(row_from='2', row_to='3')['labels'], ['b', 'c'])
check('bool ignored', len(q(row_from=True)['labels']), 10)
check('zero ignored', len(q(row_from=0)['labels']), 10)
check('negative ignored', len(q(row_to=-3)['labels']), 10)
check('from past the end = no rows', q(row_from=50)['labels'], [])
raises('to below from', lambda: q(row_from=5, row_to=2))
r = run_query(df, {'x': 'sales', 'histogram': True, 'bins': 2, 'row_to': 4})
check('histogram uses the range', sum(r['series'][0]['values']), 4)
r = run_query(df, {'x': 'name', 'raw': True, 'series': [{'column': 'sales'}], 'row_from': 9})
check('scatter (raw) uses the range', r['series'][0]['values'], [9, 10])

# saved options
check('options: both kept', clean_options({'row_from': 3, 'row_to': 9}), {'row_from': 3, 'row_to': 9})
check('options: whole float becomes int', clean_options({'row_from': 3.0}), {'row_from': 3})
check('options: zero dropped', clean_options({'row_from': 0}), {})
check('options: text dropped', clean_options({'row_from': '5'}), {})
check('options: bool dropped', clean_options({'row_to': True}), {})
check('options: to below from dropped', clean_options({'row_from': 9, 'row_to': 3}), {'row_from': 9})
check('options: huge number dropped', clean_options({'row_from': 10 ** 9}), {})
check('options: value range kept', clean_options({'x_min': -1.5, 'x_max': 20}), {'x_min': -1.5, 'x_max': 20.0})
check('options: inf dropped', clean_options({'x_min': float('inf')}), {})
check('options: text range dropped', clean_options({'x_max': '5'}), {})

# chart -> spec
base = {'x_axis': 'name', 'y_axes': ['sales']}
check('spec reads the range from chart_options', spec_from_chart('bar', dict(base, chart_options={'row_from': 2, 'row_to': 4})).get('row_to'), 4)
check('spec without options has no range', 'row_from' in spec_from_chart('bar', base), False)
check('spec range for new chart types', spec_from_chart('funnel', dict(base, chart_options={'row_to': 3})).get('row_to'), 3)
check('spec ignores options that are not a dict', 'row_to' in spec_from_chart('bar', dict(base, chart_options='x')), False)

# density with several columns
rng = np.random.default_rng(3)
wide = pd.DataFrame({'a': rng.normal(0, 1, 300), 'b': rng.normal(5, 2, 300), 'c': rng.normal(10, 1, 300)})
r = run_query(wide, spec_from_chart('density', {'y_axes': ['a', 'b', 'c']}))
check('density: one series per column', [s['column'] for s in r['series']], ['a', 'b', 'c'])
check('density: shared grid', all(len(s['values']) == len(r['labels']) for s in r['series']), True)
check('density: grid covers every column', r['labels'][0] < -2 and r['labels'][-1] > 11, True)
check('density: json safe', bool(json.dumps(r, allow_nan=False)), True)
check('density: old chart (X only) still works', len(run_query(wide, spec_from_chart('density', {'x_axis': 'a'}))['series']), 1)
r = run_query(wide, spec_from_chart('density', {'y_axes': ['a'], 'chart_options': {'row_to': 100}}))
check('density: row range', r['meta']['values_used'], 100)
raises('density: needs a column', lambda: run_query(wide, spec_from_chart('density', {})))
raises('density: unknown column', lambda: run_query(wide, spec_from_chart('density', {'y_axes': ['a', 'nope']})))

w = max(len(r[1]) for r in rows)
for res, label, got, exp in rows:
    if res == 'FAIL':
        print(f'{res:<5} {label:<{w}} {got}  {exp}')
fails = [r for r in rows if r[0] == 'FAIL']
print(f"\n{len(rows)} checks, {len(fails)} FAIL")