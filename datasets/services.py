import logging
import os

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


