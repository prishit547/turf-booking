// NotificationBell.jsx
import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNotifications } from '../../context/NotificationContext';

function formatRelativeTime(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const NotificationBell = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { unreadCount, notifications, loading, fetchNotifications, markRead, markAllRead } = useNotifications();
  const containerRef = useRef(null);

  useEffect(() => {
    if (isOpen) fetchNotifications();
  }, [isOpen, fetchNotifications]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleNotificationClick = (notification) => {
    if (!notification.is_read) markRead(notification.id);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="relative inline-flex items-center justify-center w-9 h-9 rounded-full border border-border transition hover:border-primary/60"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-2xl border border-border bg-card shadow-lift z-50"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="font-medium text-foreground">Notifications</span>
              {unreadCount > 0 && (
                <button type="button" onClick={markAllRead} className="text-xs text-primary hover:underline">
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {loading ? (
                <p className="text-center py-8 text-sm text-muted-foreground">Loading...</p>
              ) : notifications.length === 0 ? (
                <p className="text-center py-8 text-sm text-muted-foreground">No notifications yet</p>
              ) : (
                notifications.map((n) => {
                  const body = (
                    <div className={`px-4 py-3 border-b border-border last:border-0 transition-colors hover:bg-elevated ${!n.is_read ? 'bg-primary/5' : ''}`}>
                      <div className="flex items-start gap-2">
                        {!n.is_read && <span className="mt-1.5 w-2 h-2 rounded-full bg-primary shrink-0" />}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{n.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                          <p className="text-[11px] text-muted-foreground mt-1">{formatRelativeTime(n.created_at)}</p>
                        </div>
                      </div>
                    </div>
                  );
                  return n.link ? (
                    <Link key={n.id} to={n.link} onClick={() => handleNotificationClick(n)} className="block">
                      {body}
                    </Link>
                  ) : (
                    <button key={n.id} type="button" className="block w-full text-left" onClick={() => handleNotificationClick(n)}>
                      {body}
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationBell;
