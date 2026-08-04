import { useRef } from 'react';
import { motion, useSpring } from 'framer-motion';

/**
 * Pointer-following spring-transform CTA button — ported from the reference
 * design's MagneticButton. Reserved for hero/primary booking-confirm CTAs;
 * everyday buttons still use ui/Button.jsx.
 */
export function MagneticButton({ children, className = '', onClick, type = 'button', disabled, ...props }) {
    const ref = useRef(null);
    const x = useSpring(0, { stiffness: 260, damping: 18 });
    const y = useSpring(0, { stiffness: 260, damping: 18 });

    return (
        <motion.button
            ref={ref}
            type={type}
            disabled={disabled}
            onClick={onClick}
            style={{ x, y }}
            whileTap={{ scale: 0.96 }}
            onPointerMove={(e) => {
                const rect = ref.current?.getBoundingClientRect();
                if (!rect) return;
                x.set(((e.clientX - (rect.left + rect.width / 2)) / rect.width) * 14);
                y.set(((e.clientY - (rect.top + rect.height / 2)) / rect.height) * 10);
            }}
            onPointerLeave={() => {
                x.set(0);
                y.set(0);
            }}
            className={[
                'inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3',
                'font-display text-sm font-bold uppercase tracking-wide text-primary-foreground shadow-glow',
                'transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:shadow-none',
                className,
            ].join(' ')}
            {...props}
        >
            {children}
        </motion.button>
    );
}
