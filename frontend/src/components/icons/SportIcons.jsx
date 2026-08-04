// Minimal single-stroke sport icons, matching lucide-react's visual weight
// (24x24 viewBox, currentColor stroke, round caps/joins) since lucide has no
// real glyphs for these sports and forcing generic shapes onto them would
// misrepresent the sport. Each inherits color/size like any lucide icon.

const base = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
};

export function CricketIcon({ size = 24, className = '' }) {
    return (
        <svg width={size} height={size} className={className} {...base}>
            <path d="M18.5 3.5 8 14" />
            <path d="M8 14 4.5 17.5a1.5 1.5 0 0 0 2 2L10 16" />
            <rect x="15.5" y="1.8" width="4" height="8" rx="1.6" transform="rotate(45 17.5 5.8)" />
            <circle cx="19.5" cy="19.5" r="2.2" />
        </svg>
    );
}

export function FootballIcon({ size = 24, className = '' }) {
    return (
        <svg width={size} height={size} className={className} {...base}>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5 15.3 10l-1.3 4H10l-1.3-4Z" />
            <path d="M12 7.5V4.2M15.3 10l3-1.7M13.7 14l1.8 3M10.3 14l-1.8 3M8.7 10l-3-1.7" />
        </svg>
    );
}

export function TennisIcon({ size = 24, className = '' }) {
    return (
        <svg width={size} height={size} className={className} {...base}>
            <circle cx="12" cy="12" r="9" />
            <path d="M4 7.5c3 1.5 4.5 4 4.5 9M20 7.5c-3 1.5-4.5 4-4.5 9" />
        </svg>
    );
}

export function BadmintonIcon({ size = 24, className = '' }) {
    return (
        <svg width={size} height={size} className={className} {...base}>
            <circle cx="12" cy="18.5" r="2" />
            <path d="M12 16.5 8 6M12 16.5l-6-8M12 16.5l6-8M12 16.5l4-10.5" />
            <path d="M8 6 6 5.5M2 6l6 0M6 5.5 4 2M16 5.5l2-3.5M22 6l-6 0M16 5.5l2 .5" />
        </svg>
    );
}

export function BasketballIcon({ size = 24, className = '' }) {
    return (
        <svg width={size} height={size} className={className} {...base}>
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3v18" />
            <path d="M5.5 5.5c2 2 3 4.2 3 6.5s-1 4.5-3 6.5M18.5 5.5c-2 2-3 4.2-3 6.5s1 4.5 3 6.5" />
        </svg>
    );
}

export function PickleballIcon({ size = 24, className = '' }) {
    return (
        <svg width={size} height={size} className={className} {...base}>
            <rect x="4" y="2.5" width="12" height="15" rx="6" />
            <circle cx="8" cy="7" r="0.6" fill="currentColor" />
            <circle cx="12" cy="7" r="0.6" fill="currentColor" />
            <circle cx="10" cy="10.5" r="0.6" fill="currentColor" />
            <circle cx="7" cy="12.5" r="0.6" fill="currentColor" />
            <circle cx="13" cy="12.5" r="0.6" fill="currentColor" />
            <path d="M9.5 16.5 5 21" />
        </svg>
    );
}
