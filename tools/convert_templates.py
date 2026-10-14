"""Jinja2 -> Django template converter. Mechanical parts only.
Usage: python tools/convert_templates.py templates/base.html templates/landing.html
Prints leftover lines that need a human.
"""
import re
import sys
from pathlib import Path

RULES = [
    (r"\{\{\s*url_for\(\s*'static'\s*,\s*filename\s*=\s*'([^']+)'\s*\)\s*\}\}", r"{% static '\1' %}"),
    (r"\{\{\s*url_for\(\s*'([A-Za-z_]+)'\s*\)\s*\}\}", r"{% url '\1' %}"),
    (r"request\.endpoint\b", "request.resolver_match.url_name"),
    (r"\bcurrent_user\b", "user"),
    (r"\{\{\s*form\.hidden_tag\(\)\s*\}\}", "{% csrf_token %}"),
    (r"\{% with messages = get_flashed_messages\(with_categories=true\) %\}.*?\{% endwith %\}",
     "{% include 'partials/messages.html' %}"),
    (r'\{\{\s*form\.(\w+)\.label\(class="form-label"\)\s*\}\}\s*\{\{\s*form\.\1\([^}]*\)\s*\}\}\s*\{% if form\.\1\.errors %\}.*?\{% endif %\}',
        r"{% include 'partials/field.html' with field=form.\1 %}"),
    (r"\bloop\.index0\b", "forloop.counter0"),
    (r"\|capitalize\b", "|capfirst"),
]

LEFTOVER = [r'url_for\(', r'tojson', r'strftime', r'get_flashed_messages', r'form\.[\w.]+\(', r'\|length']

for arg in sys.argv[1:]:
    path = Path(arg)
    text = path.read_text(encoding='utf-8')
    for pattern, repl in RULES:
        text = re.sub(pattern, repl, text, flags=re.DOTALL)

    if '{% static' in text and '{% load static %}' not in text:
        lines = text.split('\n')
        if lines[0].lstrip().startswith('{% extends'):
            lines.insert(1, '{% load static %}')   # must come after extends
        else:
            lines.insert(0, '{% load static %}')
        text = '\n'.join(lines)

    path.write_text(text, encoding='utf-8')
    print(f'== {path}')
    for n, line in enumerate(text.split('\n'), 1):
        if any(re.search(k, line) for k in LEFTOVER):
            print(f'  TODO line {n}: {line.strip()}')