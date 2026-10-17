from django.urls import path
from . import views

urlpatterns = [
    path('dashboard', views.dashboard, name='dashboard'),
    path('upload', views.upload_file, name='upload'),
    path('clean-dataset/<int:dataset_id>', views.clean_dataset, name='clean_dataset'),
    path('download-dataset/<int:dataset_id>', views.download_dataset, name='download_dataset'),
    path('get-dataset-columns/<int:dataset_id>', views.get_dataset_columns, name='get_dataset_columns'),
    path('dataset-data/<int:dataset_id>', views.dataset_data, name='dataset_data'),
    path('get-dataset/<int:dataset_id>', views.get_dataset, name='get_dataset'),
    path('delete-dataset/<int:dataset_id>', views.delete_dataset, name='delete_dataset'),
]