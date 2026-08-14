import { useEffect, useMemo, useState } from 'react';

// Hand-rolled CSS particle burst — no animation library dependency, matching
// this app's existing transform/transition-driven animation style (see
// .scratch-card-flip-inner / .slot-selected in index.css). `trigger` is a
// counter/timestamp the parent bumps to re-fire the burst; the particle set
// is regenerated (and the container remounted via `key`) each time it changes.
const COLORS = ['#D1FB00', '#239848', '#3FC168', '#F2AB19', '#F5F7F9'];
const PARTICLE_COUNT = 26;

function makeParticles() {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    delay: Math.random() * 0.25,
    duration: 0.9 + Math.random() * 0.5,
    drift: (Math.random() - 0.5) * 60,
    size: 5 + Math.random() * 4,
  }));
}

export default function ConfettiBurst({ trigger }) {
  const [visible, setVisible] = useState(false);
  const particles = useMemo(() => (trigger ? makeParticles() : []), [trigger]);

  useEffect(() => {
    if (!trigger) return undefined;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 1300);
    return () => clearTimeout(t);
  }, [trigger]);

  if (!trigger || !visible) return null;

  return (
    <div key={trigger} className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {particles.map((p) => (
        <span
          key={p.id}
          className="confetti-particle"
          style={{
            left: `${p.left}%`,
            top: '-10px',
            width: `${p.size}px`,
            height: `${p.size * 1.6}px`,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            '--confetti-drift': `${p.drift}px`,
          }}
        />
      ))}
    </div>
  );
}
