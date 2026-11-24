"""Query shapes beyond plain group / raw / histogram (Phase 19B).

Called from services.run_query when spec['shape'] is set. The shape comes
from the saved chart type (charts/queries.py), never from a public visitor.
Same contract as run_query: returns {labels, series, meta}, raises
ValueError for bad input, missing -> None (never 0), JSON safe.
"""
import warnings

import numpy as np
import pandas as pd

from .services import _py, run_query
from .widgets import WIDGETS

MAX_BUBBLE_POINTS = 500
MAX_GANTT_TASKS = 100
DENSITY_POINTS = 100
MAX_DENSITY_SAMPLE = 5000
MAX_DENSITY_COLUMNS = 6
EPOCH = pd.Timestamp('1970-01-01')


def _columns(df, spec, count, what):
    """First `count` series column names, each checked against the frame."""
    series = spec.get('series')
    if not isinstance(series, list) or len(series) < count:
        raise ValueError(f'{what} needs {count} column' + ('s' if count > 1 else ''))
    cols = []
    for item in series[:count]:
        col = item.get('column') if isinstance(item, dict) else None
        if not isinstance(col, str) or col not in df.columns:
            raise ValueError(f'Unknown column: {col}')
        cols.append(col)
    return cols


def _numeric(df, col):
    raw = df[col]
    if pd.api.types.is_datetime64_any_dtype(raw):
        raise ValueError(f"Column '{col}' is a date column, not numeric")
    return pd.to_numeric(raw, errors='coerce').astype(float)


def _sig(value):
    """6 significant digits: keeps tiny density values from rounding to 0."""
    return float(f'{float(value):.6g}')


def _bubble(df, x, spec):
    ycol, scol = _columns(df, spec, 2, 'Bubble chart')
    frame = pd.DataFrame({'x': _numeric(df, x), 'y': _numeric(df, ycol), 's': _numeric(df, scol)})
    frame = frame.replace([np.inf, -np.inf], np.nan).dropna()
    frame = frame[frame['s'] > 0]
    if frame.empty:
        raise ValueError('No rows with a number for X, Y and a positive size')
    total = len(frame)
    sampled = total > MAX_BUBBLE_POINTS
    if sampled:
        frame = frame.sample(MAX_BUBBLE_POINTS, random_state=0).sort_index()
    return {
        'labels': [_py(v) for v in frame['x']],
        'series': [
            {'name': ycol, 'column': ycol, 'agg': None, 'values': [_py(v) for v in frame['y']]},
            {'name': scol, 'column': scol, 'agg': None, 'values': [_py(v) for v in frame['s']]},
        ],
        'meta': {'mode': 'bubble', 'rows_in': len(df), 'points': len(frame), 'sampled': sampled,
                 'x': x, 'size_min': _py(frame['s'].min()), 'size_max': _py(frame['s'].max())},
    }


def _waterfall(df, x, spec):
    col = _columns(df, spec, 1, 'Waterfall chart')[0]
    base = run_query(df, {'x': x, 'series': [{'column': col, 'agg': 'sum'}], 'sort': 'none'})
    deltas = base['series'][0]['values']
    start, end, running = [], [], 0.0
    for d in deltas:
        start.append(round(running, 6))
        running += 0.0 if d is None else float(d)   # missing change adds nothing
        end.append(round(running, 6))
    total = round(running, 6)
    return {
        'labels': base['labels'] + ['Total'],
        'series': [
            {'name': 'Change', 'column': col, 'agg': 'sum', 'values': deltas + [total]},
            {'name': 'Start', 'column': col, 'agg': None, 'values': start + [0]},
            {'name': 'End', 'column': col, 'agg': None, 'values': end + [total]},
        ],
        'meta': {**base['meta'], 'mode': 'waterfall', 'total': total, 'total_index': len(deltas)},
    }


def _pareto(df, x, spec):
    col = _columns(df, spec, 1, 'Pareto chart')[0]
    base = run_query(df, {'x': x, 'series': [{'column': col, 'agg': 'sum'}], 'sort': 'value_desc'})
    values = base['series'][0]['values']
    if any(v is not None and v < 0 for v in values):
        raise ValueError('Pareto needs values that are not negative')
    total = sum(v for v in values if v is not None)
    if total <= 0:
        raise ValueError('Pareto needs a positive total')
    cumulative, running = [], 0.0
    for v in values:
        running += 0.0 if v is None else float(v)
        cumulative.append(round(running / total * 100, 2))
    return {
        'labels': base['labels'],
        'series': [base['series'][0],
                   {'name': 'Cumulative %', 'column': col, 'agg': 'cum_pct', 'values': cumulative}],
        'meta': {**base['meta'], 'mode': 'pareto', 'total': round(float(total), 6)},
    }


