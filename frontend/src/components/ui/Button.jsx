import { forwardRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { animations } from '../../utils/animations';

const VARIANTS = {
    primary: 'bg-primary hover:bg-primary/90 text-primary-foreground border border-transparent shadow-glow',
    secondary: 'bg-turf hover:bg-turf/90 text-turf-foreground border border-transparent',
    outline: 'bg-transparent hover:bg-elevated text-foreground border border-border',
    ghost: 'bg-transparent hover:bg-primary/10 text-primary border border-transparent',
    danger: 'bg-danger hover:bg-danger/90 text-white border border-transparent',
};

const SIZES = {
    sm: { button: 'px-3.5 py-1.5 text-sm', gap: 'gap-1.5' },
    md: { button: 'px-5 py-2.5 text-base', gap: 'gap-2' },
    lg: { button: 'px-7 py-3.5 text-lg', gap: 'gap-2.5' },
};

/**
 * Canonical button — pill-shaped, one confident lime primary. Variants map
 * 1:1 to semantic intent, no gradients.
 */
export const Button = forwardRef(function Button(
    { children, variant = 'primary', size = 'md', as, icon, iconRight, loading = false, fullWidth = false, disabled, className = '', ...props },
    ref
) {
    const MotionComponent = useMemo(() => motion(as || 'button'), [as]);
    const motionProps = variant === 'primary' || variant === 'danger' ? animations.buttonPrimary : animations.buttonSecondary;

    return (
        <MotionComponent
            ref={ref}
            className={[
                'relative inline-flex items-center justify-center font-medium rounded-full transition-colors duration-200',
                'disabled:opacity-50 disabled:pointer-events-none',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                VARIANTS[variant],
                SIZES[size].button,
                fullWidth ? 'w-full' : '',
                className,
            ].join(' ')}
            disabled={disabled || loading}
            {...motionProps}
            {...props}
        >
            {loading && (
                <span className="absolute inset-0 flex items-center justify-center bg-inherit rounded-full">
                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                </span>
            )}
            <span className={`inline-flex items-center ${SIZES[size].gap} ${loading ? 'opacity-0' : 'opacity-100'}`}>
                {icon}
                {children}
                {iconRight}
            </span>
        </MotionComponent>
    );
});
