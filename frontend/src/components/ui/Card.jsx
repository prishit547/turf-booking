import { useMemo } from 'react';
import { motion } from 'framer-motion';

const VARIANTS = {
    flat: 'bg-transparent',
    outlined: 'bg-card border border-border',
    elevated: 'bg-card border border-border',
};

const PADDING = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
};

/**
 * Canonical card — near-black surface, hairline border, no shadow at rest
 * (shadows barely register against #090A0C). Interactive cards lift and
 * emit a lime glow on hover, matching the reference's VenueCard language.
 */
export function Card({ children, variant = 'elevated', padding = 'md', interactive = false, as, className = '', ...props }) {
    // `as` lets a clickable card render as a real <button> (or a router Link)
    // instead of a div with an onClick, which keyboard/screen-reader users
    // can't reach.
    const MotionComponent = useMemo(() => (as ? motion(as) : motion.div), [as]);

    return (
        <MotionComponent
            className={[
                'rounded-2xl transition-colors duration-200',
                VARIANTS[variant],
                PADDING[padding],
                interactive ? 'cursor-pointer' : '',
                className,
            ].join(' ')}
            whileHover={interactive ? { y: -4, boxShadow: '0 18px 50px -18px rgba(209,251,0,0.55)' } : undefined}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            {...props}
        >
            {children}
        </MotionComponent>
    );
}
