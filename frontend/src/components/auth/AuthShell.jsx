import { motion } from 'framer-motion';
import { Logo } from '../common/Header';

/**
 * Shared shell for Login/Signup/OnboardingPage — matches the reference
 * design's auth card exactly: left-aligned Logo, rounded-3xl bg-card panel,
 * p-7 padding, heading/subtitle directly below the logo (not centered).
 */
export function AuthShell({ title, subtitle, children }) {
    return (
        <div className="grid min-h-screen place-items-center px-4 py-12">
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-md rounded-3xl border border-border bg-card p-7"
            >
                <Logo />
                <h1 className="mt-6 font-display text-2xl uppercase">{title}</h1>
                {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
                <div className="mt-5">{children}</div>
            </motion.div>
        </div>
    );
}
