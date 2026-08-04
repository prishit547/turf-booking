import { motion } from 'framer-motion';
import { Card } from '../ui';

/**
 * Shared shell for Login/Signup/OnboardingPage — one centered dark card,
 * lime-badge logo, for all three real auth flows.
 */
export function AuthShell({ title, subtitle, children }) {
    return (
        <div className="min-h-screen flex items-center justify-center py-16 px-4">
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="max-w-md w-full"
            >
                <Card className="p-8 rounded-3xl shadow-lift">
                    <div className="text-center mb-8">
                        <div className="mx-auto h-12 w-12 bg-primary rounded-2xl flex items-center justify-center mb-5 shadow-glow">
                            <span className="text-primary-foreground font-display font-bold text-lg">BMB</span>
                        </div>
                        <h1 className="font-display text-2xl font-bold text-foreground">{title}</h1>
                        {subtitle && <p className="text-muted-foreground mt-2">{subtitle}</p>}
                    </div>
                    {children}
                </Card>
            </motion.div>
        </div>
    );
}