def _density(df, x, spec):
    """Smooth distribution of one or more numeric columns on a shared grid."""
    series = spec.get('series')
    cols = []
    if isinstance(series, list) and series:
        for item in series[:MAX_DENSITY_COLUMNS]:
            col = item.get('column') if isinstance(item, dict) else None
            if not isinstance(col, str) or col not in df.columns:
                raise ValueError(f'Unknown column: {col}')
            cols.append(col)
    elif isinstance(x, str) and x in df.columns:
        cols = [x]
    if not cols:
        raise ValueError('Choose at least one number column')
    samples, used, sampled = [], {}, False
    for col in cols:
        arr = _numeric(df, col).to_numpy()
        arr = arr[np.isfinite(arr)]
        if len(arr) < 2:
            raise ValueError(f"Column '{col}' needs at least 2 numbers for a density plot")
        used[col] = len(arr)
        if len(arr) > MAX_DENSITY_SAMPLE:
            arr = np.random.default_rng(0).choice(arr, MAX_DENSITY_SAMPLE, replace=False)
            sampled = True
        samples.append(arr)
    widths = []
    for col, arr in zip(cols, samples):
        std = float(arr.std(ddof=1))
        q75, q25 = np.percentile(arr, [75, 25])
        iqr = float(q75 - q25)
        spread = min(std, iqr / 1.34) if iqr > 0 else std
        if not np.isfinite(spread) or spread <= 0:
            raise ValueError(f"Column '{col}' needs at least 2 different values for a density plot")
        widths.append(0.9 * spread * len(arr) ** -0.2)   # Silverman's rule of thumb
    low = min(float(a.min()) - 3 * b for a, b in zip(samples, widths))
    high = max(float(a.max()) + 3 * b for a, b in zip(samples, widths))
    grid = np.linspace(low, high, DENSITY_POINTS)
    out = []
    for col, arr, bw in zip(cols, samples, widths):
        z = (grid[:, None] - arr[None, :]) / bw
        dens = np.exp(-0.5 * z * z).sum(axis=1) / (len(arr) * bw * np.sqrt(2 * np.pi))
        out.append({'name': col, 'column': col, 'agg': 'density', 'values': [_sig(d) for d in dens]})
    return {
        'labels': [_sig(g) for g in grid],
        'series': out,
        'meta': {'mode': 'density', 'rows_in': len(df), 'x': cols[0], 'columns': cols,
                 'values_used': used[cols[0]], 'sampled': sampled, 'bandwidth': _sig(widths[0])},
    }


def _gantt(df, x, spec):
    scol, ecol = _columns(df, spec, 2, 'Gantt chart')
    raw_s, raw_e = df[scol], df[ecol]
    if pd.api.types.is_numeric_dtype(raw_s) and pd.api.types.is_numeric_dtype(raw_e):
        kind = 'number'
        s = raw_s.astype(float)
        e = raw_e.astype(float)
    else:
        kind = 'date'
        with warnings.catch_warnings():
            warnings.simplefilter('ignore')
            ds = pd.to_datetime(raw_s, errors='coerce')
            de = pd.to_datetime(raw_e, errors='coerce')
        s = (ds - EPOCH) / pd.Timedelta(days=1)
        e = (de - EPOCH) / pd.Timedelta(days=1)
    frame = pd.DataFrame({'task': df[x], 's': s, 'e': e})
    frame = frame.replace([np.inf, -np.inf], np.nan).dropna()
    frame = frame[frame['e'] >= frame['s']]
    if frame.empty:
        raise ValueError('Start and End must both be dates or both be numbers, with End not before Start')
    frame['task'] = frame['task'].astype(str)
    grouped = (frame.groupby('task', sort=False).agg(s=('s', 'min'), e=('e', 'max'))
               .reset_index().sort_values(['s', 'task'], kind='stable'))
    tasks_total = len(grouped)
    truncated = tasks_total > MAX_GANTT_TASKS
    grouped = grouped.head(MAX_GANTT_TASKS)
    return {
        'labels': grouped['task'].tolist(),
        'series': [
            {'name': scol, 'column': scol, 'agg': 'min', 'values': [round(float(v), 4) for v in grouped['s']]},
            {'name': ecol, 'column': ecol, 'agg': 'max', 'values': [round(float(v), 4) for v in grouped['e']]},
        ],
        'meta': {'mode': 'gantt', 'kind': kind, 'rows_in': len(df), 'x': x, 'tasks': len(grouped),
                 'truncated': truncated, 'dropped': int(len(df) - len(frame)),
                 'min': round(float(grouped['s'].min()), 4), 'max': round(float(grouped['e'].max()), 4)},
    }

