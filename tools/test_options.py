"""Unit tests for charts/options.py. No DB, no Django."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from charts.options import clean_options

rows = []


def check(label, got, expected):
    ok = got == expected
    rows.append(('PASS' if ok else 'FAIL', label, got, expected))


FULL = {
    'show_title': True, 'title_text': 'Hello', 'legend': {'show': False, 'position': 'top'},
    'x_title': 'Name', 'y_title': 'Sales', 'grid': False, 'font_size': 14,
    'series_colors': ['#112233', '#AABBCC'], 'smooth': False,
}

check('full valid roundtrip', clean_options(dict(FULL)), FULL)
check('idempotent', clean_options(clean_options(dict(FULL))), FULL)
for label, junk in [('None', None), ('list', [1]), ('str', 'x'), ('int', 5), ('empty dict', {})]:
    check(f'non-dict input {label}', clean_options(junk), {})
check('unknown keys dropped', clean_options({'evil': 1, '__proto__': {}, 'grid': True}), {'grid': True})

# bools are strict
check('bool "yes" dropped', clean_options({'grid': 'yes'}), {})
check('bool 1 dropped', clean_options({'smooth': 1}), {})
check('bool False kept', clean_options({'show_title': False}), {'show_title': False})

# text
check('title 120 kept', clean_options({'title_text': 'x' * 120}), {'title_text': 'x' * 120})
check('title 121 dropped', clean_options({'title_text': 'x' * 121}), {})
check('axis title 60 kept', clean_options({'x_title': 'x' * 60}), {'x_title': 'x' * 60})
check('axis title 61 dropped', clean_options({'y_title': 'x' * 61}), {})
check('text stripped', clean_options({'title_text': '  hi  '}), {'title_text': 'hi'})
check('blank text dropped', clean_options({'title_text': '   '}), {})
check('non-str text dropped', clean_options({'x_title': 5}), {})
check('html kept as text', clean_options({'title_text': '<b>x</b>'}), {'title_text': '<b>x</b>'})

# font size
check('font 10 kept', clean_options({'font_size': 10}), {'font_size': 10})
check('font 24 kept', clean_options({'font_size': 24}), {'font_size': 24})
check('font 9 dropped', clean_options({'font_size': 9}), {})
check('font 25 dropped', clean_options({'font_size': 25}), {})
check('font str dropped', clean_options({'font_size': '14'}), {})
check('font True dropped', clean_options({'font_size': True}), {})
check('font 14.5 dropped', clean_options({'font_size': 14.5}), {})
check('font 14.0 -> 14', clean_options({'font_size': 14.0}), {'font_size': 14})

# legend
check('legend bad position dropped, show kept', clean_options({'legend': {'show': True, 'position': 'diagonal'}}), {'legend': {'show': True}})
check('legend position only', clean_options({'legend': {'position': 'left'}}), {'legend': {'position': 'left'}})
check('legend empty omitted', clean_options({'legend': {}}), {})
check('legend non-dict dropped', clean_options({'legend': 'top'}), {})
check('legend unhashable position no crash', clean_options({'legend': {'position': ['top']}}), {})
check('legend show non-bool dropped', clean_options({'legend': {'show': 'no'}}), {})

# series colors
check('colors ok', clean_options({'series_colors': ['#000000']}), {'series_colors': ['#000000']})
check('colors 3-digit hex dropped', clean_options({'series_colors': ['#fff']}), {})
check('colors name dropped', clean_options({'series_colors': ['red']}), {})
check('colors one bad drops all', clean_options({'series_colors': ['#112233', 'nope']}), {})
check('colors non-str entry drops all', clean_options({'series_colors': ['#112233', 5]}), {})
check('colors css injection dropped', clean_options({'series_colors': ['#112233;x']}), {})
check('colors 11 -> 10', len(clean_options({'series_colors': ['#112233'] * 11})['series_colors']), 10)
check('colors empty list omitted', clean_options({'series_colors': []}), {})
check('colors non-list dropped', clean_options({'series_colors': '#112233'}), {})

FULL2 = {
    'value_labels': True, 'highlight': False, 'trendline': True, 'log_scale': False,
    'gradient': False, 'animate': False, 'ref_lines': ['avg', 'min', 'max'],
    'sort': 'desc', 'top_n': 5, 'number_format': 'inr',
}
check('18B full roundtrip', clean_options(dict(FULL2)), FULL2)
check('18B idempotent', clean_options(clean_options(dict(FULL2))), FULL2)
for k in ('value_labels', 'highlight', 'trendline', 'log_scale', 'gradient', 'animate'):
    check(f'{k} "yes" dropped', clean_options({k: 'yes'}), {})
    check(f'{k} False kept', clean_options({k: False}), {k: False})
check('ref_lines reordered', clean_options({'ref_lines': ['max', 'avg']}), {'ref_lines': ['avg', 'max']})
check('ref_lines one bad drops all', clean_options({'ref_lines': ['avg', 'median']}), {})
check('ref_lines unhashable entry no crash', clean_options({'ref_lines': ['avg', ['x']]}), {})
check('ref_lines empty omitted', clean_options({'ref_lines': []}), {})
check('ref_lines 4 dropped', clean_options({'ref_lines': ['avg', 'min', 'max', 'avg']}), {})
check('ref_lines str dropped', clean_options({'ref_lines': 'avg'}), {})
check('sort asc kept', clean_options({'sort': 'asc'}), {'sort': 'asc'})
check('sort bad dropped', clean_options({'sort': 'up'}), {})
check('sort list no crash', clean_options({'sort': ['asc']}), {})
check('number_format usd kept', clean_options({'number_format': 'usd'}), {'number_format': 'usd'})
check('number_format auto dropped', clean_options({'number_format': 'auto'}), {})
check('number_format bad dropped', clean_options({'number_format': 'yen'}), {})
check('top_n 3 kept', clean_options({'top_n': 3}), {'top_n': 3})
check('top_n 20 kept', clean_options({'top_n': 20}), {'top_n': 20})
check('top_n 2 dropped', clean_options({'top_n': 2}), {})
check('top_n 21 dropped', clean_options({'top_n': 21}), {})
check('top_n str dropped', clean_options({'top_n': '5'}), {})
check('top_n True dropped', clean_options({'top_n': True}), {})
check('top_n 5.0 -> 5', clean_options({'top_n': 5.0}), {'top_n': 5})
check('top_n 5.5 dropped', clean_options({'top_n': 5.5}), {})

w = max(len(r[1]) for r in rows)
for res, label, got, exp in rows:
    if res == 'FAIL':
        print(f'{res:<5} {label:<{w}} {got}  {exp}')
fails = [r for r in rows if r[0] == 'FAIL']
print(f"\n{len(rows)} checks, {len(fails)} FAIL")