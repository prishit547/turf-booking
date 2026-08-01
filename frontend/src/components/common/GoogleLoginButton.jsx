import { GoogleLogin } from '@react-oauth/google';
import { useNavigate } from 'react-router-dom';
import { api, useAuth } from '../../api';

const GoogleLoginButton = ({ setLoading, setErrors }) => {
  const navigate = useNavigate();
  const { hydrateAuth } = useAuth();

  // Check if Google OAuth is configured
  const isGoogleConfigured = import.meta.env.VITE_GOOGLE_CLIENT_ID &&
                           import.meta.env.VITE_GOOGLE_CLIENT_ID !== "your_google_client_id_here";

  const handleGoogleSuccess = async (credentialResponse) => {
    setLoading(true);
    setErrors({});

    try {
      const response = await api.post('/user/google-auth/', {
        credential: credentialResponse.credential,
      });

      const result = response.data;

      if (result.success) {
        // Store tokens and user data, and sync AuthContext's in-memory state
        // so dashboards see the logged-in user immediately (no reload needed).
        hydrateAuth(result.tokens, result.user);

        if (result.needs_onboarding) {
          navigate('/onboarding', {
            state: {
              user: result.user,
              isNewUser: result.is_new_user
            }
          });
        } else {
          const userRole = result.user?.role;
          switch (userRole) {
            case 'admin':
              navigate('/admin-dashboard');
              break;
            case 'owner':
              navigate('/owner-dashboard');
              break;
            default:
              navigate('/user-dashboard');
          }
        }
      } else {
        setErrors({ general: result.errors?.detail || 'Google login failed' });
      }
    } catch (error) {
      console.error('Google login error:', error);
      setErrors({ general: error.response?.data?.errors?.credential || 'Failed to process Google login' });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleFailure = () => {
    setErrors({ general: 'Google login failed. Please try again.' });
  };

  // If Google OAuth is not configured, show a setup message
  if (!isGoogleConfigured) {
    return (
      <div className="w-full flex justify-center items-center py-3 px-4 border border-gray-300 rounded-lg text-sm font-medium text-gray-500 bg-gray-50">
        <svg className="w-5 h-5 mr-2 text-gray-400" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Google OAuth Setup Required
      </div>
    );
  }

  return (
    <GoogleLogin
      onSuccess={handleGoogleSuccess}
      onError={handleGoogleFailure}
      theme="outline"
      size="large"
      width="100%"
      text="continue_with"
    />
  );
};

export default GoogleLoginButton;