MAX_TABLE_ROWS = 200
MAX_TABLE_COLUMNS = 12
MAX_PIVOT_ROWS = 30
MAX_PIVOT_COLS = 12
PIVOT_FUNCS = {'sum': 'sum', 'avg': 'mean', 'count': 'count', 'min': 'min', 'max': 'max'}


def _table(df, x, spec):
    """Plain rows of the chosen columns. Row numbers keep the file's numbering (Rows from / to)."""
    series = spec.get('series')
    if not isinstance(series, list) or not series:
        raise ValueError('Choose at least one column')
    cols = []
    for item in series[:MAX_TABLE_COLUMNS]:
        col = item.get('column') if isinstance(item, dict) else None
        if not isinstance(col, str) or col not in df.columns:
            raise ValueError(f'Unknown column: {col}')
        if col not in cols:
            cols.append(col)
    if df.empty:
        raise ValueError('No rows to show')
    part = df[cols].head(MAX_TABLE_ROWS)
    if isinstance(df.index, pd.RangeIndex):
        numbers = [int(i) + 1 for i in part.index]
    else:
        numbers = list(range(1, len(part) + 1))
    return {
        'labels': numbers,
        'series': [{'name': c, 'column': c, 'agg': None, 'values': [_py(v) for v in part[c]]} for c in cols],
        'meta': {'mode': 'table', 'rows_in': len(df), 'rows': len(part), 'truncated': len(df) > len(part)},
    }


def _pivot(df, x, spec):
    """Rows (X) by Columns (series 1) of an aggregated Value (series 2). Totals use the same aggregation."""
    ccol, vcol = _columns(df, spec, 2, 'Pivot table')
    rcol = x
    if len({rcol, ccol, vcol}) < 3:
        raise ValueError('Rows, Columns and Value must be three different columns')
    agg = spec.get('agg') if spec.get('agg') in PIVOT_FUNCS else 'sum'
    func = PIVOT_FUNCS[agg]
    frame = df[[rcol, ccol, vcol]]
    frame = frame[frame[rcol].notna() & frame[ccol].notna()].copy()
    if agg != 'count':
        if pd.api.types.is_datetime64_any_dtype(frame[vcol]):
            raise ValueError(f"Column '{vcol}' is a date column, not numeric")
        frame[vcol] = pd.to_numeric(frame[vcol], errors='coerce')
        if frame[vcol].notna().sum() == 0:
            raise ValueError(f"Column '{vcol}' is not numeric")
    if frame.empty:
        raise ValueError('No rows with both a row and a column value')
    frame[rcol] = frame[rcol].astype(str)
    frame[ccol] = frame[ccol].astype(str)
    table = frame.pivot_table(index=rcol, columns=ccol, values=vcol, aggfunc=func)
    if table.empty:
        raise ValueError('No numbers to show')
    table = table.sort_index().sort_index(axis=1)
    rows_total, cols_total = table.shape
    table = table.iloc[:MAX_PIVOT_ROWS, :MAX_PIVOT_COLS]
    row_t = frame.groupby(rcol)[vcol].agg(func).reindex(table.index)
    col_t = frame.groupby(ccol)[vcol].agg(func).reindex(table.columns)
    grand = getattr(frame[vcol], func)()
    return {
        'labels': [str(i) for i in table.index],
        'series': [{'name': str(c), 'column': vcol, 'agg': agg, 'values': [_py(v) for v in table[c]]}
                   for c in table.columns],
        'meta': {'mode': 'pivot', 'rows_in': len(df), 'agg': agg, 'row_label': rcol, 'col_label': ccol,
                 'value': vcol, 'rows_total': int(rows_total), 'cols_total': int(cols_total),
                 'row_totals': [_py(v) for v in row_t], 'col_totals': [_py(v) for v in col_t],
                 'grand_total': _py(grand)},
    }

SHAPES = {'bubble': _bubble, 'waterfall': _waterfall, 'pareto': _pareto,
          'density': _density, 'gantt': _gantt, 'table': _table, 'pivot': _pivot}


def run_shape(df, x, spec):
    shape = spec.get('shape')
    if isinstance(shape, str) and shape in WIDGETS:
        return WIDGETS[shape](df, spec)
    if not isinstance(shape, str) or shape not in SHAPES:
        raise ValueError(f'Bad shape: {shape}')
    return SHAPES[shape](df, x, spec)