"""Smoke test for StreamConsumer.  Run:  python tools/test_streaming.py <username>"""
import asyncio
import os
import sys

sys.path.insert(0, os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()

from channels.db import database_sync_to_async
from channels.testing import WebsocketCommunicator
from django.contrib.auth.models import AnonymousUser

from accounts.models import User
from datasets.models import Dataset
import streaming.consumers as sc
from streaming.consumers import StreamConsumer, to_finite_number


def make(user):
    comm = WebsocketCommunicator(StreamConsumer.as_asgi(), '/ws/live/')
    comm.scope['user'] = user          # real browsers get this from the session cookie
    return comm


async def event(comm, timeout=3):
    msg = await comm.receive_json_from(timeout=timeout)
    return msg['event'], msg['data']


async def drain(comm):
    while not await comm.receive_nothing(timeout=0.3):
        await comm.receive_output(timeout=1)


async def main(username):
    user = await database_sync_to_async(User.objects.get)(username=username)

    anon = make(AnonymousUser())
    ok, _ = await anon.connect()
    print('1. anonymous accepted?          ', ok, '(expect False)')

    comm = make(user)
    ok, _ = await comm.connect()
    print('2. logged-in accepted?          ', ok, '(expect True)')
    print('   first event:                 ', (await event(comm))[0], '(expect connection_response)')

    await comm.send_json_to({'event': 'join_live_session', 'data': {'session_id': 's1'}})
    print('3. join ->                      ', (await event(comm))[0], '(expect joined_session)')

    await comm.send_json_to({'event': 'start_simulation', 'data': {'session_id': 's1', 'interval': 100}})
    names = [(await event(comm))[0] for _ in range(4)]
    print('4. simulation events:           ', names)
    print('   has simulation_started + points?', 'simulation_started' in names and 'new_data_point' in names)

    await comm.send_json_to({'event': 'stop_stream', 'data': {'session_id': 's1'}})
    while (await event(comm))[0] != 'stream_stopped':
        pass
    await drain(comm)
    print('5. silent after stop?           ', await comm.receive_nothing(timeout=1.0), '(expect True)')

    await comm.send_json_to({'event': 'stream_from_dataset',
                             'data': {'session_id': 's2', 'dataset_id': 999999}})
    print('6. foreign/missing dataset ->   ', (await event(comm)), '(expect error)')

    ds = await database_sync_to_async(lambda: Dataset.objects.filter(owner=user).first())()
    if ds:
        cols = ds.column_names
        nums = [c for c in cols if str(ds.data_types.get(c, '')).startswith(('int', 'float'))]
        ycol = nums[-1] if nums else cols[-1]
        await comm.send_json_to({'event': 'stream_from_dataset', 'data': {
            'session_id': 's3', 'dataset_id': ds.id, 'interval': 100,
            'x_column': cols[0], 'y_column': ycol}})
        got = [(await event(comm))[0] for _ in range(3)]
        print('7. dataset stream events:       ', got)
        await comm.send_json_to({'event': 'stop_stream', 'data': {'session_id': 's3'}})
        await drain(comm)
        await comm.send_json_to({'event': 'stream_from_dataset', 'data': {
            'session_id': 's4', 'dataset_id': ds.id, 'interval': 100,
            'x_column': 'no_such_col', 'y_column': ycol}})
        print('7b. bad column ->               ', (await event(comm)), '(expect error)')

    await comm.send_json_to({'event': 'test_api_endpoint', 'data': {'api_url': 'ftp://example.com'}})
    print('8. bad scheme ->                ', (await event(comm))[0], '(expect api_test_failed)')
    await comm.send_json_to({'event': 'test_api_endpoint', 'data': {'api_url': 'http://127.0.0.1:1/'}})
    print('9. closed port ->               ', (await event(comm))[0], '(expect api_test_failed)')

    # 10. API stream: a real 0 is kept, missing / non-numeric values are skipped, never faked
    print('10. number helper:              ',
          [to_finite_number(v) for v in (0, '3.5', None, 'abc', float('nan'), float('inf'), True, '')],
          '(expect [0.0, 3.5, None, None, None, None, None, None])')
    replies = iter([{'value': 0, 'label': 'zero'}, {'other': 1}, {'value': 'abc'},
                    {'value': 42.5, 'label': None}])
    real_allowed, real_fetch = sc.is_allowed_api_url, sc.fetch_json
    sc.is_allowed_api_url = lambda url: True
    sc.fetch_json = lambda url: next(replies, {'value': 1})
    try:
        await comm.send_json_to({'event': 'stream_from_api', 'data': {
            'session_id': 's5', 'api_url': 'http://example.test/', 'interval': 100}})
        got = [await event(comm) for _ in range(4)]
    finally:
        sc.is_allowed_api_url, sc.fetch_json = real_allowed, real_fetch
        await comm.send_json_to({'event': 'stop_stream', 'data': {'session_id': 's5'}})
        await drain(comm)
    pts = [g[1].get('data', {}) for g in got]
    print('10b. API stream events:         ', [g[0] for g in got],
          '(expect new_data_point, api_error, api_error, new_data_point)')
    print('   real 0 and label kept?        ', pts[0].get('value') == 0 and pts[0].get('label') == 'zero', '(expect True)')
    print('   missing + bad value skipped?  ', got[1][0] == 'api_error' and got[2][0] == 'api_error', '(expect True)')
    print('   null label -> timestamp?      ', pts[3].get('value') == 42.5 and len(str(pts[3].get('label'))) == 8, '(expect True)')

    await comm.disconnect()
    print('done')


asyncio.run(main(sys.argv[1]))