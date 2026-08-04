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
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
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
                    transition={{ duration: 0.7, delay: 0.12 * i, ease: [0.22, 1, 0.36, 1] }}
                >
                    {word}
                    {i < words.length - 1 ? ' ' : ''}
                </motion.span>
            ))}
        </span>
    );
}
