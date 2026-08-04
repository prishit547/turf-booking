import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

const SIZES = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
};

/**
 * Canonical modal. Flat scrim, no blur-on-backdrop. Adds a basic
 * initial-focus + Escape-to-close.
 */
export function Modal({ isOpen, onClose, title, children, footer, size = 'md', closeOnOverlayClick = true }) {
    const panelRef = useRef(null);

    useEffect(() => {
        if (!isOpen) return undefined;
        panelRef.current?.focus();
        const onKeyDown = (e) => {
            if (e.key === 'Escape') onClose?.();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [isOpen, onClose]);

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="flex items-center justify-center min-h-screen px-4 py-8">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="fixed inset-0 bg-background/80"
                            onClick={closeOnOverlayClick ? onClose : undefined}
                        />
                        <motion.div
                            ref={panelRef}
                            tabIndex={-1}
                            initial={{ opacity: 0, scale: 0.97, y: 12 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.97, y: 12 }}
                            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                            className={`relative w-full ${SIZES[size]} bg-card border border-border rounded-2xl shadow-lift outline-none`}
                        >
                            {title && (
                                <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
                                    <h2 className="text-lg font-display font-semibold text-foreground">{title}</h2>
                                    <button
                                        onClick={onClose}
                                        aria-label="Close"
                                        className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-elevated rounded-lg transition-colors"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                            )}
                            <div className="px-6 py-5 text-foreground">{children}</div>
                            {footer && (
                                <div className="px-6 pb-6 pt-2 flex justify-end gap-3">{footer}</div>
                            )}
                        </motion.div>
                    </div>
                </div>
            )}
        </AnimatePresence>
    );
}
