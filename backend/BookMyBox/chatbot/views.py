import logging
import uuid

import google.generativeai as genai
from django.views.decorators.http import require_http_methods
from django.core.cache import cache
from django.conf import settings
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import ChatConversation, ChatMessage

logger = logging.getLogger(__name__)

# Configure Gemini AI using Django settings
GEMINI_API_KEY = getattr(settings, 'GEMINI_API_KEY', None)
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)


# Project context for BookMyBox
PROJECT_CONTEXT = """
You are a helpful AI assistant for BookMyBox, a sports facility booking platform. Here's the key information about our platform:

ABOUT BOOKMYBOX:
- BookMyBox is a comprehensive sports facility booking platform
- Users can book sports boxes/facilities for various sports like cricket, football, badminton, etc.
- Platform serves both facility owners and users who want to book sports facilities

KEY FEATURES:
1. Box Browsing & Booking:
   - Users can browse available sports boxes with filters (location, price, capacity, sport type)
   - Real-time availability checking with time slot booking
   - Interactive map view with radius-based search (5-100km)
   - Grid and list view options for browsing boxes

2. User Management:
   - User registration and authentication
   - User profiles and dashboard
   - Favorites system for saving preferred boxes
   - Booking history and management

3. Owner Dashboard:
   - Facility owners can list their sports boxes
   - Manage bookings, pricing, and availability
   - Upload images and manage amenities
   - View analytics and earnings

4. Payment & Booking:
   - Secure booking system with time slot management
   - Pricing per hour with duration selection
   - Free cancellation up to 2 hours before booking
   - Real-time slot availability updates

5. Location Services:
   - GPS-based location detection
   - Distance calculations using Haversine formula
   - Nearby boxes feature with radius control
   - Interactive maps with custom markers

TECHNICAL DETAILS:
- Frontend: React with modern UI, animations using Framer Motion
- Backend: Django REST API
- Database: SQLite with proper models for users, boxes, bookings
- Maps: OpenStreetMap integration with react-leaflet
- Authentication: JWT-based user authentication

TYPICAL USER WORKFLOWS:
1. Browse boxes → Filter by location/sport → View details → Check availability → Book
2. Register/Login → Browse nearby boxes → Add to favorites → Book preferred slots
3. Owner registration → Add facility → Manage bookings → View earnings

PRICING & POLICIES:
- Hourly booking system
- Prices vary by facility and location
- Free cancellation policy (up to 2 hours before)
- Secure payment processing

When answering user questions:
- Be helpful and specific to BookMyBox features
- Provide step-by-step guidance for booking processes
- Mention relevant features like favorites, map view, time slots
- Always maintain a friendly, professional tone
- If asked about technical issues, suggest contacting support
- For booking questions, explain the real-time availability system
"""


def _get_rate_limit_key(user):
    """Build a cache key for per-user rate limiting."""
    return f"chatbot_ratelimit_user_{user.id}"


def _check_rate_limit(user, limit=20, window=60):
    """Return True if the user is within the rate limit."""
    key = _get_rate_limit_key(user)
    current = cache.get(key, 0)
    if current >= limit:
        return False
    cache.set(key, current + 1, timeout=window)
    return True


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@require_http_methods(["POST"])
def chatbot_response(request):
    if not _check_rate_limit(request.user, limit=20, window=60):
        return Response(
            {'response': "You're sending messages too quickly. Please wait a moment."},
            status=429
        )

    user_message = request.data.get('message', '').strip()
    conversation_history = request.data.get('conversation_history', [])
    session_id = request.data.get('session_id') or str(uuid.uuid4())

    if not user_message:
        return Response({'error': 'Message is required'}, status=400)

    api_key = getattr(settings, 'GEMINI_API_KEY', None)
    if not api_key:
        # 200, not 500: the frontend's axios client treats non-2xx as a
        # thrown error and would never render this friendly fallback message.
        return Response({
            'response': "I'm sorry, the AI service is not properly configured. Please contact the administrator.",
            'status': 'error'
        }, status=200)

    # Get or create conversation
    conversation, created = ChatConversation.objects.get_or_create(
        session_id=session_id,
        defaults={'user': request.user}
    )

    # Save user message
    ChatMessage.objects.create(
        conversation=conversation,
        message_type='user',
        content=user_message
    )

    try:
        model = genai.GenerativeModel('gemini-1.5-flash')

        conversation_context = ""
        for msg in conversation_history[-5:]:
            role = "User" if msg.get('type') == 'user' else "Assistant"
            conversation_context += f"{role}: {msg.get('content', '')}\n"

        prompt = f"""
{PROJECT_CONTEXT}

CONVERSATION HISTORY:
{conversation_context}

Current User Question: {user_message}

Please provide a helpful, accurate response based on the BookMyBox platform context above. Be specific to our features and guide users appropriately. Keep responses concise but informative.
"""

        response = model.generate_content(prompt)
        bot_response = response.text

        ChatMessage.objects.create(
            conversation=conversation,
            message_type='bot',
            content=bot_response
        )

        return Response({
            'response': bot_response,
            'session_id': session_id,
            'status': 'success'
        })

    except Exception:
        logger.exception("Chatbot request failed")
        # 200, not 500: see the note above — the body already communicates
        # the error to the user, and a 500 would prevent axios from showing it.
        return Response({
            'response': "I'm sorry, I'm experiencing some technical difficulties. Please try again later or contact our support team for assistance.",
            'status': 'error'
        }, status=200)
