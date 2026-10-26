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

    # ---- navbar (Phase 15A) ----
    nav = A.get('/boards').content.decode()
    check('navbar has live link', 'href="/live-data"' in nav, True)
    check('navbar new user menu', 'id="nvTrigger"' in nav, True)
    check('navbar old user menu gone', 'id="userDropdown"' in nav, False)
    check('anon navbar has no user menu', 'nvTrigger' in anon.get('/').content.decode(), False)

    # ---- upload ----
    csv = SimpleUploadedFile('zz_test.csv', b'name,sales,cost\na,10,1\nb,20,2\nc,30,3\n', content_type='text/csv')
    r = A.post('/upload', {'file': csv})
    d = js(r).get('data', {})
    check('upload ok', r.status_code, 200)
    check('upload json shape', all(k in d for k in ['id', 'filename', 'rows', 'columns', 'column_names', 'preview']), True)
    ds = d.get('id')
    r = A.post('/upload', {'file': SimpleUploadedFile('x.txt', b'hi')})
    check('upload bad type', r.status_code, 400)
    check('upload no file', A.post('/upload').status_code, 400)
    if ds:
        check('create-chart lists own recent dataset', 'zz_test.csv' in A.get('/create-chart').content.decode(), True)
        check('create-chart hides other users datasets', 'zz_test.csv' in B.get('/create-chart').content.decode(), False)

    cid = rid = tok = rtok = None
    if ds:
        r = A.get(f'/get-dataset-columns/{ds}')
        check('get-dataset-columns', r.status_code, 200)
        r = A.get(f'/get-dataset/{ds}')
        check('get-dataset owner', r.status_code, 200)
        check('get-dataset id matches', js(r).get('data', {}).get('id'), ds)
        check('B get-dataset', B.get(f'/get-dataset/{ds}').status_code, [403, 404])
        check('anon get-dataset', anon.get(f'/get-dataset/{ds}').status_code, 302)
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

        # ---- Phase 11: chart types + multiple Y columns ----
        from charts.models import Chart
        from datasets.models import Dataset

        def p11_save(chart_type, **cfg):
            body = {'title': 'ZZ p11', 'chart_type': chart_type, 'dataset_id': ds,
                    'color_scheme': 'default', **cfg}
            r = jpost(A, '/save-chart', body)
            return js(r).get('chart_id'), r.status_code

        def p11_data(chart_id):
            return js(A.get(f'/chart-data/{chart_id}'))

        def p11_cfg(chart_id):
            return js(A.get(f'/get-chart/{chart_id}')).get('chart', {}).get('config', {})

        # Old saved chart: config has NO y_axes key (saved before 11.3a)
        old = Chart.objects.create(owner=ua, dataset=Dataset.objects.get(pk=ds), title='ZZ legacy',
                                   chart_type='bar',
                                   config={'x_axis': 'name', 'y_axis': 'sales', 'color_scheme': 'default'})
        r = A.get(f'/chart-data/{old.id}')
        check('legacy config (no y_axes) chart-data', r.status_code, 200)
        check('legacy config labels', js(r).get('labels'), [['a', 'b', 'c']])
        check('legacy config values', js(r).get('series', [{}])[0].get('values'), [[10, 20, 30]])

        # Two Y columns
        mid, st = p11_save('bar', x_axis='name', y_axes=['sales', 'cost'])
        check('save-chart multi y_axes', st, 200)
        cfg = p11_cfg(mid)
        check('multi saved y_axes', cfg.get('y_axes'), [['sales', 'cost']])
        check('multi saved y_axis = first', cfg.get('y_axis'), 'sales')
        res = p11_data(mid)
        check('multi series columns', [s.get('column') for s in res.get('series', [])], [['sales', 'cost']])
        check('multi series values', [s.get('values') for s in res.get('series', [])], [[[10, 20, 30], [1, 2, 3]]])

        # Dirty y_axes are cleaned on save
        did, st = p11_save('bar', x_axis='name', y_axes=['sales', 'sales', '', 5, 'cost'])
        check('y_axes cleaned (dupes, blanks, non-strings)', p11_cfg(did).get('y_axes'), [['sales', 'cost']])

        # y_axes without y_axis
        lid, st = p11_save('line', x_axis='name', y_axes=['cost'])
        check('y_axes only: y_axis filled', p11_cfg(lid).get('y_axis'), 'cost')
        check('y_axes only: values', p11_data(lid).get('series', [{}])[0].get('values'), [[1, 2, 3]])

        # Doughnut stays single series even if y_axes is sent
        pid, st = p11_save('doughnut', label_column='name', value_column='sales', y_axes=['sales', 'cost'])
        res = p11_data(pid)
        check('doughnut values', res.get('series', [{}])[0].get('values'), [[10, 20, 30]])
        check('doughnut ignores y_axes (1 series)', len(res.get('series', [])), 1)

        # New chart types save and read back
        for t in ['hbar', 'area', 'radar', 'stacked', 'combo']:
            tid, st = p11_save(t, x_axis='name', y_axis='sales')
            check(f'save-chart {t}', st, 200)
            check(f'chart-data {t}', A.get(f'/chart-data/{tid}').status_code, 200)
        check('save-chart invalid type', p11_save('banana', x_axis='name', y_axis='sales')[1], 400)

        # Histogram: one numeric column, counted in bins
        hid, st = p11_save('histogram', x_axis='sales')
        check('save-chart histogram', st, 200)
        res = p11_data(hid)
        check('histogram chart-data bins', len(res.get('labels', [])), 10)
        check('histogram chart-data total', sum(res.get('series', [{}])[0].get('values', [])), 3)
        check('histogram chart-data mode', res.get('meta', {}).get('mode'), 'histogram')
        hbad, st = p11_save('histogram', x_axis='name')
        check('histogram on text column -> 400', A.get(f'/chart-data/{hbad}').status_code, 400)
        hno, st = p11_save('histogram')
        check('histogram without column -> 400', A.get(f'/chart-data/{hno}').status_code, 400)
        hs = js(A.post(f'/share-chart/{hid}')).get('share_token')
        check('shared-data histogram', js(anon.get(f'/shared-data/{hs}')).get('meta', {}).get('mode'), 'histogram')

        # Scatter stays single series; unknown column is a clean 400
        sid, st = p11_save('scatter', x_axis='name', y_axes=['sales', 'cost'])
        check('scatter stays 1 series', len(p11_data(sid).get('series', [])), 1)
        bid, st = p11_save('bar', x_axis='name', y_axes=['sales', 'nope'])
        check('unknown column in y_axes -> 400', A.get(f'/chart-data/{bid}').status_code, 400)

        # Shared multi-series chart
        mtok = js(A.post(f'/share-chart/{mid}')).get('share_token')
        r = anon.get(f'/shared-data/{mtok}')
        check('shared-data multi status', r.status_code, 200)
        check('shared-data multi values', [s.get('values') for s in js(r).get('series', [])], [[[10, 20, 30], [1, 2, 3]]])
        check('B chart-data multi', B.get(f'/chart-data/{mid}').status_code, [403, 404])

        # ---- Phase 12A: chart_options ----
        good_opts = {'show_title': True, 'title_text': 'Hello', 'legend': {'show': False, 'position': 'top'},
                     'x_title': 'Name', 'y_title': 'Sales', 'grid': False, 'font_size': 14,
                     'series_colors': ['#112233', '#AABBCC'], 'smooth': False}
        oid, st = p11_save('bar', x_axis='name', y_axes=['sales', 'cost'], chart_options=good_opts)
        check('save-chart with options', st, 200)
        check('options roundtrip', p11_cfg(oid).get('chart_options'), good_opts)
        check('chart-data unaffected by options', [s.get('values') for s in p11_data(oid).get('series', [])], [[[10, 20, 30], [1, 2, 3]]])

        dirty = {'show_title': 'yes', 'title_text': 'x' * 121, 'font_size': 99, 'series_colors': ['red'],
                 'evil': 1, 'legend': {'position': 'diagonal', 'show': True}}
        dopt, st = p11_save('bar', x_axis='name', y_axis='sales', chart_options=dirty)
        check('dirty options saved ok', st, 200)
        check('dirty options cleaned', p11_cfg(dopt).get('chart_options'), {'legend': {'show': True}})
        nopt, st = p11_save('bar', x_axis='name', y_axis='sales')
        check('no options -> empty dict', p11_cfg(nopt).get('chart_options'), {})
        jopt, st = p11_save('bar', x_axis='name', y_axis='sales', chart_options='junk')
        check('non-dict options -> empty dict', p11_cfg(jopt).get('chart_options'), {})

        otok = js(A.post(f'/share-chart/{oid}')).get('share_token')
        r = anon.get(f'/shared/{otok}')
        check('shared page with options', r.status_code, 200)
        check('shared page carries options', '"series_colors"' in r.content.decode(), True)
        check('shared-data with options', anon.get(f'/shared-data/{otok}').status_code, 200)

        upd = {'title': 'ZZ p12', 'chart_type': 'bar', 'x_axis': 'name', 'y_axes': ['sales'], 'color_scheme': 'default'}
        check('update w/o options', jput(A, f'/update-chart/{oid}', upd).status_code, 200)
        check('update w/o options keeps saved', p11_cfg(oid).get('chart_options'), good_opts)
        jput(A, f'/update-chart/{oid}', {**upd, 'chart_options': {'grid': False}})
        check('update replaces options', p11_cfg(oid).get('chart_options'), {'grid': False})
        jput(A, f'/update-chart/{oid}', {**upd, 'chart_options': {}})
        check('update with {} clears options', p11_cfg(oid).get('chart_options'), {})
        check('legacy config has no options key', 'chart_options' not in p11_cfg(old.id), True)

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
        # ---- Phase 14A: boards ----
        def p14_board(board_id):
            return js(A.get(f'/get-board/{board_id}')).get('board', {})

        for p in ['/boards', '/create-board', '/get-board/1', '/view-board/1']:
            check(f'anon GET {p}', anon.get(p).status_code, 302)
        check('anon POST /save-board', anon.post('/save-board').status_code, 302)
        for p in ['/boards', '/create-board']:
            check(f'user GET {p}', A.get(p).status_code, 200)
        items = [{'chart_id': cid, 'size': 'l'}, {'chart_id': mid, 'size': 'zz'}]
        r = jpost(A, '/save-board', {'title': 'ZZ board', 'items': items, 'refresh_seconds': 60})
        check('save-board', r.status_code, 200)
        bid = js(r).get('board_id')
        check('save-board json shape', bool(bid), True)
        if bid:
            b = p14_board(bid)
            check('get-board owner', A.get(f'/get-board/{bid}').status_code, 200)
            check('board item order kept', [i['chart_id'] for i in b.get('items', [])], [[cid, mid]])
            check('board sizes whitelisted', [i['size'] for i in b.get('items', [])], [['l', 'm']])
            check('board refresh saved', b.get('refresh_seconds'), 60)
            check('board chart_count', b.get('chart_count'), 2)
            check('boards page lists title', 'ZZ board' in A.get('/boards').content.decode(), True)
            check('edit-board owner', A.get(f'/edit-board/{bid}').status_code, 200)
            r = A.get(f'/view-board/{bid}')
            check('view-board owner', r.status_code, 200)
            vb = r.content.decode()
            check('view-board has board data', 'id="boardData"' in vb, True)
            check('view-board has chart title', 'ZZ renamed' in vb, True)
            check('view-board hides preview rows', '"preview"' in vb, False)
            check('B view-board', B.get(f'/view-board/{bid}').status_code, 404)
            check('B edit-board', B.get(f'/edit-board/{bid}').status_code, 404)
            check('B get-board', B.get(f'/get-board/{bid}').status_code, [403, 404])
            check('B update-board', jput(B, f'/update-board/{bid}', {'title': 'x'}).status_code, [403, 404])
            check('B delete-board', B.delete(f'/delete-board/{bid}').status_code, [403, 404])
            check('B save-board with A chart', jpost(B, '/save-board', {'title': 'x', 'items': [{'chart_id': cid}]}).status_code, 403)
            check('save-board no items', jpost(A, '/save-board', {'title': 'x', 'items': []}).status_code, 400)
            check('save-board junk items', jpost(A, '/save-board', {'title': 'x', 'items': 'junk'}).status_code, 400)

            check('view-board tile data_url', f'/chart-data/{cid}' in vb, True)
            check('anon share-board', anon.post(f'/share-board/{bid}').status_code, 302)
            check('B share-board', B.post(f'/share-board/{bid}').status_code, [403, 404])
            r = A.post(f'/share-board/{bid}')
            check('share-board owner', r.status_code, 200)
            tok = js(r).get('share_token')
            check('share-board token shape', bool(tok), True)
            r = anon.get(f'/shared-board/{tok}')
            check('shared-board public page', r.status_code, 200)
            sb = r.content.decode()
            check('shared-board has title', 'ZZ board' in sb, True)
            check('shared-board hides preview rows', '"preview"' in sb, False)
            check('shared-board no dataset key', '"dataset"' in sb, False)
            check('shared-board-data public', anon.get(f'/shared-board-data/{tok}/{cid}').status_code, 200)
            zid, _ = p11_save('bar', x_axis='name', y_axis='sales')
            check('shared-board-data chart not in board', anon.get(f'/shared-board-data/{tok}/{zid}').status_code, 404)
            A.delete(f'/delete-chart/{zid}')
            check('shared-board-data bad token', anon.get(f'/shared-board-data/nope/{cid}').status_code, 404)
            check('view-board shows share link', f'/shared-board/{tok}' in A.get(f'/view-board/{bid}').content.decode(), True)
            check('B unshare-board', B.post(f'/unshare-board/{bid}').status_code, [403, 404])
            check('unshare-board owner', A.post(f'/unshare-board/{bid}').status_code, 200)
            check('shared-board after unshare', anon.get(f'/shared-board/{tok}').status_code, 404)
            check('shared-board-data after unshare', anon.get(f'/shared-board-data/{tok}/{cid}').status_code, 404)
            check('re-share keeps token', js(A.post(f'/share-board/{bid}')).get('share_token'), tok)

            r = jpost(A, '/save-board', {'title': 'ZZ dup', 'items': [{'chart_id': cid}, {'chart_id': cid, 'size': 's'}], 'refresh_seconds': 7})
            check('save-board dup items', r.status_code, 200)
            b2 = p14_board(js(r).get('board_id'))
            check('dup items deduped', len(b2.get('items', [])), 1)
            check('bad refresh -> 0', b2.get('refresh_seconds'), 0)

            xid, _ = p11_save('bar', x_axis='name', y_axis='sales')
            r = jpost(A, '/save-board', {'title': 'ZZ gone', 'items': [{'chart_id': xid}, {'chart_id': mid}]})
            xb = js(r).get('board_id')
            A.delete(f'/delete-chart/{xid}')
            check('board survives chart delete (count)', p14_board(xb).get('chart_count'), 1)

            r = jput(A, f'/update-board/{bid}', {'title': 'ZZ board 2', 'items': [{'chart_id': mid, 'size': 's'}], 'refresh_seconds': 30})
            check('update-board owner', r.status_code, 200)
            b = p14_board(bid)
            check('update-board title', b.get('title'), 'ZZ board 2')
            check('update-board items', [i['chart_id'] for i in b.get('items', [])], [[mid]])

            check('delete-board owner', A.delete(f'/delete-board/{bid}').status_code, 200)
            check('get-board after delete', A.get(f'/get-board/{bid}').status_code, 404)
    if cid:
        check('delete-chart owner', A.delete(f'/delete-chart/{cid}').status_code, 200)
        check('get-chart after delete', A.get(f'/get-chart/{cid}').status_code, 404)
    if ds:
        from datasets.models import Dataset
        from datasets.services import cache_path
        obj = Dataset.objects.get(pk=ds)
        raw_path = os.path.join(settings.UPLOAD_ROOT, obj.filename)
        cache_file = cache_path(obj)
        check('raw file exists before delete', os.path.exists(raw_path), True)
        check('cache exists before delete', os.path.exists(cache_file), True)
        check('B delete-dataset', B.delete(f'/delete-dataset/{ds}').status_code, [403, 404])
        check('anon delete-dataset', anon.delete(f'/delete-dataset/{ds}').status_code, 302)
        r = A.delete(f'/delete-dataset/{ds}')
        check('delete-dataset owner', r.status_code, 200)
        check('raw file removed', os.path.exists(raw_path), False)
        check('cache removed', os.path.exists(cache_file), False)
        check('get-dataset after delete', A.get(f'/get-dataset/{ds}').status_code, 404)

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