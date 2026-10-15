import logging
import os
import warnings
import numpy as np
import pandas as pd
from django.conf import settings

logger = logging.getLogger(__name__)
ALLOWED_EXTENSIONS = {'csv', 'xlsx', 'xls'}


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def compute_column_stats(df):
    """Per-column quick stats. Call on the RAW frame (before fillna) so
    missing counts are accurate."""
    stats = {}
    for col in df.columns:
        series = df[col]
        non_null = series.dropna()
        missing = int(series.isna().sum())

        if pd.api.types.is_numeric_dtype(series):
            stats[col] = {
                'type': 'numeric',
                'min': round(float(non_null.min()), 2) if len(non_null) else None,
                'max': round(float(non_null.max()), 2) if len(non_null) else None,
                'mean': round(float(non_null.mean()), 2) if len(non_null) else None,
                'missing': missing,
            }
        else:
            value_counts = non_null.astype(str).value_counts()
            stats[col] = {
                'type': 'text',
                'unique': int(non_null.nunique()),
                'top': str(value_counts.index[0]) if len(value_counts) else None,
                'missing': missing,
            }
    return stats


def read_dataframe(filepath, ext):
    if ext == 'csv':
        try:
            return pd.read_csv(filepath, encoding='utf-8')
        except UnicodeDecodeError:
            # latin-1 accepts any byte, so this is the final fallback
            return pd.read_csv(filepath, encoding='latin-1')
    engine = 'openpyxl' if ext == 'xlsx' else None
    try:
        return pd.read_excel(filepath, engine=engine, sheet_name=0)
    except Exception:
        return pd.read_excel(filepath, sheet_name=0)


def analyze_dataframe(df):
    """Clean headers, build preview/stats/dtypes. Returns plain dict for the Dataset model."""
    df_clean = df.fillna('')
    df.columns = df.columns.astype(str).str.strip()
    df_clean.columns = df_clean.columns.astype(str).str.strip()

    df = df.loc[:, ~df.columns.str.contains('^Unnamed')]
    df_clean = df_clean.loc[:, ~df_clean.columns.str.contains('^Unnamed')]

    preview = []
    for row in df_clean.head(10).to_dict('records'):
        cleaned = {}
        for key, value in row.items():
            try:
                if pd.isna(value) or value == '':
                    cleaned[key] = ''
                elif isinstance(value, (int, float, str, bool)):
                    cleaned[key] = value
                else:
                    cleaned[key] = str(value)
            except Exception:
                cleaned[key] = ''
        preview.append(cleaned)

    return {
        'rows': len(df),
        'columns': len(df.columns),
        'column_names': df.columns.tolist(),
        'data_types': df.dtypes.astype(str).to_dict(),
        'preview_data': preview,
        'column_stats': compute_column_stats(df),
    }

def clean_dataframe(df):
    """Same header cleanup as analyze_dataframe, but keeps NaN
    (needed for correct aggregation later)."""
    df = df.copy()
    df.columns = df.columns.astype(str).str.strip()
    return df.loc[:, ~df.columns.str.contains('^Unnamed')]


def cache_path(dataset):
    return os.path.join(settings.UPLOAD_ROOT, 'cache', f'{dataset.pk}.pkl')


def save_cache(dataset, df):
    path = cache_path(dataset)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    df.to_pickle(path)


def delete_cache(dataset):
    try:
        os.remove(cache_path(dataset))
    except FileNotFoundError:
        pass


def load_dataframe(dataset):
    """Full cleaned frame. Cache first, else rebuild from the raw upload."""
    path = cache_path(dataset)
    if os.path.exists(path):
        try:
            return pd.read_pickle(path)
        except Exception:
            logger.warning('Bad cache for dataset %s, rebuilding', dataset.pk)

    raw = os.path.join(settings.UPLOAD_ROOT, dataset.filename)
    ext = dataset.filename.rsplit('.', 1)[1].lower()
    df = clean_dataframe(read_dataframe(raw, ext))

    # Rebuild cannot know old renames; keep only columns that still match.
    keep = [c for c in dataset.column_names if c in df.columns]
    if len(keep) != len(dataset.column_names):
        logger.warning('Dataset %s: some renamed columns not recoverable from raw file',
                       dataset.pk)
    df = df[keep]
    save_cache(dataset, df)
    return df



