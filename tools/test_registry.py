"""Chart type registry checks. No DB, no Django: reads files only."""
import os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from charts.registry import CHART_TYPES, CHOICES, ENABLED

rows = []


def check(label, got, expected):
    ok = got == expected
    rows.append(('PASS' if ok else 'FAIL', label, got, expected))


def read(*parts):
    path = os.path.join(ROOT, *parts)
    if not os.path.exists(path):
        return None
    with open(path, encoding='utf-8') as fh:
        return fh.read()


OLD = [('bar', 'Bar'), ('line', 'Line'), ('pie', 'Pie'), ('scatter', 'Scatter'),
       ('hbar', 'Horizontal Bar'), ('area', 'Area'), ('doughnut', 'Doughnut'),
       ('radar', 'Radar'), ('stacked', 'Stacked Bar'), ('combo', 'Combo'),
       ('histogram', 'Histogram')]
TIER_A = ['stacked_area', 'bubble', 'waterfall', 'funnel', 'pareto', 'bullet',
          'dual_line', 'density', 'gantt']

keys = [k for k, _l, _o in CHART_TYPES]
check('registry keys unique', len(keys), len(set(keys)))
check('registry key format', [k for k in keys if not re.match(r'^[a-z][a-z_]*$', k) or len(k) > 50], [])
check('first 11 choices unchanged (keeps DB choices stable)', CHOICES[:11], OLD)
check('every label non-empty', [k for k, l, _o in CHART_TYPES if not l.strip()], [])
check('Tier A keys registered after the 11', keys[11:], TIER_A)
check('enabled = the 11 shipped + 9 Tier A types', sorted(ENABLED), sorted([k for k, _l in OLD] + TIER_A))
check('Tier A enabled', sorted(ENABLED & set(TIER_A)), sorted(TIER_A))
check('CHOICES length = registry length', len(CHOICES), len(CHART_TYPES))

js = read('static', 'js', 'chart_types.js')
check('chart_types.js exists', js is not None, True)
if js is not None:
    check('chart_types.js defines FluxionTypes', 'window.FluxionTypes' in js, True)
    found = re.findall(r"^\s+(\w+): \{ title: '([^']+)', fields: '([\w-]+)', multiY: (true|false)", js, re.M)
    jskeys = [f[0] for f in found]
    check('JS keys unique', len(jskeys), len(set(jskeys)))
    check('JS keys = Python enabled keys', sorted(jskeys), sorted(ENABLED))
    label_of = {k: l for k, l, _o in CHART_TYPES}
    check('JS titles = Python labels', [f[0] for f in found if label_of.get(f[0]) != f[1]], [])
    check('JS fields valid', [f[0] for f in found if f[2] not in ('xy', 'label-value', 'x')], [])

cc = read('templates', 'create_chart.html')
check('create_chart.html exists', cc is not None, True)
if cc is not None:
    extra = read('templates', 'partials', 'chart_type_buttons_a.html') or ''
    btns = re.findall(r'chart-type-btn[^"]*"\s+data-type="(\w+)"', cc + extra)
    check('builder buttons = enabled types', sorted(btns), sorted(ENABLED))

ch = read('templates', 'charts.html')
check('charts.html exists', ch is not None, True)
if ch is not None:
    branches = set(re.findall(r"chart\.chart_type == '(\w+)'", ch))
    check('My Charts icon for every enabled type', sorted(ENABLED - branches), [])

tier = read('static', 'js', 'chart_tier_a.js')
check('chart_tier_a.js exists', tier is not None, True)
if tier is not None:
    m = re.search(r'const BUILDERS = \{(.*?)\};', tier, re.S)
    check('chart_tier_a.js builds every Tier A type', sorted(re.findall(r'(\w+):', m.group(1))) if m else [], sorted(k for k, _l, _o in CHART_TYPES[11:]))
    check('chart_tier_a.js defines FluxionTierA', 'window.FluxionTierA' in tier, True)
rend = read('static', 'js', 'chart_render.js')
check('chart_render.js hands Tier A types to FluxionTierA', rend is not None and 'FluxionTierA' in rend and 'internals' in rend, True)
check('chart_extras.js exports makeFmt for Tier A', 'makeFmt: makeFmt' in (read('static', 'js', 'chart_extras.js') or ''), True)
icons = read('templates', 'partials', 'chart_icon_a.html')
check('chart_icon_a.html exists', icons is not None, True)
check('icon partial draws every Tier A type', [k for k in TIER_A if icons is None or "== '" + k + "'" not in icons], [])
w = max(len(r[1]) for r in rows)
for res, label, got, exp in rows:
    if res == 'FAIL':
        print(f'{res:<5} {label:<{w}} {got}  {exp}')
fails = [r for r in rows if r[0] == 'FAIL']
print(f"\n{len(rows)} checks, {len(fails)} FAIL")