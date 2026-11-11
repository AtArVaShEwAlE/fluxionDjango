"""Chart type registry (Python side). One list, everything else derives from it.

(key, label, enabled)
  enabled False = known to the database choices, but not yet savable or
  selectable (flip to True when its renderer ships).
JS mirror: static/js/chart_types.js. tools/test_registry.py keeps both in sync.
No Django imports: tests load this file alone.
"""
CHART_TYPES = [
    ('bar', 'Bar', True),
    ('line', 'Line', True),
    ('pie', 'Pie', True),
    ('scatter', 'Scatter', True),
    ('hbar', 'Horizontal Bar', True),
    ('area', 'Area', True),
    ('doughnut', 'Doughnut', True),
    ('radar', 'Radar', True),
    ('stacked', 'Stacked Bar', True),
    ('combo', 'Combo', True),
    ('histogram', 'Histogram', True),
    # Phase 19 Tier A
    ('stacked_area', 'Stacked Area', True),
    ('bubble', 'Bubble', True),
    ('waterfall', 'Waterfall', True),
    ('funnel', 'Funnel', True),
    ('pareto', 'Pareto', True),
    ('bullet', 'Bullet', True),
    ('dual_line', 'Dual-Axis Line', True),
    ('density', 'Density', True),
    ('gantt', 'Gantt', True),
]

CHOICES = [(key, label) for key, label, _on in CHART_TYPES]
ENABLED = frozenset(key for key, _label, on in CHART_TYPES if on)