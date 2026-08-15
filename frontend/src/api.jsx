import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

// Backend API base URL (configure via VITE_API_BASE_URL in your .env file)
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

// Base URL for media files (defaults to API_BASE_URL without the /api suffix)
const rawMediaBase = import.meta.env.VITE_MEDIA_BASE_URL || API_BASE_URL.replace(/\/api\/?$/, '');
export const MEDIA_BASE_URL = rawMediaBase.replace(/\/$/, ''); 

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// "Remember me" (Login.jsx) backs onto which Storage tokens live in, not a
// decorative checkbox: checked (the default, matching prior behavior)
// keeps using localStorage, which is what the 90-day refresh-token sliding
// session relies on to survive browser restarts; unchecked switches to
// sessionStorage, which the browser clears when the tab/window closes, so
// an unattended shared/public computer doesn't stay logged in indefinitely.
// The flag itself is a tiny always-localStorage marker so the module-level
// request interceptor below (no React state available at this scope) can
// synchronously resolve the right backing store on every single request.
const REMEMBER_FLAG_KEY = 'bmb_remember';

function authStore() {
  return localStorage.getItem(REMEMBER_FLAG_KEY) === '0' ? sessionStorage : localStorage;
}

function getAuthItem(key) {
  return authStore().getItem(key);
}

function setAuthItem(key, value) {
  authStore().setItem(key, value);
}

function clearAuthItems() {
  // Clear both stores unconditionally — a stale token can only be left
  // behind in the store the current flag *doesn't* point at if we only
  // clear the resolved one.
  for (const store of [localStorage, sessionStorage]) {
    store.removeItem('accessToken');
    store.removeItem('refreshToken');
    store.removeItem('user');
  }
  localStorage.removeItem(REMEMBER_FLAG_KEY);
}

