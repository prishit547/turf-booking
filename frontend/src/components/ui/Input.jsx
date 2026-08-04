import { forwardRef } from 'react';
import { motion } from 'framer-motion';

/**
 * Canonical text input — clean ref forwarding (needed for any future
 * react-hook-form adoption — listed as a dependency but currently unused
 * anywhere in src/).
 */
export const Input = forwardRef(function Input(
    { label, hint, error, leadingIcon, trailingIcon, className = '', id, ...props },
    ref
) {
    const inputId = id || props.name;

    return (
        <div className="space-y-1.5">
            {label && (
                <label htmlFor={inputId} className="block text-sm font-medium text-foreground">
                    {label}
                </label>
            )}
            <div className="relative">
                {leadingIcon && (
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                        {leadingIcon}
                    </div>
                )}
                <input
                    ref={ref}
                    id={inputId}
                    className={[
                        'w-full px-4 py-2.5 rounded-lg bg-elevated text-foreground',
                        'border transition-colors duration-150 outline-none placeholder-muted-foreground',
                        'focus:ring-2 focus:ring-primary/40 focus:border-primary',
                        leadingIcon ? 'pl-10' : '',
                        trailingIcon ? 'pr-10' : '',
                        error ? 'border-danger' : 'border-input',
                        className,
                    ].join(' ')}
                    {...props}
                />
                {trailingIcon && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        {trailingIcon}
                    </div>
                )}
            </div>
            {error ? (
                <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="text-sm text-danger">
                    {error}
                </motion.p>
            ) : hint ? (
                <p className="text-sm text-muted-foreground">{hint}</p>
            ) : null}
        </div>
    );
});
