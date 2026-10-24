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

w = max(len(r[1]) for r in rows)
for res, label, got, exp in rows:
    if res == 'FAIL':
        print(f'{res:<5} {label:<{w}} {got}  {exp}')
fails = [r for r in rows if r[0] == 'FAIL']
print(f"\n{len(rows)} checks, {len(fails)} FAIL")