// Registered once at module load (not inside a component effect) so it's
// guaranteed to be attached before any request ever goes out — a component
// that fires an authenticated call on mount (e.g. NotificationProvider)
// mounts as a child of AuthProvider, and child effects run before parent
// effects, so registering this inside AuthProvider's own useEffect let the
// very first request on a fresh page load race ahead of it and go out with
// no Authorization header.
api.interceptors.request.use(
  (config) => {
    const token = getAuthItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Auth Context
const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const storedUser = getAuthItem('user');
      return storedUser ? JSON.parse(storedUser) : null;
    } catch (error) {
      console.error("Failed to parse user from storage:", error);
      return null;
    }
  });
  const [accessToken, setAccessToken] = useState(getAuthItem('accessToken'));
  const [loading, setLoading] = useState(true);
  const [generalError, setGeneralError] = useState(null);

  // Helper function to clear auth state
  const clearAuth = useCallback(() => {
    setUser(null);
    setAccessToken(null);
    clearAuthItems();
    setGeneralError(null);
  }, []);

  // Logout function
  const logout = useCallback(() => {
    clearAuth();
  }, [clearAuth]);

  // Hydrate auth state (tokens + user) from data already obtained elsewhere
  // (e.g. Google login, onboarding completion) so AuthContext's in-memory
  // state stays in sync with localStorage without requiring a page reload.
  const hydrateAuth = useCallback((tokens, userData) => {
    if (tokens?.access) {
      setAuthItem('accessToken', tokens.access);
      setAccessToken(tokens.access);
    }
    if (tokens?.refresh) {
      setAuthItem('refreshToken', tokens.refresh);
    }
    if (userData) {
      setAuthItem('user', JSON.stringify(userData));
      setUser(userData);
    }
  }, []);

  // Function to refresh token
  const refreshAuthToken = useCallback(async () => {
    const currentRefreshToken = getAuthItem('refreshToken');
    if (!currentRefreshToken) {
      console.warn("No refresh token available. Cannot refresh.");
      logout();
      return false;
    }
    try {
      const response = await axios.post(`${API_BASE_URL}/user/token/refresh/`, { refresh: currentRefreshToken });
      const newAccessToken = response.data.access;
      setAuthItem('accessToken', newAccessToken);
      setAccessToken(newAccessToken);
      return true;
    } catch (error) {
      console.error('Failed to refresh token:', error.response?.data || error.message);
      if (error.response?.status === 401) {
        setGeneralError("Session expired. Please log in again.");
      } else {
        setGeneralError("Failed to refresh session.");
      }
      logout();
      return false;
    }
  }, [logout]);

  // --- FIX 1: MODIFIED fetchUser TO RETURN DATA ---
  // This function now returns the fetched user data, making it more versatile.
  const fetchUser = useCallback(async () => {
    const token = getAuthItem('accessToken');
    if (!token) {
      setUser(null);
      return null; // <-- RETURN NULL on failure
    }
    try {
      const response = await api.get('/user_profile/my-profile/');  // FIXED: Changed to correct endpoint
      const fetchedUserData = response.data;  // FIXED: No need for .user since CompleteProfileSerializer returns data directly

      setUser(fetchedUserData);
      setAuthItem('user', JSON.stringify(fetchedUserData));
      
      return fetchedUserData; // <-- RETURN THE NEW USER DATA

    } catch (error) {
      console.error('Failed to fetch user data with current token:', error.response?.data || error.message);
      if (error.response?.status === 401) {
        console.warn("Access token invalid. Attempting refresh...");
        const refreshed = await refreshAuthToken();
        if (refreshed) {
          try {
            const retryResponse = await api.get('/user_profile/my-profile/');  // FIXED: Changed to correct endpoint
            const retriedUserData = retryResponse.data;  // FIXED: No need for .user

            setUser(retriedUserData);
            setAuthItem('user', JSON.stringify(retriedUserData));

            return retriedUserData; // <-- RETURN THE NEW USER DATA ON RETRY
          } catch (retryError) {
            console.error('Failed to fetch user after token refresh:', retryError);
            logout();
          }
        }
      } else {
        setGeneralError("Failed to load user data.");
      }
      return null; // <-- RETURN NULL on any failure
    }
  }, [refreshAuthToken, logout]);

  // Response interceptor (refresh-on-401 retry) — this one does need
  // component state (refreshAuthToken), so it stays registered here. The
  // request interceptor that attaches the Authorization header is
  // registered once at module scope above, not here — see that comment.
  useEffect(() => {
    const responseInterceptor = api.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        if (
          error.response?.status === 401 &&
          !originalRequest._retry &&
          !originalRequest.url.includes('/token/refresh/')
        ) {
          originalRequest._retry = true;
          const refreshed = await refreshAuthToken();
          if (refreshed) {
            return api(originalRequest);
          }
        }
        return Promise.reject(error);
      }
    );

    return () => {
      api.interceptors.response.eject(responseInterceptor);
    };
  }, [refreshAuthToken, logout]);

  // Login Function. `remember` (Login.jsx's checkbox, default true so every
  // other caller — e.g. InviteClaim's post-login resume — keeps today's
  // always-persistent behavior) picks which Storage the tokens land in;
  // must be set before the writes below so authStore() resolves correctly.
  const login = async (credentials, remember = true) => {
    setGeneralError(null);
    localStorage.setItem(REMEMBER_FLAG_KEY, remember ? '1' : '0');
    try {
      const response = await axios.post(`${API_BASE_URL}/user/login/`, credentials);
      const { access, refresh, user: userData } = response.data;

      setAuthItem('accessToken', access);
      setAuthItem('refreshToken', refresh);
      setAuthItem('user', JSON.stringify(userData));

      setAccessToken(access);
      setUser(userData);
      
      return { success: true, user: userData };
    } catch (error) {
      console.error('Login error:', error.response?.data || error.message);
      const errorData = error.response?.data;
      let errorMessage = 'An unexpected error occurred during login.';
      if (error.response?.status === 429) {
        // Backend's ScopedRateThrottle ('login' scope) returns a technical
        // DRF message here ("Request was throttled. Expected available in
        // N seconds.") — swap it for something a user can actually act on.
        errorMessage = 'Too many login attempts. Please wait a moment and try again.';
      } else if (errorData?.detail) {
        errorMessage = errorData.detail;
      } else if (errorData?.non_field_errors) {
        errorMessage = errorData.non_field_errors[0];
      }
      setGeneralError(errorMessage);
      return { success: false, error: errorMessage, errors: errorData };
    }
  };

  // Signup Function
  const signup = async (userData) => {
    setGeneralError(null);
    try {
      const response = await api.post('/user/register/', userData); 
      const { user: registeredUser, tokens } = response.data;
      const { access, refresh } = tokens;

      localStorage.setItem(REMEMBER_FLAG_KEY, '1');
      setAuthItem('accessToken', access);
      setAuthItem('refreshToken', refresh);
      setAuthItem('user', JSON.stringify(registeredUser));

      setAccessToken(access);
      setUser(registeredUser);
      
      return { success: true, user: registeredUser };
    } catch (err) {
      console.error('Signup error:', err.response?.data || err.message);
      const errorData = err.response?.data;
      let errorMessage = 'An unexpected error occurred during signup.';
      if (err.response?.status === 429) {
        errorMessage = 'Too many signup attempts. Please wait a moment and try again.';
        setGeneralError(errorMessage);
        return { success: false, error: errorMessage, errors: errorData };
      }
      if (errorData) {
        if (errorData.detail) errorMessage = errorData.detail;
        else if (errorData.email) errorMessage = "An account with this email already exists.";
        else if (errorData.non_field_errors) errorMessage = errorData.non_field_errors.join(', ');

        setGeneralError(errorMessage);
        return { success: false, error: errorMessage, errors: errorData };
      }
      setGeneralError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  // --- FIX 2: MODIFIED fetchUserProfile TO AVOID STALE STATE ---
  // This function now returns the fresh data it gets directly from fetchUser.
  const fetchUserProfile = useCallback(async () => {
    setGeneralError(null);
    const freshUserData = await fetchUser(); // <-- CAPTURE the fresh data
    
    if (freshUserData) {
      return { success: true, data: freshUserData }; // <-- RETURN the fresh data
    } else {
      return { success: false, error: generalError || 'Failed to fetch profile.' };
    }
  }, [fetchUser, generalError]); // <-- REMOVED 'user' dependency

  // Update Profile Function. `profileData` is normally a plain object (JSON
  // field edits), but the avatar upload (Profile.jsx) passes a FormData
  // instead — the `api` instance hardcodes a default JSON Content-Type
  // header, which (unlike axios's own FormData auto-detection) is NOT
  // overridden automatically, so a multipart upload through it would
  // silently go out as "application/json" with no boundary and 400 on the
  // backend ("submitted data was not a file"). Clearing the header for
  // this one request lets the browser set the correct multipart boundary.
  const updateProfile = async (profileData) => {
    setGeneralError(null);
    try {
      const isFormData = profileData instanceof FormData;
      const response = await api.patch('/user_profile/my-profile/update/', profileData, isFormData ? {
        headers: { 'Content-Type': undefined },
      } : undefined);
      const updatedPartialUserData = response.data;  // FIXED: CompleteProfileSerializer returns data directly

      // Merge with existing user data to prevent data loss on partial updates
      const currentUser = JSON.parse(getAuthItem('user')) || {};
      const mergedUser = { ...currentUser, ...updatedPartialUserData };

      setUser(mergedUser);
      setAuthItem('user', JSON.stringify(mergedUser));

      return { success: true, data: mergedUser };
    } catch (err) {
      console.error('Failed to update user profile:', err.response?.data || err.message);
      const errorData = err.response?.data;
      let errorMessage = 'An unexpected error occurred.';

      if (errorData) {
        if (errorData.detail) errorMessage = errorData.detail;
        else errorMessage = 'Validation error. Please check your inputs.';
        
        setGeneralError(errorMessage);
        return { success: false, error: errorMessage, errors: errorData };
      }
      
      setGeneralError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  // Initial load to check for token and fetch user
  useEffect(() => {
    const initializeAuth = async () => {
      setLoading(true); 
      await fetchUser(); 
      setLoading(false); 
    };
    initializeAuth();
  }, [fetchUser]);

  const authContextValue = {
    user,
    loading,
    generalError,
    login,
    signup,
    logout,
    hydrateAuth,
    fetchUserProfile,
    updateProfile,
    isAuthenticated: !!user, 
    accessToken,
  };

  return (
    <AuthContext.Provider value={authContextValue}>
      {children}
    </AuthContext.Provider>
  );
};