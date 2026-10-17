import asyncio
import logging
import math
import random
import re
import time

import pandas as pd
import requests
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from datasets.models import Dataset
from datasets.services import load_dataframe

from .services import extract_json_value, fetch_json, is_allowed_api_url

logger = logging.getLogger(__name__)

SIMULATION_SECONDS = 120
API_STREAM_SECONDS = 180
API_MAX_REQUESTS = 60
MIN_INTERVAL_MS = 100
MAX_INTERVAL_MS = 60_000
MAX_STREAMS = 5
MAX_STREAM_ROWS = 5000 

class StreamConsumer(AsyncJsonWebsocketConsumer):
    """One instance per browser connection. Messages both ways: {"event": str, "data": dict}."""

    EVENT_HANDLERS = {
        'join_live_session': 'on_join',
        'leave_live_session': 'on_leave',
        'start_simulation': 'on_start_simulation',
        'stream_from_dataset': 'on_stream_from_dataset',
        'stream_from_api': 'on_stream_from_api',
        'test_api_endpoint': 'on_test_api',
        'stop_stream': 'on_stop_stream',
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.tasks = {}      # session_id -> running asyncio.Task
        self.joined = set()  # channel-layer group names this connection joined

    # ---------- connection lifecycle ----------

    async def connect(self):
        user = self.scope['user']
        if not user.is_authenticated:
            await self.close()          # rejected before accept -> HTTP 403
            return
        self.user = user
        await self.accept()
        await self.emit('connection_response', {'status': 'connected'})

    async def disconnect(self, code):
        for task in list(self.tasks.values()):
            task.cancel()
        self.tasks.clear()
        for group in list(self.joined):
            await self.channel_layer.group_discard(group, self.channel_name)
        self.joined.clear()

    async def receive_json(self, content, **kwargs):
        if not isinstance(content, dict):
            return
        event = content.get('event')
        data = content.get('data')
        if not isinstance(data, dict):
            data = {}
        method = self.EVENT_HANDLERS.get(event)
        if method is None:
            await self.emit('error', {'message': f'Unknown event: {event}'})
            return
        try:
            await getattr(self, method)(data)
        except Exception as exc:
            logger.exception('Error handling %s', event)
            await self.emit('error', {'message': str(exc)})

    # ---------- helpers ----------

    async def emit(self, event, data):
        await self.send_json({'event': event, 'data': data})

    def group_name(self, session_id):
        safe = re.sub(r'[^A-Za-z0-9_.-]', '_', str(session_id))[:60]
        return f'live_{self.user.id}_{safe}'     # per-user: nobody can join another user's session

    async def ensure_joined(self, session_id):
        group = self.group_name(session_id)
        if group not in self.joined:
            await self.channel_layer.group_add(group, self.channel_name)
            self.joined.add(group)

    async def broadcast(self, session_id, event, data):
        await self.channel_layer.group_send(
            self.group_name(session_id),
            {'type': 'stream.message', 'event': event, 'data': data},
        )

    async def stream_message(self, message):
        """Receives group_send messages (type 'stream.message') and forwards to the browser."""
        await self.emit(message['event'], message['data'])

    async def valid_session(self, session_id):
        if session_id is None or session_id == '':
            await self.emit('error', {'message': 'session_id is required'})
            return False
        return True

    @staticmethod
    def clean_interval(value, default):
        try:
            value = int(value)
        except (TypeError, ValueError):
            value = default
        return max(MIN_INTERVAL_MS, min(value, MAX_INTERVAL_MS))

    async def launch(self, session_id, make_coro):
        """Start a background stream for this session (replaces a running one)."""
        key = str(session_id)
        if key not in self.tasks and len(self.tasks) >= MAX_STREAMS:
            await self.emit('error', {'message': f'Too many active streams (max {MAX_STREAMS})'})
            return False
        old = self.tasks.pop(key, None)
        if old:
            old.cancel()
        await self.ensure_joined(session_id)
        task = asyncio.create_task(make_coro())
        self.tasks[key] = task
        task.add_done_callback(lambda t, k=key: self.tasks.get(k) is t and self.tasks.pop(k, None))
        return True

    # ---------- event handlers (same names/payloads as Flask-SocketIO) ----------

    async def on_join(self, data):
        session_id = data.get('session_id')
        if not await self.valid_session(session_id):
            return
        await self.ensure_joined(session_id)
        await self.emit('joined_session', {'session_id': session_id})

    async def on_leave(self, data):
        session_id = data.get('session_id')
        group = self.group_name(session_id)
        if group in self.joined:
            await self.channel_layer.group_discard(group, self.channel_name)
            self.joined.discard(group)
        await self.emit('left_session', {'session_id': session_id})

    async def on_start_simulation(self, data):
        session_id = data.get('session_id')
        if not await self.valid_session(session_id):
            return
        interval = self.clean_interval(data.get('interval'), 1000)
        if await self.launch(session_id, lambda: self.simulate(session_id, interval)):
            await self.emit('simulation_started', {'session_id': session_id})

    async def on_stream_from_dataset(self, data):
        session_id = data.get('session_id')
        if not await self.valid_session(session_id):
            return
        x_column, y_column = data.get('x_column'), data.get('y_column')
        rows, error = await self.get_dataset_rows(data.get('dataset_id'), x_column, y_column)
        if rows is None:
            await self.emit('error', {'message': error})
            return
        interval = self.clean_interval(data.get('interval'), 1000)
        started = await self.launch(
            session_id, lambda: self.stream_rows(session_id, rows, interval))
        if started:
            await self.emit('dataset_stream_started', {'session_id': session_id})

    async def on_stream_from_api(self, data):
        session_id = data.get('session_id')
        if not await self.valid_session(session_id):
            return
        api_url = data.get('api_url')
        if not await asyncio.to_thread(is_allowed_api_url, api_url):
            await self.emit('error', {'message': 'API URL is not allowed'})
            return
        interval = self.clean_interval(data.get('interval'), 2000)
        value_path = data.get('value_path') or 'value'
        label_path = data.get('label_path') or 'label'
        await self.launch(
            session_id, lambda: self.poll_api(session_id, api_url, interval, value_path, label_path))

    async def on_test_api(self, data):
        api_url = data.get('api_url')
        if not await asyncio.to_thread(is_allowed_api_url, api_url):
            await self.emit('api_test_failed', {'message': 'API URL is not allowed'})
            return
        try:
            api_data = await asyncio.to_thread(fetch_json, api_url)
            await self.emit('api_test_success',
                            {'message': 'API endpoint is working!', 'sample_data': api_data})
        except requests.RequestException as exc:
            await self.emit('api_test_failed', {'message': f'API request failed: {exc}'})
        except Exception as exc:
            await self.emit('api_test_failed', {'message': f'Error: {exc}'})

    async def on_stop_stream(self, data):
        session_id = data.get('session_id')
        task = self.tasks.pop(str(session_id), None)
        if task:
            task.cancel()        # Flask only *announced* the stop; this really stops it
        await self.emit('stream_stopped', {'session_id': session_id})

    # ---------- background streams ----------

    @database_sync_to_async
    def get_dataset_rows(self, dataset_id, x_column, y_column):
        """(x, y) pairs from the full cached dataset, up to MAX_STREAM_ROWS.
        Returns (pairs, None) or (None, error message).
        Runs in a worker thread, so pandas never blocks the event loop."""
        try:
            dataset = Dataset.objects.get(pk=dataset_id, owner=self.user)
        except (Dataset.DoesNotExist, ValueError, TypeError):
            return None, 'Dataset not found or unauthorized'
        try:
            df = load_dataframe(dataset)
        except Exception:
            logger.exception('Could not load dataset %s for streaming', dataset_id)
            return None, 'Dataset file could not be loaded'

        for col in (x_column, y_column):
            if not isinstance(col, str) or col not in df.columns:
                return None, f'Unknown column: {col}'

        xs = df[x_column].head(MAX_STREAM_ROWS)
        ys = pd.to_numeric(df[y_column].head(MAX_STREAM_ROWS), errors='coerce')
        pairs = []
        for x, y in zip(xs, ys):
            if not math.isfinite(y):      # NaN / inf would break JSON in the browser
                continue                   # skip missing values instead of faking 0
            pairs.append(('' if pd.isna(x) else str(x), float(y)))
        if not pairs:
            return None, f"Column '{y_column}' has no numeric values"
        return pairs, None

    async def simulate(self, session_id, interval_ms):
        start = time.monotonic()
        count = 0
        while time.monotonic() - start < SIMULATION_SECONDS:
            count += 1
            point = {
                'timestamp': time.strftime('%H:%M:%S'),
                'value': random.randint(10, 100),
                'label': f'Point {count}',
            }
            await self.broadcast(session_id, 'new_data_point', {'data': point, 'session_id': session_id})
            await asyncio.sleep(interval_ms / 1000)

    async def stream_rows(self, session_id, rows, interval_ms):
        try:
            for index, (x_value, y_value) in enumerate(rows):
                point = {'timestamp': x_value, 'value': y_value,
                         'label': x_value, 'row_index': index}
                await self.broadcast(session_id, 'new_data_point', {'data': point, 'session_id': session_id})
                await asyncio.sleep(interval_ms / 1000)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.exception('Error streaming dataset')
            await self.broadcast(session_id, 'error',
                                 {'message': f'Error streaming dataset: {exc}', 'session_id': session_id})

    async def poll_api(self, session_id, api_url, interval_ms, value_path, label_path):
        start = time.monotonic()
        made = 0
        while time.monotonic() - start < API_STREAM_SECONDS and made < API_MAX_REQUESTS:
            try:
                api_data = await asyncio.to_thread(fetch_json, api_url)
                value = extract_json_value(api_data, value_path)
                label = extract_json_value(api_data, label_path)   # Flask used value_path here (bug)
                timestamp = time.strftime('%H:%M:%S')
                point = {
                    'timestamp': timestamp,
                    'value': float(value) if value else random.randint(10, 100),
                    'label': str(label) if label else timestamp,
                }
                await self.broadcast(session_id, 'new_data_point', {'data': point, 'session_id': session_id})
                made += 1
            except asyncio.CancelledError:
                raise
            except requests.RequestException as exc:
                await self.broadcast(session_id, 'api_error',
                                     {'message': f'API error: {exc}', 'session_id': session_id})
            except Exception as exc:
                logger.exception('Error in API streaming')
                await self.broadcast(session_id, 'error',
                                     {'message': f'API streaming stopped: {exc}', 'session_id': session_id})
                return
            await asyncio.sleep(interval_ms / 1000)