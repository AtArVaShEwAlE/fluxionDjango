"""Whitelist cleaner for chart_options (customisation panel).

Anything not on the whitelist, or with a bad value, is dropped silently.
Never raises. Output only holds keys the user actually set.
"""
import re

HEX_COLOR = re.compile(r'^#[0-9a-fA-F]{6}$')
LEGEND_POSITIONS = ('top', 'bottom', 'left', 'right')
MAX_TITLE = 120
MAX_AXIS_TITLE = 60
MIN_FONT = 10
MAX_FONT = 24
MAX_COLORS = 10


def _text(value, limit):
    """Stripped string, or None if not a string / empty / too long."""
    if not isinstance(value, str):
        return None
    value = value.strip()
    if not value or len(value) > limit:
        return None
    return value


def _font_size(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    if isinstance(value, int) and MIN_FONT <= value <= MAX_FONT:
        return value
    return None


def _colors(value):
    """List of #RRGGBB. One bad entry drops the whole list (positions matter)."""
    if not isinstance(value, list) or not value:
        return None
    value = value[:MAX_COLORS]
    if not all(isinstance(c, str) and HEX_COLOR.match(c) for c in value):
        return None
    return value


def _legend(value):
    if not isinstance(value, dict):
        return None
    out = {}
    if isinstance(value.get('show'), bool):
        out['show'] = value['show']
    position = value.get('position')
    if isinstance(position, str) and position in LEGEND_POSITIONS:
        out['position'] = position
    return out or None


def clean_options(raw):
    if not isinstance(raw, dict):
        return {}
    out = {}
    for key in ('show_title', 'grid', 'smooth'):
        if isinstance(raw.get(key), bool):
            out[key] = raw[key]
    for key, limit in (('title_text', MAX_TITLE), ('x_title', MAX_AXIS_TITLE),
                       ('y_title', MAX_AXIS_TITLE)):
        text = _text(raw.get(key), limit)
        if text is not None:
            out[key] = text
    legend = _legend(raw.get('legend'))
    if legend:
        out['legend'] = legend
    size = _font_size(raw.get('font_size'))
    if size is not None:
        out['font_size'] = size
    colors = _colors(raw.get('series_colors'))
    if colors:
        out['series_colors'] = colors
    return out