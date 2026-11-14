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
    arr = _numeric(df, x).to_numpy()
    arr = arr[np.isfinite(arr)]
    if len(arr) < 2:
        raise ValueError(f"Column '{x}' needs at least 2 numbers for a density plot")
    used = len(arr)
    sampled = used > MAX_DENSITY_SAMPLE
    if sampled:
        arr = np.random.default_rng(0).choice(arr, MAX_DENSITY_SAMPLE, replace=False)
    std = float(arr.std(ddof=1))
    q75, q25 = np.percentile(arr, [75, 25])
    iqr = float(q75 - q25)
    spread = min(std, iqr / 1.34) if iqr > 0 else std
    if not np.isfinite(spread) or spread <= 0:
        raise ValueError(f"Column '{x}' needs at least 2 different values for a density plot")
    bw = 0.9 * spread * len(arr) ** -0.2   # Silverman's rule of thumb
    grid = np.linspace(float(arr.min()) - 3 * bw, float(arr.max()) + 3 * bw, DENSITY_POINTS)
    z = (grid[:, None] - arr[None, :]) / bw
    dens = np.exp(-0.5 * z * z).sum(axis=1) / (len(arr) * bw * np.sqrt(2 * np.pi))
    return {
        'labels': [_sig(g) for g in grid],
        'series': [{'name': 'density', 'column': x, 'agg': 'density', 'values': [_sig(d) for d in dens]}],
        'meta': {'mode': 'density', 'rows_in': len(df), 'x': x, 'values_used': used,
                 'sampled': sampled, 'bandwidth': _sig(bw)},
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


SHAPES = {'bubble': _bubble, 'waterfall': _waterfall, 'pareto': _pareto,
          'density': _density, 'gantt': _gantt}


def run_shape(df, x, spec):
    shape = spec.get('shape')
    if isinstance(shape, str) and shape in WIDGETS:
        return WIDGETS[shape](df, spec)
    if not isinstance(shape, str) or shape not in SHAPES:
        raise ValueError(f'Bad shape: {shape}')
    return SHAPES[shape](df, x, spec)