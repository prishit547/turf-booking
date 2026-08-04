import type { SportId } from "@/data/mock";
import { cn } from "@/lib/utils";

type Props = { sport: SportId; className?: string };

export function SportIcon({ sport, className }: Props) {
  const common = {
    className: cn("h-5 w-5", className),
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (sport) {
    case "football":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.5 15.2 9.9 14 13.7h-4L8.8 9.9z" />
          <path d="M12 3v4.5M4.2 9.6 8.8 9.9M19.8 9.6 15.2 9.9M7.3 19.5 10 13.7M16.7 19.5 14 13.7" />
        </svg>
      );
    case "cricket":
      return (
        <svg {...common}>
          <path d="M14.5 3.5 20.5 9.5 11 19a3 3 0 0 1-4.2 0l-1.8-1.8a3 3 0 0 1 0-4.2z" />
          <path d="M4.2 19.8 6.6 17.4" />
          <circle cx="6.5" cy="6.5" r="2.5" />
        </svg>
      );
    case "basketball":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3v18M3 12h18" />
          <path d="M5.6 5.6c3.5 3.5 3.5 9.3 0 12.8M18.4 5.6c-3.5 3.5-3.5 9.3 0 12.8" />
        </svg>
      );
    case "pickleball":
      return (
        <svg {...common}>
          <path d="M13.5 3.2c3.2 0 5.3 2.4 5.3 5.4 0 3.4-2.6 5.6-5.3 6.6l-1.4.5-2.8-2.8.5-1.4c1-2.7 3.2-5.3 6.6-5.3" />
          <path d="M9.3 12.9 5 17.2a2.1 2.1 0 0 0 3 3l4.3-4.3" />
          <circle cx="13.4" cy="8.6" r="1" />
          <circle cx="16.1" cy="10.3" r="1" />
        </svg>
      );
    case "badminton":
      return (
        <svg {...common}>
          <ellipse cx="9.4" cy="8.6" rx="5.2" ry="4" transform="rotate(-40 9.4 8.6)" />
          <path d="M12.6 11.8 19 18.2a1.9 1.9 0 0 1-2.7 2.7l-6.4-6.4" />
          <path d="M6.6 5.6 12.2 11.2M5.4 8.4l5.6 5.6" />
        </svg>
      );
  }
}
