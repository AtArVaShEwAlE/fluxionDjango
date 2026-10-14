from django.shortcuts import render


def page_not_found(request, exception=None):
    return render(request, 'error.html', {
        'error': 'Page not found',
        'message': 'The page you are looking for does not exist or was moved.',
    }, status=404)


def server_error(request):
    return render(request, 'error.html', {
        'error': 'Server error',
        'message': 'Something broke on our side. Try again in a bit.',
    }, status=500)