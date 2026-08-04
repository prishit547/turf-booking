const SIZES = {
    sm: 'w-5 h-5 border-2',
    md: 'w-8 h-8 border-[3px]',
    lg: 'w-12 h-12 border-4',
};

/** Canonical spinner. */
export function Loader({ size = 'md', text, className = '' }) {
    return (
        <div className={`flex flex-col items-center justify-center gap-3 ${className}`}>
            <div className={`${SIZES[size]} border-primary/25 border-t-primary rounded-full animate-spin`} />
            {text && <p className="text-sm text-muted-foreground">{text}</p>}
        </div>
    );
}
