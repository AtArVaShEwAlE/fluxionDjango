from django.conf import settings
from django.http import Http404, JsonResponse
from django.urls import get_resolver
from django.shortcuts import render
from django.views.decorators.http import require_http_methods

from .forms import ContactForm


def landing(request):
    return render(request, 'landing.html')


@require_http_methods(['GET', 'POST'])
def contact(request):
    if request.method == 'POST':
        form = ContactForm(request.POST)
        if form.is_valid():
            form.save()
            return JsonResponse({'success': True})
        errors = form.errors.get_json_data()
        first = next(iter(errors.values()))[0]['message']
        return JsonResponse({'success': False, 'error': first,
                             'errors': {k: [e['message'] for e in v] for k, v in errors.items()}},
                            status=400)
    return render(request, 'contact.html')


def about(request):
    return render(request, 'about.html')


def faq(request):
    return render(request, 'faq.html')

def _walk_patterns(patterns, prefix=''):
    for p in patterns:
        if hasattr(p, 'url_patterns'):
            yield from _walk_patterns(p.url_patterns, prefix + str(p.pattern))
        else:
            yield prefix + str(p.pattern), p.name


def debug_routes(request):
    if not (settings.DEBUG or request.user.is_staff):
        raise Http404
    routes = [{'path': '/' + path, 'name': name}
              for path, name in _walk_patterns(get_resolver().url_patterns)]
    return JsonResponse({'count': len(routes), 'routes': routes})