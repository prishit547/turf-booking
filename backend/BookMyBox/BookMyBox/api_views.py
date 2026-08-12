from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from boxes.models import Box

STATIC_SITEMAP_PATHS = ['', 'boxes', 'about', 'contact']


@csrf_exempt
@require_http_methods(["GET"])
def sitemap_xml(request):
    """A minimal, dynamically-generated sitemap — static routes plus every
    currently-approved box's detail page. A static frontend/public file
    can't reflect live box ids, so this has to be backend-generated (see
    frontend/public/robots.txt's Sitemap: line, which points here)."""
    base_url = settings.FRONTEND_URL.rstrip('/')
    urls = [f'{base_url}/{path}' for path in STATIC_SITEMAP_PATHS]
    urls += [f'{base_url}/boxes/{box_id}' for box_id in Box.objects.filter(status='approved').values_list('id', flat=True)]

    xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    xml += [f'<url><loc>{url}</loc></url>' for url in urls]
    xml.append('</urlset>')
    return HttpResponse('\n'.join(xml), content_type='application/xml')


@csrf_exempt
@require_http_methods(["GET"])
def health_check(request):
    """
    Simple health check endpoint to verify API is working
    """
    return JsonResponse({
        'status': 'healthy',
        'message': 'BookMyBox API is running successfully',
        'endpoints': {
            'user': '/api/user/',
            'boxes': '/api/boxes/',
            'bookings': '/api/bookings/',
            'chatbot': '/api/chatbot/',
            'dashboard': '/api/dashboard/',
            'owner_dashboard': '/api/owner_dashboard/'
        }
    })

@csrf_exempt
@require_http_methods(["GET"])
def api_info(request):
    """
    API information endpoint
    """
    return JsonResponse({
        'name': 'BookMyBox API',
        'version': '1.0.0',
        'description': 'Sports facility booking platform API',
        'documentation': 'Available endpoints listed below',
        'endpoints': {
            'Authentication': {
                'login': 'POST /api/user/login/',
                'register': 'POST /api/user/register/',
                'profile': 'GET /api/user_profile/'
            },
            'Boxes': {
                'list': 'GET /api/boxes/',
                'detail': 'GET /api/boxes/{id}/',
                'public_detail': 'GET /api/boxes/public/{id}/'
            },
            'Bookings': {
                'create': 'POST /api/bookings/',
                'list': 'GET /api/bookings/',
                'booked_slots': 'GET /api/bookings/booked_slots/'
            },
            'Dashboard': {
                'user': 'GET /api/dashboard/',
                'favorites': 'GET /api/dashboard/favorites/',
                'owner': 'GET /api/owner_dashboard/'
            },
            'AI Assistant': {
                'chat': 'POST /api/chatbot/'
            }
        }
    })