# ---------- Query engine (Phase 10.2) ----------

AGGS = {'sum', 'avg', 'count', 'min', 'max'}
SORTS = {'x_asc', 'x_desc', 'value_asc', 'value_desc'}
BUCKET_FREQ = {'day': 'D', 'week': 'W', 'month': 'M', 'quarter': 'Q', 'year': 'Y'}
MAX_GROUPS = 500
MAX_RAW_POINTS = 5000
MAX_SERIES = 10


def _py(value):
    """numpy/pandas scalar -> JSON-safe python value. NaN/NaT/inf -> None."""
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(value, np.bool_):
        return bool(value)
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, (np.floating, float)):
        v = float(value)
        return None if np.isinf(v) else round(v, 6)
    if isinstance(value, pd.Timestamp):
        return value.strftime('%Y-%m-%d')
    if isinstance(value, (bool, int, str)):
        return value
    return str(value)


def _group(vals, key, agg):
    g = vals.groupby(key, sort=False)
    if agg == 'sum':
        return g.sum(min_count=1)
    if agg == 'avg':
        return g.mean()
    if agg == 'count':
        return g.count()
    if agg == 'min':
        return g.min()
    return g.max()


def _reduce(vals, agg):
    if agg == 'sum':
        return vals.sum(min_count=1)
    if agg == 'avg':
        return vals.mean()
    if agg == 'count':
        return vals.count()
    if agg == 'min':
        return vals.min()
    return vals.max()


def _sort_result(res, sort):
    if sort in ('value_asc', 'value_desc'):
        return res.sort_values('s0', ascending=(sort == 'value_asc'),
                               na_position='last', kind='stable')
    ascending = sort != 'x_desc'
    try:
        return res.sort_index(ascending=ascending)
    except TypeError:   # mixed key types
        order = sorted(range(len(res)), key=lambda i: str(res.index[i]),
                       reverse=not ascending)
        return res.iloc[order]


def _series_name(col, agg):
    return col if agg == 'sum' else f'{col} ({agg})'


