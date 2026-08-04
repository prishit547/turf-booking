const TONES = {
    primary: { soft: 'bg-primary/15 text-primary', solid: 'bg-primary text-primary-foreground', outline: 'border border-primary text-primary' },
    secondary: { soft: 'bg-turf/15 text-turf', solid: 'bg-turf text-turf-foreground', outline: 'border border-turf text-turf' },
    success: { soft: 'bg-success/15 text-success', solid: 'bg-success text-white', outline: 'border border-success text-success' },
    warning: { soft: 'bg-warning/15 text-warning', solid: 'bg-warning text-white', outline: 'border border-warning text-warning' },
    danger: { soft: 'bg-danger/15 text-danger', solid: 'bg-danger text-white', outline: 'border border-danger text-danger' },
    neutral: { soft: 'bg-elevated text-muted-foreground', solid: 'bg-muted-foreground text-background', outline: 'border border-border text-foreground' },
};

const SIZES = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
};

/**
 * Canonical badge — `soft` (the default) is a tinted background+text pair,
 * no gradients ever. `pulse` is opt-in only, reserved for genuinely live
 * states (e.g. "2 slots left"), not a default animation on every badge.
 */
export function Badge({ children, variant = 'soft', tone = 'neutral', size = 'sm', pulse = false, className = '' }) {
    return (
        <span
            className={[
                'inline-flex items-center gap-1 font-medium rounded-full',
                TONES[tone][variant],
                SIZES[size],
                pulse ? 'animate-pulse' : '',
                className,
            ].join(' ')}
        >
            {children}
        </span>
    );
}
