import secrets

from django.conf import settings
from django.db import models

BOARD_SIZES = ('s', 'm', 'l')
BOARD_REFRESH = (0, 30, 60, 300)   # seconds, 0 = manual only
BOARD_MAX_ITEMS = 24


class Dashboard(models.Model):
    """Grid of a user's saved charts. items = [{chart_id, size}] in display order."""
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                              related_name='dashboards')
    title = models.CharField(max_length=255)
    items = models.JSONField(default=list)
    refresh_seconds = models.PositiveIntegerField(default=0)
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
        """chart_count = items whose chart still exists (deleted charts are skipped)."""
        from .models import Chart   # late import: models.py imports this module
        ids = [i.get('chart_id') for i in self.items]
        alive = set(Chart.objects.filter(id__in=ids).values_list('id', flat=True))
        return {
            'id': self.id,
            'title': self.title,
            'items': self.items,
            'refresh_seconds': self.refresh_seconds,
            'chart_count': sum(1 for i in ids if i in alive),
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'is_public': self.is_public,
            'share_token': self.share_token,
        }

    def __str__(self):
        return self.title