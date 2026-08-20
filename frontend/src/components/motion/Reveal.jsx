import { motion } from 'framer-motion';

/**
 * Scroll-triggered fade/slide-up section reveal, ported from the reference
 * design. Wrap any section/card group with this instead of hand-rolling
 * whileInView props each time.
 */
export function Reveal({ children, delay = 0, y = 24, className = '' }) {
    return (
        <motion.div
            className={className}
            initial={{ opacity: 0, y }}
            whileInView={{ opacity: 1, y: 0 }}
            // Positive margin extends the trigger zone *below* the viewport, so
            // a section starts fading in before it's scrolled into view instead
            // of after — a fast scroll used to outrun the old negative margin
            // and land on a fully invisible (opacity: 0) section, which read as
            // a blank/black gap against this dark theme.
            viewport={{ once: true, margin: '0px 0px 200px 0px' }}
            transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
        >
            {children}
        </motion.div>
    );
}

/** Staggered per-word blur+slide reveal — used for the hero headline. */
export function WordReveal({ text, className = '' }) {
    const words = text.split(' ');
    return (
        <span className={className}>
            {words.map((word, i) => (
                <motion.span
                    key={`${word}-${i}`}
                    className="inline-block"
                    initial={{ opacity: 0, y: '0.6em', filter: 'blur(6px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    transition={{ duration: 0.5, delay: 0.06 * i, ease: [0.22, 1, 0.36, 1] }}
                >
                    {word}
                    {i < words.length - 1 ? ' ' : ''}
                </motion.span>
            ))}
        </span>
    );
}
