import ipaddress
import socket
from urllib.parse import urlparse

import requests
from django.conf import settings


def extract_json_value(data, path):
    """Walk a dotted path like 'data.0.price' through dicts/lists."""
    if not path:
        return None
    value = data
    for key in path.split('.'):
        if isinstance(value, dict):
            value = value.get(key)
        elif isinstance(value, list) and key.isdigit():
            try:
                value = value[int(key)]
            except IndexError:
                return None
        else:
            return None
    return value


def is_allowed_api_url(url):
    """http/https only. Outside DEBUG, refuse private/loopback addresses (SSRF guard).
    Blocking DNS lookup: call via asyncio.to_thread."""
    try:
        parsed = urlparse(str(url))
        host = parsed.hostname
        if parsed.scheme not in ('http', 'https') or not host:
            return False
        if settings.STREAM_ALLOW_PRIVATE_URLS:
            return True
        port = parsed.port or (443 if parsed.scheme == 'https' else 80)
        for info in socket.getaddrinfo(host, port):
            ip = ipaddress.ip_address(info[4][0])
            if (ip.is_private or ip.is_loopback or ip.is_link_local
                    or ip.is_reserved or ip.is_multicast or ip.is_unspecified):
                return False
        return True
    except (ValueError, socket.gaierror):
        return False


def fetch_json(url):
    """Blocking. Call via asyncio.to_thread. In production redirects are off,
    otherwise a public URL could redirect to an internal one."""
    response = requests.get(url, timeout=5, allow_redirects=settings.STREAM_ALLOW_PRIVATE_URLS)
    response.raise_for_status()
    return response.json()