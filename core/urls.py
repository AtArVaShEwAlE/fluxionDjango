from django.urls import path
from . import views

urlpatterns = [
    path('', views.landing, name='landing'),
    path('about', views.about, name='about'),
    path('contact', views.contact, name='contact'),
    path('faq', views.faq, name='faq'),
    path('debug-routes', views.debug_routes, name='debug_routes'),
]