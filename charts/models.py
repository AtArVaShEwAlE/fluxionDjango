import secrets

from django.conf import settings
from django.db import models


class Chart(models.Model):
    CHART_TYPES = [
        ('bar', 'Bar'), ('line', 'Line'), ('pie', 'Pie'), ('scatter', 'Scatter'),
        ('hbar', 'Horizontal Bar'), ('area', 'Area'),
        ('doughnut', 'Doughnut'), ('radar', 'Radar'),
        ('stacked', 'Stacked Bar'), ('combo', 'Combo'), ('histogram', 'Histogram'),
    ]
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                              related_name='charts')
    dataset = models.ForeignKey('datasets.Dataset', on_delete=models.CASCADE,
                                related_name='charts')
    title = models.CharField(max_length=255)
    chart_type = models.CharField(max_length=50, choices=CHART_TYPES)
    config = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_public = models.BooleanField(default=False)
    share_token = models.CharField(max_length=64, unique=True, null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def generate_share_token(self):
        self.share_token = secrets.token_urlsafe(32)
        return self.share_token

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'chart_type': self.chart_type,
            'config': self.config,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'is_public': self.is_public,
            'share_token': self.share_token,
            'dataset': self.dataset.to_dict() if self.dataset else None,
        }

    def __str__(self):
        return self.title


class Report(models.Model):
    """Ordered set of a user's charts, shared by one link."""
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                              related_name='reports')
    title = models.CharField(max_length=255)
    chart_ids = models.JSONField(default=list)   # chart ids, display order
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_public = models.BooleanField(default=False)
    share_token = models.CharField(max_length=64, unique=True, null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def generate_share_token(self):
        self.share_token = secrets.token_urlsafe(32)
        return self.share_token

    def set_chart_ids(self, ids_list):
        self.chart_ids = [int(i) for i in ids_list]

    def to_dict(self):
        """Resolve ids to chart dicts in saved order. Deleted charts skipped."""
        charts_by_id = {
            c.id: c for c in
            Chart.objects.filter(id__in=self.chart_ids).select_related('dataset')
        }
        ordered = [charts_by_id[cid].to_dict() for cid in self.chart_ids if cid in charts_by_id]
        return {
            'id': self.id,
            'title': self.title,
            'chart_count': len(ordered),
            'charts': ordered,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'is_public': self.is_public,
            'share_token': self.share_token,
        }

    def __str__(self):
        return self.title