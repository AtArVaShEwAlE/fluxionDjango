from django.urls import path
from . import views

urlpatterns = [
    path('login', views.FluxionLoginView.as_view(), name='login'),
    path('signup', views.signup, name='signup'),
    path('logout', views.logout_view, name='logout'),
    path('profile', views.profile, name='profile'),
    path('change-password', views.FluxionPasswordChangeView.as_view(), name='change_password'),
]