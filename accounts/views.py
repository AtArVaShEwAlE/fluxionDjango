from django.contrib import messages
from django.contrib.auth import logout
from django.contrib.auth.decorators import login_required
from django.contrib.auth.views import LoginView, PasswordChangeView
from django.contrib.messages.views import SuccessMessageMixin
from django.shortcuts import redirect, render
from django.urls import reverse_lazy
from django.utils import timezone

from .forms import ChangePasswordForm, LoginForm, ProfileForm, SignupForm


class FluxionLoginView(LoginView):
    template_name = 'auth/login.html'
    authentication_form = LoginForm
    redirect_authenticated_user = True   # logged-in user visiting /login goes to dashboard

    def form_valid(self, form):
        response = super().form_valid(form)   # logs user in
        if not form.cleaned_data.get('remember_me'):
            self.request.session.set_expiry(0)   # expire on browser close
        messages.success(self.request, 'Welcome back!')
        return response

    def form_invalid(self, form):
        messages.error(self.request, 'Invalid username or password')
        return super().form_invalid(form)


def signup(request):
    if request.user.is_authenticated:
        return redirect('dashboard')

    if request.method == 'POST':
        form = SignupForm(request.POST)
        if form.is_valid():
            form.save()
            messages.success(request, 'Congratulations! Your account has been created.')
            return redirect('login')
    else:
        form = SignupForm()

    return render(request, 'auth/signup.html', {'form': form})
    

def logout_view(request):
    logout(request)
    messages.info(request, 'You have been logged out.')
    return redirect('landing')


@login_required
def profile(request):
    if request.method == 'POST':
        form = ProfileForm(request.POST, instance=request.user)
        if form.is_valid():
            form.save()
            messages.success(request, 'Your profile has been updated.')
            return redirect('profile')
    else:
        form = ProfileForm(instance=request.user)

    days_since_joined = (timezone.now() - request.user.date_joined).days
    recent_activity = [
        {
            'icon': '📁',
            'text': f'Uploaded dataset "{d.original_filename}"',
            'time': d.upload_date.strftime('%B %d, %Y'),
        }
        for d in request.user.datasets.all()[:3]   # newest 3
    ]
    return render(request, 'auth/profile.html', {
        'form': form,
        'days_since_joined': days_since_joined,
        'recent_activity': recent_activity,
    })


class FluxionPasswordChangeView(SuccessMessageMixin, PasswordChangeView):
    template_name = 'auth/change_password.html'
    form_class = ChangePasswordForm
    success_url = reverse_lazy('profile')
    success_message = 'Your password has been changed successfully.'