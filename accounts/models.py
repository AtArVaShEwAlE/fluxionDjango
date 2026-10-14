from django.contrib.auth.models import AbstractUser
from django.db import models

class User(AbstractUser):
    email = models.EmailField('email address',unique=True)
    full_name = models.CharField(max_length=100,blank=True)