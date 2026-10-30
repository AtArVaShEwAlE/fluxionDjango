"""Static checks for Phase 16 mobile nav. No DB, no Django: reads files only."""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
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


def urls(text):
    return re.findall(r"\{% url '([a-z_]+)' %\}", text)


base = read('templates', 'base.html')
tab = read('templates', 'partials', 'tabbar.html')
css = read('static', 'css', 'mobile-nav.css')
app = read('static', 'css', 'mobile-app.css')
js = read('static', 'js', 'mobile-nav.js')
navjs = read('static', 'js', 'navbar.js')

for label, text in [('base.html', base), ('tabbar.html', tab), ('mobile-nav.css', css), ('mobile-app.css', app), ('mobile-nav.js', js), ('navbar.js', navjs)]:
    check(f'{label} exists', text is not None, True)

if None in (base, tab, css, app, js, navjs):
    print('missing file(s), stopping')
    sys.exit(1)

AUTH = ['dashboard', 'create_chart', 'charts', 'reports', 'boards', 'live_data']
ANON = ['landing', 'about', 'contact', 'faq']
auth_part, anon_part = tab.split('{% else %}')

check('tabbar logged-in url order', urls(auth_part), AUTH)
check('tabbar logged-out url order', urls(anon_part), ANON)
for name in AUTH + ANON:
    check(f'desktop nav also has {name}', name in urls(base), True)
for part_label, part, n in [('logged-in', auth_part, 6), ('logged-out', anon_part, 4)]:
    check(f'{part_label} tab count', part.count('<a href='), n)
    check(f'{part_label} svg per tab', part.count('<svg viewBox="0 0 24 24" aria-hidden="true">'), n)
    check(f'{part_label} label per tab', part.count('<span>'), n)
    check(f'{part_label} active+aria per tab', part.count('aria-current="page"'), n)

check('tabbar paste damage', re.findall(r'<pathd|<circlecx|<rectx|<svgviewBox|%\}/\*\*', tab), [])

check('viewport-fit=cover', 'viewport-fit=cover' in base, True)
check('mobile-nav.css linked once', base.count('css/mobile-nav.css'), 1)
check('mobile-nav.css after extra_css block', base.index('css/mobile-nav.css') > base.index('{% block extra_css %}'), True)
check('tabbar included once', base.count("partials/tabbar.html"), 1)
check('messages included once', base.count("partials/messages.html"), 1)
check('tabbar before messages', base.index("partials/tabbar.html") < base.index("partials/messages.html"), True)
check('mobile-nav.js loaded once', base.count('js/mobile-nav.js'), 1)
check('mobile-nav.js after navbar.js', base.index('js/mobile-nav.js') > base.index('js/navbar.js'), True)
check('menu mobile-only items (4 links + sep)', base.count('nv-mobile-only'), 5)

for text, label in [(base, 'base.html'), (tab, 'tabbar.html')]:
    for p in re.findall(r"\{% static '([^']+)' %\}", text):
        check(f'{label} static exists: {p}', os.path.exists(os.path.join(ROOT, 'static', p)), True)

check('css braces balanced', css.count('{') == css.count('}'), True)
check('css breakpoint 900', 'max-width: 900px' in css, True)
check('css bottom safe-area', 'safe-area-inset-bottom' in css, True)
check('css tabbar hidden by default', bool(re.search(r'^\.tabbar \{\s*display: none;', css, re.M)), True)
check('css kb-open rule', 'html.kb-open .tabbar' in css, True)
check('css no 100vh (use dvh)', '100vh' in css, False)
check('css 44px targets >= 4', css.count('min-height: 44px') >= 4, True)

check('js kb-open', 'kb-open' in js, True)
check('js matchMedia', 'matchMedia' in js, True)
check('navbar.js filters mobile-only items', 'nv-mobile-only' in navjs, True)
check('navbar.js matchMedia matches css 1319 bound', '(max-width: 1319px)' in navjs, True)
check('css desktop fit bound 1319', 'max-width: 1319px' in css, True)
check('css desktop fit bound 1535', 'max-width: 1535px' in css, True)
check('css hides left links via :has', ':has(.navbar-links-right) .navbar-links-left' in css, True)


# mobile-app.css (Phase 16B): page-app only, no 100vh, linked last
check('mobile-app.css linked once', base.count('css/mobile-app.css'), 1)
check('mobile-app.css after mobile-nav.css', base.index('css/mobile-app.css') > base.index('css/mobile-nav.css'), True)
check('app css braces balanced', app.count('{') == app.count('}'), True)
check('app css no 100vh (use dvh)', '100vh' in app, False)
check('app css modal full height dvh', '100dvh' in app, True)
check('app css action bar fixed', 'position: fixed' in app, True)
check('app css kb-open action bar', 'html.kb-open body.page-app .axis-config-panel .chart-actions' in app, True)
check('app css inputs 16px (no iOS zoom)', 'font-size: 16px' in app, True)
_plain = re.sub(r'/\*.*?\*/', '', app, flags=re.S)
_unscoped = []
for chunk in re.findall(r'([^{}]+)\{', _plain):
    chunk = chunk.strip()
    if chunk.startswith('@'):
        continue
    for sel in chunk.split(','):
        sel = sel.strip()
        if sel and not (sel.startswith('body.page-app') or sel.startswith('html.kb-open body.page-app')):
            _unscoped.append(sel)
check('app css every selector scoped to body.page-app', _unscoped, [])

w = max(len(r[1]) for r in rows)
for res, label, got, exp in rows:
    if res == 'FAIL':
        print(f'{res:<5} {label:<{w}} {got}  {exp}')
fails = [r for r in rows if r[0] == 'FAIL']
print(f"\n{len(rows)} checks, {len(fails)} FAIL")