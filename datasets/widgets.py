"""Widget data (Phase 20): gauge.

Same contract as run_query: {labels, series, meta}. Only aggregated numbers leave the
server. services.run_query hands the gauge over before it checks X (a gauge has no X).
Sparkline needs no code here: it is a normal grouped query.
"""
import math

import pandas as pd

from .services import AGGS, _py


def _columns(df, spec, count):
    series = spec.get('series')
    if not isinstance(series, list) or not series:
        raise ValueError('Choose a column')
    cols = []
    for item in series[:count]:
        col = item.get('column') if isinstance(item, dict) else None
        if not isinstance(col, str) or col not in df.columns:
            raise ValueError(f'Unknown column: {col}')
        cols.append(col)
    return cols


def _agg(spec):
    agg = spec.get('agg') or 'sum'
    if agg not in AGGS:
        raise ValueError(f'Bad aggregation: {agg}')
    return agg


def _number(spec, key):
    """Optional finite number (number or numeric text). None when absent or bad."""
    value = spec.get(key)
    if value is None or isinstance(value, bool):
        return None
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    return n if math.isfinite(n) else None


def _value(df, col, agg):
    """One aggregated number for a column. None when the column has no numbers."""
    s = df[col]
    if agg == 'count':
        return int(s.count())
    if pd.api.types.is_datetime64_any_dtype(s):
        raise ValueError(f"Column '{col}' is a date column, not numeric")
    num = pd.to_numeric(s, errors='coerce')
    if num.notna().sum() == 0:
        if s.notna().sum() > 0:
            raise ValueError(f"Column '{col}' is not numeric")
        return None
    return {'sum': num.sum, 'avg': num.mean, 'min': num.min, 'max': num.max}[agg]()


def _gauge(df, spec):
    col = _columns(df, spec, 1)[0]
    agg = _agg(spec)
    low = _number(spec, 'gauge_min')
    low = 0.0 if low is None else low
    high = _number(spec, 'gauge_max')
    if high is None or high <= low:
        raise ValueError('Gauge needs a maximum above the minimum')
    value = _value(df, col, agg)
    pct = None if value is None else round((float(value) - low) / (high - low) * 100, 2)
    return {'labels': [], 'series': [{'name': col, 'column': col, 'agg': agg, 'values': [_py(value)]}],
            'meta': {'mode': 'gauge', 'column': col, 'agg': agg, 'value': _py(value),
                     'min': low, 'max': high, 'pct': pct, 'rows_in': len(df)}}


WIDGETS = {'gauge': _gauge}