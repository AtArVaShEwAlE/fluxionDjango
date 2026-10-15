from django.conf import settings
from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver

from .services import delete_cache

class Dataset(models.Model):
    """Uploaded file metadata. Raw file lives in UPLOAD_ROOT."""
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                              related_name='datasets')
    filename = models.CharField(max_length=255)            # unique stored name
    original_filename = models.CharField(max_length=255)
    file_size = models.IntegerField()                      # bytes
    rows = models.IntegerField()
    columns = models.IntegerField()
    column_names = models.JSONField(default=list)
    data_types = models.JSONField(default=dict)
    preview_data = models.JSONField(default=list)          # first 10 rows
    column_stats = models.JSONField(default=dict, blank=True)
    upload_date = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-upload_date']

    def to_dict(self):
        return {
            'id': self.id,
            'filename': self.original_filename,
            'file_size': self.file_size,
            'rows': self.rows,
            'columns': self.columns,
            'column_names': self.column_names,
            'data_types': self.data_types,
            'preview': self.preview_data,
            'column_stats': self.column_stats or {},
            'upload_date': self.upload_date.isoformat(),
        }

    def __str__(self):
        return self.original_filename

@receiver(post_delete, sender=Dataset)
def remove_dataset_cache(sender, instance, **kwargs):
    delete_cache(instance)