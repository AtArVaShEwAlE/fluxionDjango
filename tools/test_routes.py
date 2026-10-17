import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client
from django.test.utils import override_settings
from accounts.models import User

rows = []


def check(label, got, expected):
    exp = expected if isinstance(expected, (list, tuple, set)) else [expected]
    ok = got in exp
    rows.append((('PASS' if ok else 'FAIL'), label, got, '/'.join(map(str, exp))))
    return ok


def skip(label, why):
    rows.append(('SKIP', label, '-', why))


def js(r):
    try:
        return r.json()
    except Exception:
        return {}


def jpost(c, url, data):
    return c.post(url, json.dumps(data), content_type='application/json')


def jput(c, url, data):
    return c.put(url, json.dumps(data), content_type='application/json')


H = {'HTTP_HOST': 'localhost'}
PW = 'Tst-pass-12345'
User.objects.filter(username__startswith='zz_test_').delete()
ua = User.objects.create_user('zz_test_a', 'zz_a@example.com', PW)
ub = User.objects.create_user('zz_test_b', 'zz_b@example.com', PW)
staff = User.objects.create_user('zz_test_s', 'zz_s@example.com', PW, is_staff=True)

try:
    anon, A, B, S = Client(**H), Client(**H), Client(**H), Client(**H)
    A.force_login(ua); B.force_login(ub); S.force_login(staff)

    # ---- public pages ----
    for p in ['/', '/login', '/signup', '/about', '/faq', '/contact']:
        check(f'anon GET {p}', anon.get(p).status_code, 200)
    check('anon GET /shared/bad', anon.get('/shared/bad').status_code, 404)
    check('anon GET /shared-report/bad', anon.get('/shared-report/bad').status_code, 404)

    # ---- contact ----
    r = anon.post('/contact', {'name': 'T', 'email': 'bad', 'message': ''})
    check('contact POST invalid', r.status_code, 400)
    check('contact invalid json shape', js(r).get('success'), False)
    r = anon.post('/contact', {'name': 'Tester', 'email': 'zz@example.com', 'message': 'hello'})
    check('contact POST valid', r.status_code, 200)
    check('contact valid json shape', js(r).get('success'), True)
    from core.models import ContactMessage
    ContactMessage.objects.filter(email='zz@example.com').delete()

    # ---- auth redirects (anon) ----
    for p in ['/dashboard', '/create-chart', '/charts', '/reports', '/create-report',
              '/live-data', '/profile', '/change-password', '/logout']:
        r = anon.get(p)
        check(f'anon GET {p} -> login', r.status_code, 302)
        if p != '/logout':
            check(f'anon GET {p} redirect target', '/login' in r.get('Location', ''), True)
    for p in ['/upload', '/save-chart', '/save-report', '/share-chart/1', '/unshare-chart/1',
              '/clean-dataset/1', '/share-report/1', '/unshare-report/1']:
        check(f'anon POST {p}', anon.post(p).status_code, 302)
    for p in ['/get-chart/1', '/download-dataset/1', '/get-dataset-columns/1',
              '/export-chart-pdf/1', '/get-report/1']:
        check(f'anon GET {p}', anon.get(p).status_code, 302)

    # ---- login view ----
    L = Client(**H)
    r = L.post('/login', {'username': 'zz_test_a', 'password': 'wrong'})
    check('login wrong pw stays', r.status_code, 200)
    r = L.post('/login', {'username': 'zz_test_a', 'password': PW})
    check('login ok redirect', r.status_code, 302)
    check('login ok -> dashboard', r.get('Location', '').endswith('/dashboard'), True)
    check('logout GET', L.get('/logout').status_code, 302)

    # ---- logged in pages ----
    for p in ['/dashboard', '/create-chart', '/charts', '/reports', '/create-report',
              '/live-data', '/profile', '/change-password']:
        check(f'user GET {p}', A.get(p).status_code, 200)

    # ---- upload ----
    csv = SimpleUploadedFile('zz_test.csv', b'name,sales\na,10\nb,20\nc,30\n', content_type='text/csv')
    r = A.post('/upload', {'file': csv})
    d = js(r).get('data', {})
    check('upload ok', r.status_code, 200)
    check('upload json shape', all(k in d for k in ['id', 'filename', 'rows', 'columns', 'column_names', 'preview']), True)
    ds = d.get('id')
    r = A.post('/upload', {'file': SimpleUploadedFile('x.txt', b'hi')})
    check('upload bad type', r.status_code, 400)
    check('upload no file', A.post('/upload').status_code, 400)

    cid = rid = tok = rtok = None
    if ds:
        r = A.get(f'/get-dataset-columns/{ds}')
        check('get-dataset-columns', r.status_code, 200)
        check('download-dataset owner', A.get(f'/download-dataset/{ds}').status_code, 200)
        r = A.post(f'/clean-dataset/{ds}', json.dumps({}), content_type='application/json')
        check('clean-dataset no 500', r.status_code < 500, True)

        # ---- charts ----
        payload = {'title': 'ZZ chart', 'chart_type': 'bar', 'dataset_id': ds,
                   'x_axis': 'name', 'y_axis': 'sales', 'color_scheme': 'default'}
        r = jpost(A, '/save-chart', payload)
        check('save-chart', r.status_code, 200)
        cid = js(r).get('chart_id')
        check('save-chart json shape', bool(cid), True)
        check('save-chart other user dataset', jpost(B, '/save-chart', payload).status_code, [400, 403, 404])

    if cid:
        r = A.get(f'/get-chart/{cid}')
        check('get-chart owner', r.status_code, 200)
        check('get-chart json shape', 'chart' in js(r), True)
        r = jput(A, f'/update-chart/{cid}', {**payload, 'title': 'ZZ renamed'})
        check('update-chart owner', r.status_code, 200)
        check('export-chart-pdf owner', A.get(f'/export-chart-pdf/{cid}').status_code, 200)

        r = A.get(f'/chart-data/{cid}')
        check('chart-data owner', r.status_code, 200)
        check('chart-data labels', js(r).get('labels'), [['a', 'b', 'c']])
        check('chart-data values', js(r).get('series', [{}])[0].get('values'), [[10, 20, 30]])
        check('B chart-data', B.get(f'/chart-data/{cid}').status_code, [403, 404])
        check('anon chart-data', anon.get(f'/chart-data/{cid}').status_code, 302)
        spec = {'x': 'name', 'series': [{'column': 'sales', 'agg': 'sum'}]}
        r = jpost(A, f'/dataset-data/{ds}', spec)
        check('dataset-data owner', r.status_code, 200)
        check('dataset-data values', js(r).get('series', [{}])[0].get('values'), [[10, 20, 30]])
        check('dataset-data bad column', jpost(A, f'/dataset-data/{ds}', {'x': 'nope', 'series': [{'column': 'sales'}]}).status_code, 400)
        check('dataset-data bad json', A.post(f'/dataset-data/{ds}', 'x', content_type='application/json').status_code, 400)
        check('B dataset-data', jpost(B, f'/dataset-data/{ds}', spec).status_code, [403, 404])
        check('anon dataset-data', anon.post(f'/dataset-data/{ds}').status_code, 302)

        # other user
        check('B get-chart', B.get(f'/get-chart/{cid}').status_code, [403, 404])
        check('B update-chart', jput(B, f'/update-chart/{cid}', payload).status_code, [403, 404])
        check('B delete-chart', B.delete(f'/delete-chart/{cid}').status_code, [403, 404])
        check('B share-chart', B.post(f'/share-chart/{cid}').status_code, [403, 404])
        check('B export-chart-pdf', B.get(f'/export-chart-pdf/{cid}').status_code, [403, 404])
        check('B download-dataset', B.get(f'/download-dataset/{ds}').status_code, [403, 404])
        check('B get-dataset-columns', B.get(f'/get-dataset-columns/{ds}').status_code, [403, 404])
        check('B clean-dataset', B.post(f'/clean-dataset/{ds}', json.dumps({}), content_type='application/json').status_code, [403, 404])

        # share flow
        r = A.post(f'/share-chart/{cid}')
        check('share-chart owner', r.status_code, 200)
        tok = js(r).get('share_token')
        check('share-chart json shape', bool(tok) and 'share_url' in js(r), True)
        if tok:
            r = anon.get(f'/shared/{tok}')
            check('shared page anon', r.status_code, 200)
            body = r.content.decode()
            check('shared page hides preview rows', '"preview"' in body, False)
            check('shared page hides column stats', '"column_stats"' in body, False)
            check('shared page shows file name', 'zz_test.csv' in body, True)
            check('shared page iframe ok', r.get('X-Frame-Options'), None)
            r = anon.get(f'/shared-data/{tok}')
            check('shared-data anon', r.status_code, 200)
            check('shared-data values', js(r).get('series', [{}])[0].get('values'), [[10, 20, 30]])
            check('unshare-chart owner', A.post(f'/unshare-chart/{cid}').status_code, 200)
            check('shared page after unshare', anon.get(f'/shared/{tok}').status_code, 404)
            check('shared-data after unshare', anon.get(f'/shared-data/{tok}').status_code, 404)
        # reports
        r = jpost(A, '/save-report', {'title': 'ZZ report', 'chart_ids': [cid]})
        rid = js(r).get('report_id') or js(r).get('id')
        check('save-report', r.status_code, 200)
        if not rid:
            skip('report flow', 'save-report gave no report_id key; paste response')
    if rid:
        check('get-report owner', A.get(f'/get-report/{rid}').status_code, 200)
        check('B get-report', B.get(f'/get-report/{rid}').status_code, [403, 404])
        check('B delete-report', B.delete(f'/delete-report/{rid}').status_code, [403, 404])
        check('B share-report', B.post(f'/share-report/{rid}').status_code, [403, 404])
        r = A.post(f'/share-report/{rid}')
        check('share-report owner', r.status_code, 200)
        rtok = js(r).get('share_token')
        if rtok:
            r = anon.get(f'/shared-report/{rtok}')
            check('shared-report anon', r.status_code, 200)
            check('shared report hides preview rows', '"preview"' in r.content.decode(), False)
            check('shared-report-data anon', anon.get(f'/shared-report-data/{rtok}/{cid}').status_code, 200)
            check('shared-report-data bad chart', anon.get(f'/shared-report-data/{rtok}/999999').status_code, 404)
            check('unshare-report', A.post(f'/unshare-report/{rid}').status_code, 200)
            check('shared-report after unshare', anon.get(f'/shared-report/{rtok}').status_code, 404)
            check('shared-report-data after unshare', anon.get(f'/shared-report-data/{rtok}/{cid}').status_code, 404)
        check('delete-report owner', A.delete(f'/delete-report/{rid}').status_code, 200)
    if cid:
        check('delete-chart owner', A.delete(f'/delete-chart/{cid}').status_code, 200)
        check('get-chart after delete', A.get(f'/get-chart/{cid}').status_code, 404)

    # ---- debug-routes gate ----
    check('debug-routes DEBUG on', A.get('/debug-routes').status_code, 200)
    with override_settings(DEBUG=False, ALLOWED_HOSTS=['localhost']):
        check('debug-routes DEBUG off, user', A.get('/debug-routes').status_code, 404)
        check('debug-routes DEBUG off, staff', S.get('/debug-routes').status_code, 200)
        check('404 page', anon.get('/nope').status_code, 404)

    # ---- profile / password ----
    r = A.post('/profile', {'username': 'zz_test_a', 'email': 'zz_a@example.com', 'full_name': 'ZZ A'})
    check('profile POST', r.status_code, [200, 302])
finally:
    User.objects.filter(username__startswith='zz_test_').delete()

w = max(len(r[1]) for r in rows)
print(f"{'RES':<5} {'ROUTE/CHECK':<{w}} GOT  EXPECTED")
for res, label, got, exp in rows:
    print(f'{res:<5} {label:<{w}} {got}  {exp}')
fails = [r for r in rows if r[0] == 'FAIL']
print(f"\n{len(rows)} checks, {len(fails)} FAIL, {sum(r[0]=='SKIP' for r in rows)} SKIP")