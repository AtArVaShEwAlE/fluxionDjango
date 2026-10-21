import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()

import pandas as pd
from datasets.services import run_query

rows = []


def check(label, got, expected):
    ok = got == expected
    rows.append(('PASS' if ok else 'FAIL', label, got, expected))


def raises(label, spec, df):
    try:
        run_query(df, spec)
        rows.append(('FAIL', label, 'no error', 'ValueError'))
    except ValueError:
        rows.append(('PASS', label, 'ValueError', 'ValueError'))
    except Exception as e:
        rows.append(('FAIL', label, type(e).__name__, 'ValueError'))


df = pd.DataFrame({
    'region': ['N', 'N', 'S', 'S', 'E', 'W', 'Z'],
    'sales': [10, 20, 30, None, 50, 60, None],
    'qty': [1, 2, 3, 4, 5, 6, 7],
    'date': ['2024-01-05', '2024-01-20', '2024-02-03', '2024-02-10',
             '2024-03-01', '2024-03-15', '2024-03-20'],
})

r = run_query(df, {'x': 'region', 'series': [{'column': 'sales', 'agg': 'sum'}]})
check('sum labels', r['labels'], ['E', 'N', 'S', 'W', 'Z'])
check('sum values (all-NaN group is None)', r['series'][0]['values'], [50, 30, 30, 60, None])

r = run_query(df, {'x': 'region', 'series': [{'column': 'sales', 'agg': 'avg'}]})
check('avg values', r['series'][0]['values'], [50, 15, 30, 60, None])

r = run_query(df, {'x': 'region', 'series': [{'column': 'qty', 'agg': 'count'}]})
check('count values', r['series'][0]['values'], [1, 2, 2, 1, 1])

r = run_query(df, {'x': 'region', 'series': [{'column': 'qty', 'agg': 'min'}, {'column': 'qty', 'agg': 'max'}]})
check('min/max multi series', [r['series'][0]['values'], r['series'][1]['values']],
      [[5, 1, 3, 6, 7], [5, 2, 4, 6, 7]])

r = run_query(df, {'x': 'region', 'series': [{'column': 'sales'}, {'column': 'qty'}]})
check('multi series default agg is sum', r['series'][1]['values'], [5, 3, 7, 6, 7])

r = run_query(df, {'x': 'region', 'series': [{'column': 'sales', 'agg': 'sum'}], 'sort': 'value_desc'})
check('value_desc first label', r['labels'][0], 'W')

r = run_query(df, {'x': 'region', 'series': [{'column': 'sales', 'agg': 'sum'}],
                   'sort': 'value_desc', 'top_n': 2, 'other': True})
check('top_n + other labels', r['labels'], ['W', 'E', 'Other'])
check('top_n + other values keep total', r['series'][0]['values'], [60, 50, 60])

r = run_query(df, {'x': 'date', 'date_bucket': 'month', 'series': [{'column': 'qty', 'agg': 'sum'}]})
check('month bucket labels', r['labels'], ['2024-01', '2024-02', '2024-03'])
check('month bucket values', r['series'][0]['values'], [3, 7, 18])

check('json safe (no NaN)', bool(json.dumps(
    run_query(df, {'x': 'region', 'series': [{'column': 'sales'}]}), allow_nan=False)), True)

raises('unknown x column', {'x': 'nope', 'series': [{'column': 'sales'}]}, df)
raises('unknown series column', {'x': 'region', 'series': [{'column': 'nope'}]}, df)
raises('bad agg', {'x': 'region', 'series': [{'column': 'sales', 'agg': 'median'}]}, df)
raises('sum on text column', {'x': 'qty', 'series': [{'column': 'region', 'agg': 'sum'}]}, df)
raises('no series', {'x': 'region', 'series': []}, df)
raises('bad bucket', {'x': 'date', 'date_bucket': 'decade', 'series': [{'column': 'qty'}]}, df)
raises('bad bucket column', {'x': 'region', 'date_bucket': 'month', 'series': [{'column': 'qty'}]}, df)
raises('not a dict', 'hello', df)

big = pd.DataFrame({'k': range(1000), 'v': 1})
r = run_query(big, {'x': 'k', 'series': [{'column': 'v'}]})
check('group cap 500', len(r['labels']), 500)
check('group cap flag', r['meta']['truncated'], True)

big2 = pd.DataFrame({'a': range(20000), 'b': range(20000)})
r = run_query(big2, {'x': 'a', 'raw': True, 'series': [{'column': 'b'}]})
check('raw cap 5000', len(r['labels']), 5000)
check('raw sampled flag', r['meta']['sampled'], True)

hdf = pd.DataFrame({'age': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'name': list('abcdefghij')})
r = run_query(hdf, {'x': 'age', 'histogram': True, 'bins': 3})
check('histogram bin count', len(r['labels']), 3)
check('histogram counts', r['series'][0]['values'], [3, 3, 4])
check('histogram counts sum to rows', sum(r['series'][0]['values']), 10)
check('histogram first label', r['labels'][0], '1 to 4')
check('histogram mode flag', r['meta']['mode'], 'histogram')
r = run_query(hdf, {'x': 'age', 'histogram': True})
check('histogram default bins', len(r['labels']), 10)
r = run_query(hdf, {'x': 'age', 'histogram': True, 'bins': 999})
check('histogram bins capped at 50', len(r['labels']), 50)
r = run_query(hdf, {'x': 'age', 'histogram': True, 'bins': 1})
check('histogram bins floor at 2', len(r['labels']), 2)
r = run_query(pd.DataFrame({'v': [5, 5, 5]}), {'x': 'v', 'histogram': True, 'bins': 4})
check('histogram all-equal values keep total', sum(r['series'][0]['values']), 3)
r = run_query(pd.DataFrame({'v': [1, None, 3, float('inf')]}), {'x': 'v', 'histogram': True, 'bins': 2})
check('histogram skips NaN and inf', r['meta']['values_used'], 2)
check('histogram json safe', bool(json.dumps(r, allow_nan=False)), True)
raises('histogram on text column', {'x': 'name', 'histogram': True}, hdf)
raises('histogram bad bins', {'x': 'age', 'histogram': True, 'bins': 'many'}, hdf)
raises('histogram unknown column', {'x': 'nope', 'histogram': True}, hdf)

w = max(len(r[1]) for r in rows)
print(f"{'RES':<5} {'CHECK':<{w}} GOT  EXPECTED")
for res, label, got, exp in rows:
    print(f'{res:<5} {label:<{w}} {got}  {exp}')
fails = [r for r in rows if r[0] == 'FAIL']
print(f'\n{len(rows)} checks, {len(fails)} FAIL')