from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from boxes.models import Box

STATIC_PAGES = [
    {'path': '', 'changefreq': 'daily', 'priority': '1.0'},
    {'path': 'boxes', 'changefreq': 'hourly', 'priority': '0.9'},
    {'path': 'about', 'changefreq': 'monthly', 'priority': '0.7'},
    {'path': 'contact', 'changefreq': 'monthly', 'priority': '0.7'},
    {'path': 'terms', 'changefreq': 'yearly', 'priority': '0.5'},
    {'path': 'privacy', 'changefreq': 'yearly', 'priority': '0.5'},
    {'path': 'cancellation-policy', 'changefreq': 'yearly', 'priority': '0.5'},
    {'path': 'login', 'changefreq': 'monthly', 'priority': '0.6'},
    {'path': 'signup', 'changefreq': 'monthly', 'priority': '0.6'},
]


@csrf_exempt
@require_http_methods(["GET"])
def sitemap_xml(request):
    """Dynamic sitemap generator for BoxNplay (https://boxnplay.com).
    Outputs valid XML containing all public static pages and live approved boxes."""
    base_url = getattr(settings, 'FRONTEND_URL', 'https://boxnplay.com').rstrip('/')

    xml_lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
        '        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
        '        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9 http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">',
    ]

    for item in STATIC_PAGES:
        loc = f"{base_url}/{item['path']}".rstrip('/') + ('/' if not item['path'] else '')
        xml_lines.append('  <url>')
        xml_lines.append(f'    <loc>{loc}</loc>')
        xml_lines.append(f"    <changefreq>{item['changefreq']}</changefreq>")
        xml_lines.append(f"    <priority>{item['priority']}</priority>")
        xml_lines.append('  </url>')

    approved_boxes = Box.objects.filter(status='approved').only('id', 'updated_at', 'created_at').order_by('-updated_at')
    for box in approved_boxes:
        box_loc = f"{base_url}/boxes/{box.id}"
        lastmod = (box.updated_at or box.created_at).strftime('%Y-%m-%d')
        xml_lines.append('  <url>')
        xml_lines.append(f'    <loc>{box_loc}</loc>')
        xml_lines.append(f'    <lastmod>{lastmod}</lastmod>')
        xml_lines.append('    <changefreq>daily</changefreq>')
        xml_lines.append('    <priority>0.8</priority>')
        xml_lines.append('  </url>')

    xml_lines.append('</urlset>')
    return HttpResponse('\n'.join(xml_lines), content_type='application/xml')


@csrf_exempt
@require_http_methods(["GET"])
def robots_txt(request):
    """Serves production robots.txt for search engines."""
    sitemap_url = f"{getattr(settings, 'FRONTEND_URL', 'https://boxnplay.com').rstrip('/')}/sitemap.xml"
    content = f"""User-agent: *
Allow: /
Allow: /boxes
Allow: /boxes/*
Allow: /turfs
Allow: /explore
Allow: /about
Allow: /contact
Allow: /terms
Allow: /privacy
Allow: /cancellation-policy
Allow: /login
Allow: /signup

Disallow: /admin-dashboard/
Disallow: /owner-dashboard/
Disallow: /user-dashboard/
Disallow: /profile
Disallow: /checkout
Disallow: /booking/
Disallow: /reset-password/
Disallow: /invites/
Disallow: /onboarding
Disallow: /api/

Sitemap: {sitemap_url}
"""
    return HttpResponse(content, content_type='text/plain')


@csrf_exempt
@require_http_methods(["GET"])
def health_check(request):
    """
    Simple health check endpoint to verify API is working
    """
    return JsonResponse({
        'status': 'healthy',
        'message': 'BoxNplay API is running successfully',
        'endpoints': {
            'user': '/api/user/',
            'boxes': '/api/boxes/',
            'bookings': '/api/bookings/',
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
        'name': 'BoxNplay API',
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
            }
        }
    })
