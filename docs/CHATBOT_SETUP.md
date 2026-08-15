# ChatBot Setup Instructions

## 🤖 BoxNplay AI Chatbot Feature

> Verified against the current `backend/BookMyBox/chatbot/views.py` as of
> the BoxNplay rebrand — the env var name, setup steps, and model below
> still match the code. Minor corrections from the original version of
> this doc: the chat widget is not Home-page-only (see "Usage" below),
> and two behaviors worth knowing about are called out under "Technical
> Details."

The chatbot has been successfully integrated into your BoxNplay platform! Here's how to complete the setup:

### 📋 Setup Steps

1. **Get Your Gemini API Key:**
   - Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Sign in with your Google account
   - Click "Create API Key"
   - Copy the generated API key

2. **Configure the API Key:**
   - Open the file: `backend/BookMyBox/.env`
   - Replace `your_actual_gemini_api_key_here` with your actual Gemini API key:
     ```
     GEMINI_API_KEY=your_actual_api_key_here
     ```

3. **Restart the Backend Server:**
   - Stop the Django server (Ctrl+C)
   - Start it again: `python manage.py runserver`

### ✨ Features

- **Contextual Responses:** The chatbot understands your BoxNplay platform
- **Project-Specific Knowledge:** Knows about booking, facilities, pricing, etc.
- **Modern UI:** Floating chat icon with smooth animations
- **Conversation Memory:** Maintains context across messages
- **Responsive Design:** Works on all screen sizes

### 🎯 What the Chatbot Can Help With

- **Booking Process:** How to book sports facilities
- **Platform Features:** Favorites, maps, filters, time slots
- **Pricing Information:** Hourly rates, cancellation policies
- **Technical Support:** Navigation and feature explanations
- **General Queries:** About your sports booking platform

### 🔧 Technical Details

- **Frontend:** React component with Framer Motion animations
- **Backend:** Django REST API with Gemini AI integration
- **Location:** Chat icon appears on Home page (bottom-right)
- **Context:** Includes comprehensive platform knowledge

### 🚀 Usage

1. Visit the Home page, the Browse Boxes listing page, or a Box Details
   page — the chat widget (`components/common/Chatbot.jsx`) is mounted on
   all three, not just Home
2. Look for the floating chat icon in the bottom-right corner
3. Click to open the chat window
4. Ask any questions about BoxNplay!

### 🔧 Technical Details (verified against current code)

- **Backend endpoint:** a single `POST /api/chatbot/` (`IsAuthenticated`)
  in `chatbot/views.py`. There's no separate "get conversation history"
  endpoint — the frontend round-trips its own last-5-message history in
  each request (`conversation_history`); the `ChatConversation`/
  `ChatMessage` database rows exist for persistence/audit (viewable via
  Django admin), not for a read-back API.
- **Model:** `gemini-1.5-flash`, via the `google.generativeai` SDK
  (`genai.GenerativeModel('gemini-1.5-flash')`).
- **Rate limiting:** 20 requests per 60 seconds per authenticated user
  (`BookMyBox/rate_limit.py`), returning HTTP 429 with a friendly message
  if exceeded.
- **Error handling is deliberately "soft":** both a missing API key and
  any exception from the Gemini call return **HTTP 200** (not an error
  status) with `status: 'error'` and a friendly fallback message in the
  body — the frontend's axios interceptor treats non-2xx as a thrown
  error, so this is intentional, not a bug, to keep the fallback message
  rendering instead of a generic network-error toast.

### 🔒 Security

- API key is stored securely in environment variables
- .env file should be added to .gitignore
- No sensitive data is logged or stored

Enjoy your new AI-powered customer support! 🎉
