"""Board slicers (Phase 23): filters from ?f=... applied to a dataframe before a chart is built.

Pure pandas, no Django. A filter is {'column', 'values': [text, ...]} or {'column', 'min', 'max'}.
clean_filters never raises: bad entries are dropped. For public boards `allowed` limits the
columns to the ones the board owner chose as slicers, so a visitor can only narrow rows.
"""
import numpy as np
import pandas as pd

MAX_FILTERS = 3
MAX_VALUES = 50
MAX_VALUE_LEN = 200
MAX_OPTION_VALUES = 100


def _num(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    return n if np.isfinite(n) and abs(n) <= 1e15 else None


def clean_filters(raw, allowed=None):
    """Parsed JSON ([{'c': column, 'v': [...]} or {'c': column, 'min': n, 'max': n}]) -> clean list."""
    if not isinstance(raw, list):
        return []
    out, seen = [], set()
    for item in raw[:MAX_FILTERS]:
        if not isinstance(item, dict):
            continue
        col = item.get('c')
        if not isinstance(col, str) or not col or col in seen:
            continue
        if allowed is not None and col not in allowed:
            continue
        vals = item.get('v')
        if isinstance(vals, list):
            texts = [str(v) for v in vals if isinstance(v, (str, int, float)) and not isinstance(v, bool)]
            texts = [t for t in texts if len(t) <= MAX_VALUE_LEN][:MAX_VALUES]
            if texts:
                out.append({'column': col, 'values': texts})
                seen.add(col)
            continue
        lo, hi = _num(item.get('min')), _num(item.get('max'))
        if lo is not None or hi is not None:
            out.append({'column': col, 'min': lo, 'max': hi})
            seen.add(col)
    return out


def apply_filters(df, filters):
    """Rows that pass every filter. A column the frame does not have is skipped (other datasets on the board)."""
    if not filters:
        return df
    mask = pd.Series(True, index=df.index)
    used = False
    for f in filters:
        col = f.get('column')
        if col not in df.columns:
            continue
        used = True
        series = df[col]
        if 'values' in f:
            mask &= series.notna() & series.astype(str).isin(f['values'])
        else:
            num = pd.to_numeric(series, errors='coerce')
            if f.get('min') is not None:
                mask &= num >= f['min']
            if f.get('max') is not None:
                mask &= num <= f['max']
    if not used:
        return df
    out = df[mask]
    if out.empty:
        raise ValueError('No rows match the filters')
    return out


def column_options(df, col):
    """What a slicer offers for one column: text -> its values, number -> min and max."""
    series = df[col]
    if pd.api.types.is_bool_dtype(series) or not pd.api.types.is_numeric_dtype(series):
        counts = series.dropna().astype(str).value_counts()
        return {'type': 'text', 'values': sorted(counts.index[:MAX_OPTION_VALUES].tolist()),
                'more': len(counts) > MAX_OPTION_VALUES}
    num = series.astype(float)
    num = num[np.isfinite(num)]
    if num.empty:
        return {'type': 'text', 'values': [], 'more': False}
    return {'type': 'number', 'min': float(num.min()), 'max': float(num.max())}