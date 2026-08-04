import { Trophy, Star, Target, Award, Crown, Zap, Check } from 'lucide-react';

/**
 * Achievement medallion — a large icon tile, distinct from the small status
 * pill in `ui/Badge.jsx` (import this one aliased, e.g. `AchievementBadge`, to
 * avoid confusing the two).
 *
 * Tiers escalate toward the brand accent, with platinum getting the deep ink
 * panel — the palette has no cool metal hue, so "most exclusive" reads as the
 * dark treatment rather than a colder tint.
 */
const TIER_STYLES = {
    bronze: 'text-[#CD7F32] bg-[#CD7F32]/10 border-[#CD7F32]/30',
    silver: 'text-muted-foreground bg-muted-foreground/10 border-muted-foreground/30',
    gold: 'text-warning bg-warning/10 border-warning/30',
    platinum: 'text-foreground bg-background border-border',
    default: 'text-primary bg-primary/10 border-primary/30',
};

const UNEARNED = 'text-muted-foreground bg-muted/60 border-border';

const ICON_RULES = [
    [['first', 'timer'], Star],
    [['weekly', 'warrior'], Target],
    [['regular', 'player'], Trophy],
    [['sports', 'enthusiast'], Zap],
    [['spender', 'big'], Crown],
    [['monthly', 'champion'], Award],
    [['business', 'entrepreneur'], Target],
    [['popular', 'venue'], Star],
    [['revenue', 'milestone'], Crown],
];

const getBadgeIcon = (name) => {
    const n = (name || '').toLowerCase();
    const match = ICON_RULES.find(([keywords]) => keywords.some((k) => n.includes(k)));
    return match ? match[1] : Trophy;
};

const SIZES = {
    sm: 'w-12 h-12',
    md: 'w-16 h-16',
    lg: 'w-20 h-20',
};

const Badge = ({ name, description, earned, type = 'default', size = 'md' }) => {
    const Icon = getBadgeIcon(name);

    return (
        <div
            className={[
                'relative flex flex-col items-center text-center p-4 rounded-xl border transition-colors duration-200',
                earned ? TIER_STYLES[type] || TIER_STYLES.default : UNEARNED,
                earned ? '' : 'opacity-70',
            ].join(' ')}
        >
            <div className={`${SIZES[size]} flex items-center justify-center rounded-full border border-current/30 mb-3`}>
                <Icon size={size === 'sm' ? 20 : size === 'lg' ? 32 : 26} strokeWidth={1.75} />
            </div>

            <h3 className="font-display font-semibold leading-tight text-sm mb-1">{name}</h3>
            <p className="text-xs opacity-80 leading-snug">{description}</p>

            {earned && (
                <div className="absolute -top-2 -right-2 w-6 h-6 bg-success text-white rounded-full flex items-center justify-center">
                    <Check size={14} strokeWidth={3} />
                </div>
            )}
        </div>
    );
};

export default Badge;
