from django import forms
from django.contrib.auth.forms import AuthenticationForm, PasswordChangeForm, UserCreationForm

from .models import User

class StyledFormMixin:
    """Adds the CSS classes your templates expect. Flask passed them in the template."""
    labels = {}
    placeholders = {}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for name, field in self.fields.items():
            is_checkbox = isinstance(field.widget, forms.CheckboxInput)
            field.widget.attrs['class'] = 'form-checkbox' if is_checkbox else 'form-control'
            if name in self.placeholders:
                field.widget.attrs['placeholder'] = self.placeholders[name]

    def full_clean(self):
        super().full_clean()
        for name in (self._errors or {}):
            if name in self.fields:
                self.fields[name].widget.attrs['class'] += ' error'

class LoginForm(StyledFormMixin,AuthenticationForm):
    remember_me = forms.BooleanField(required=False, label='Remember Me')
    placeholders = {'username': 'yourusername', 'password': '••••••••'}


class SignupForm(StyledFormMixin, UserCreationForm):
    labels = {'email': 'Email', 'full_name': 'Full Name',
              'password1': 'Password', 'password2': 'Confirm Password'}
    placeholders = {'full_name': 'Your full name (optional)'}
    class Meta(UserCreationForm.Meta):
        model = User
        fields = ('username', 'email', 'full_name')

    def clean_username(self):
        username = self.cleaned_data['username']
        if not 3 <= len(username) <= 20:
            raise forms.ValidationError('Username must be between 3 and 20 characters')
        if User.objects.filter(username__iexact=username).exists():
            raise forms.ValidationError('Username already taken. Please choose a different one.')
        return username

    def clean_email(self):
        email = self.cleaned_data['email'].strip()
        if User.objects.filter(email__iexact=email).exists():
            raise forms.ValidationError('Email already registered. Please use a different email address.')
        return email


class ProfileForm(forms.ModelForm):
    labels = {'email': 'Email', 'full_name': 'Full Name'}
    username = forms.CharField(disabled=True, required=False)  # shown, not editable
    
    class Meta:
        model = User
        fields = ('username', 'email', 'full_name')
        
    def clean_email(self):
        email = self.cleaned_data['email'].strip()
        if User.objects.filter(email__iexact=email).exclude(pk=self.instance.pk).exists():
            raise forms.ValidationError('Email already registered. Please use a different email address.')
        return email

class ChangePasswordForm(StyledFormMixin, PasswordChangeForm):
    labels = {'old_password': 'Current Password',
              'new_password1': 'New Password',
              'new_password2': 'Confirm New Password'}