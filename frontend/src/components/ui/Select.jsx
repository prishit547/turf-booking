import { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Canonical select — same field-wrapper shape as Input.jsx (label/hint/error)
 * so the two compose cleanly in forms/filter bars.
 */
export const Select = forwardRef(function Select(
    { label, hint, error, className = '', id, children, ...props },
    ref
) {
    const selectId = id || props.name;

    return (
        <div className="space-y-1.5">
            {label && (
                <label htmlFor={selectId} className="block text-sm font-medium text-foreground">
                    {label}
                </label>
            )}
            <div className="relative">
                <select
                    ref={ref}
                    id={selectId}
                    className={[
                        'w-full appearance-none px-4 py-2.5 pr-10 rounded-lg bg-elevated text-foreground',
                        'border transition-colors duration-150 outline-none',
                        'focus:ring-2 focus:ring-primary/40 focus:border-primary',
                        error ? 'border-danger' : 'border-input',
                        className,
                    ].join(' ')}
                    {...props}
                >
                    {children}
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
            {error ? (
                <p className="text-sm text-danger">{error}</p>
            ) : hint ? (
                <p className="text-sm text-muted-foreground">{hint}</p>
            ) : null}
        </div>
    );
});
