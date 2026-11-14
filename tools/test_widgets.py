"""Phase 20: gauge data (datasets/widgets.py), sparkline query and widget settings (charts/queries.py)."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()

import pandas as pd
from charts.queries import spec_from_chart, widget_config
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


def run(chart_type, **cfg):
    return run_query(df, spec_from_chart(chart_type, cfg))


df = pd.DataFrame({
    'name': list('abcd'),
    'sales': [10, 20, 30, 40],
    'cost': [1, 2, 3, 4],
    'date': ['2024-01-05', '2024-01-20', '2024-02-03', '2024-02-10'],
})

# gauge
r = run('gauge', y_axes=['sales'], agg='sum', gauge_min=0, gauge_max=200)
check('gauge pct', r['meta']['pct'], 50.0)
check('gauge value + range', (r['meta']['value'], r['meta']['min'], r['meta']['max'], r['meta']['mode']), (100, 0.0, 200.0, 'gauge'))
r = run('gauge', y_axes=['sales'], agg='max', gauge_min=20, gauge_max=60)
check('gauge with min', (r['meta']['value'], r['meta']['pct']), (40, 50.0))
check('gauge default min 0', run('gauge', y_axes=['sales'], gauge_max=400)['meta']['min'], 0.0)
check('gauge json safe', bool(json.dumps(r, allow_nan=False)), True)
raises('gauge no max', lambda: run('gauge', y_axes=['sales']))
raises('gauge max below min', lambda: run('gauge', y_axes=['sales'], gauge_min=10, gauge_max=5))
raises('gauge text column', lambda: run('gauge', y_axes=['name'], gauge_max=10))
raises('gauge unknown column', lambda: run('gauge', y_axes=['nope'], gauge_max=10))

# sparkline = plain grouped query
r = run('sparkline', x_axis='date', y_axes=['sales'], agg='sum', bucket='month')
check('sparkline labels', r['labels'], ['2024-01', '2024-02'])
check('sparkline values', r['series'][0]['values'], [30, 70])
r = run('sparkline', x_axis='name', y_axes=['sales'], bucket='none')
check('sparkline no grouping keeps data order', (r['labels'], r['series'][0]['values']), (['a', 'b', 'c', 'd'], [10, 20, 30, 40]))
check('sparkline avg', run('sparkline', x_axis='date', y_axes=['sales'], agg='avg', bucket='month')['series'][0]['values'], [15, 35])
raises('sparkline needs X', lambda: run('sparkline', y_axes=['sales']))
raises('sparkline needs Y', lambda: run('sparkline', x_axis='date'))

# widget_config (what a saved gauge / sparkline keeps)
check('config bad agg dropped', widget_config({'agg': 'median'}), {})
check('config good agg + bucket', widget_config({'agg': 'avg', 'bucket': 'week'}), {'agg': 'avg', 'bucket': 'week'})
check('config bucket none allowed', widget_config({'bucket': 'none'}), {'bucket': 'none'})
check('config bad bucket dropped', widget_config({'bucket': 'decade'}), {})
check('config numeric text', widget_config({'gauge_max': '12.5'}), {'gauge_max': 12.5})
check('config bool dropped', widget_config({'gauge_max': True}), {})
check('config inf dropped', widget_config({'gauge_max': float('inf')}), {})
check('config nan dropped', widget_config({'gauge_min': float('nan')}), {})
check('config removed widget keys dropped', widget_config({'target': 5, 'text': 'x', 'heading': 'y', 'agg': 'sum'}), {'agg': 'sum'})
check('config non-str agg no crash', widget_config({'agg': ['sum']}), {})

# spec mapping
check('spec gauge', spec_from_chart('gauge', {'y_axes': ['sales'], 'agg': 'avg', 'gauge_max': 100}),
      {'shape': 'gauge', 'series': [{'column': 'sales'}], 'agg': 'avg', 'gauge_min': None, 'gauge_max': 100})
check('spec sparkline', spec_from_chart('sparkline', {'x_axis': 'date', 'y_axes': ['sales'], 'bucket': 'month'}),
      {'x': 'date', 'series': [{'column': 'sales', 'agg': 'sum'}], 'date_bucket': 'month', 'sort': 'x_asc'})
check('spec bad agg falls back to sum', spec_from_chart('gauge', {'y_axes': ['sales'], 'agg': 'x'})['agg'], 'sum')

w = max(len(r[1]) for r in rows)
for res, label, got, exp in rows:
    if res == 'FAIL':
        print(f'{res:<5} {label:<{w}} {got}  {exp}')
fails = [r for r in rows if r[0] == 'FAIL']
print(f"\n{len(rows)} checks, {len(fails)} FAIL")