def run_query(df, spec):
    """Aggregate a full dataframe server-side.

    spec = {
        'x': 'Region',
        'series': [{'column': 'Sales', 'agg': 'sum'}, ...],   # agg optional
        'date_bucket': 'none|day|week|month|quarter|year',
        'sort': 'x_asc|x_desc|value_asc|value_desc',
        'top_n': 10, 'other': True,
        'raw': False,                                         # True = no grouping
    }
    Returns {'labels': [...], 'series': [{name, column, agg, values}], 'meta': {...}}.
    Raises ValueError for any bad input (view turns it into HTTP 400).
    """
    if not isinstance(spec, dict):
        raise ValueError('Invalid query')

    x = spec.get('x')
    if not isinstance(x, str) or x not in df.columns:
        raise ValueError(f'Unknown column: {x}')

    raw_series = spec.get('series')
    if not isinstance(raw_series, list) or not raw_series:
        raise ValueError('At least one series is required')
    if len(raw_series) > MAX_SERIES:
        raise ValueError(f'Too many series (max {MAX_SERIES})')

    series = []
    for item in raw_series:
        col = item.get('column') if isinstance(item, dict) else None
        if not isinstance(col, str) or col not in df.columns:
            raise ValueError(f'Unknown column: {col}')
        agg = item.get('agg')
        if agg is None:
            agg = 'sum' if pd.api.types.is_numeric_dtype(df[col]) else 'count'
        if agg not in AGGS:
            raise ValueError(f'Bad aggregation: {agg}')
        series.append({'column': col, 'agg': agg})

    # ---- raw mode: no grouping, sampled (scatter / bubble later) ----
    if spec.get('raw'):
        use = df[df[x].notna()]
        total = len(use)
        sampled = total > MAX_RAW_POINTS
        if sampled:
            use = use.sample(MAX_RAW_POINTS, random_state=0).sort_index()
        return {
            'labels': [_py(v) for v in use[x]],
            'series': [{'name': s['column'], 'column': s['column'], 'agg': None,
                        'values': [_py(v) for v in use[s['column']]]} for s in series],
            'meta': {'mode': 'raw', 'rows_in': len(df), 'points': len(use),
                     'sampled': sampled, 'x': x},
        }

    # ---- grouped mode ----
    bucket = spec.get('date_bucket') or 'none'
    if bucket != 'none' and bucket not in BUCKET_FREQ:
        raise ValueError(f'Bad date bucket: {bucket}')
    sort = spec.get('sort') or 'x_asc'
    if sort not in SORTS:
        raise ValueError(f'Bad sort: {sort}')
    try:
        top_n = int(spec['top_n']) if spec.get('top_n') else 0
    except (TypeError, ValueError):
        raise ValueError('top_n must be a number')
    top_n = max(0, min(top_n, MAX_GROUPS))
    want_other = bool(spec.get('other'))

    if bucket == 'none':
        mask = df[x].notna()
        key = df.loc[mask, x]
    else:
        with warnings.catch_warnings():
            warnings.simplefilter('ignore')
            dt = pd.to_datetime(df[x], errors='coerce')
        mask = dt.notna()
        if not mask.any():
            raise ValueError(f"Column '{x}' has no valid dates")
        key = dt[mask].dt.to_period(BUCKET_FREQ[bucket]).astype(str)
    frame = df[mask].reset_index(drop=True)
    key = key.reset_index(drop=True)

    meta = {'mode': 'grouped', 'rows_in': len(df), 'x': x, 'date_bucket': bucket,
            'sort': sort, 'truncated': False, 'other': False}

    vals = []
    for s in series:
        v = frame[s['column']]
        if s['agg'] != 'count':
            num = pd.to_numeric(v, errors='coerce')
            if num.notna().sum() == 0 and v.notna().sum() > 0:
                raise ValueError(f"Column '{s['column']}' is not numeric")
            v = num
        vals.append(v)

    if frame.empty:
        meta['groups'] = 0
        return {'labels': [],
                'series': [{'name': _series_name(s['column'], s['agg']),
                            'column': s['column'], 'agg': s['agg'], 'values': []}
                           for s in series],
                'meta': meta}

    res = pd.concat([_group(v, key, s['agg']).rename(f's{i}')
                     for i, (v, s) in enumerate(zip(vals, series))], axis=1)

    other_row = None
    if top_n and len(res) > top_n:
        ranked = res.sort_values('s0', ascending=False, na_position='last', kind='stable')
        res = ranked.head(top_n)
        if want_other:
            outside = ~key.isin(res.index)
            other_row = {f's{i}': _reduce(v[outside], s['agg'])
                         for i, (v, s) in enumerate(zip(vals, series))}

    res = _sort_result(res, sort)

    if other_row is not None:
        res = pd.concat([res, pd.DataFrame([other_row], index=['Other'])])
        meta['other'] = True

    if len(res) > MAX_GROUPS:
        res = res.iloc[:MAX_GROUPS]
        meta['truncated'] = True

    meta['groups'] = len(res)
    return {
        'labels': [str(_py(i)) for i in res.index],
        'series': [{'name': _series_name(s['column'], s['agg']),
                    'column': s['column'], 'agg': s['agg'],
                    'values': [_py(v) for v in res[f's{i}']]}
                   for i, s in enumerate(series)],
        'meta': meta,
    }