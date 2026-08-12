// NotificationContext.jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, useAuth } from '../api.jsx';

const NotificationContext = createContext();

// Matches the 30s cadence already used elsewhere in this app for
// low-stakes background polling (BoxDetails.jsx's booked_slots refresh).
const UNREAD_POLL_INTERVAL_MS = 30000;

export const NotificationProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await api.get('/user/notifications/unread-count/');
      setUnreadCount(res.data.unread_count);
    } catch {
      // Silent — this is background polling, not a user-initiated action.
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/user/notifications/');
      setNotifications(res.data.results || []);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const markRead = useCallback(async (id) => {
    try {
      await api.post(`/user/notifications/${id}/read/`);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // ignore — the bell will resync on its next poll regardless
    }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await api.post('/user/notifications/mark-all-read/');
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setUnreadCount(0);
      setNotifications([]);
      return undefined;
    }
    fetchUnreadCount();
    const intervalId = setInterval(fetchUnreadCount, UNREAD_POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [isAuthenticated, fetchUnreadCount]);

  const value = { unreadCount, notifications, loading, fetchNotifications, markRead, markAllRead };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
