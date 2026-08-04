import { motion, useSpring } from "motion/react";
import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function MagneticButton({
  children,
  className,
  onClick,
  type = "button",
  disabled,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const x = useSpring(0, { stiffness: 260, damping: 18 });
  const y = useSpring(0, { stiffness: 260, damping: 18 });

  return (
    <motion.button
      ref={ref}
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={{ x, y }}
      whileTap={{ scale: 0.96 }}
      onPointerMove={(e) => {
        const rect = ref.current?.getBoundingClientRect();
        if (!rect) return;
        x.set(((e.clientX - (rect.left + rect.width / 2)) / rect.width) * 14);
        y.set(((e.clientY - (rect.top + rect.height / 2)) / rect.height) * 10);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 font-display text-sm font-bold uppercase tracking-wide text-primary-foreground shadow-glow transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:shadow-none",
        className,
      )}
    >
      {children}
    </motion.button>
  );
}
