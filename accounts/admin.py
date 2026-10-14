from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User


@admin.register(User)
class FluxionUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (('Extra', {'fields': ('full_name',)}),)
    add_fieldsets = UserAdmin.add_fieldsets + (('Extra', {'fields': ('email', 'full_name')}),)