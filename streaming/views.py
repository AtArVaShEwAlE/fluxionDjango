from django.contrib.auth.decorators import login_required
from django.shortcuts import render


@login_required
def live_data(request):
    return render(request, 'live_data.html', {'datasets': request.user.datasets.all()})