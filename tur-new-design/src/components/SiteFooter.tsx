import { Link } from "@tanstack/react-router";
import { Instagram, Twitter, Youtube } from "lucide-react";
import { cities, sports } from "@/data/mock";
import { Logo } from "@/components/SiteHeader";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card/40">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm text-muted-foreground">
            Book turfs and courts by the hour. Live availability, instant confirmation, no phone calls.
          </p>
          <div className="mt-5 flex gap-3">
            {[Instagram, Twitter, Youtube].map((Icon, i) => (
              <span
                key={i}
                className="grid h-9 w-9 place-items-center rounded-full border border-border text-muted-foreground transition hover:border-primary/60 hover:text-primary"
              >
                <Icon className="h-4 w-4" />
              </span>
            ))}
          </div>
        </div>

        <div>
          <h4 className="font-display text-sm uppercase tracking-wide">Cities</h4>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            {cities.map((city) => (
              <li key={city}>
                <Link to="/venues" search={{ city }} className="hover:text-primary">
                  Turfs in {city}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="font-display text-sm uppercase tracking-wide">Sports</h4>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            {sports.map((sport) => (
              <li key={sport.id}>
                <Link to="/venues" search={{ sport: sport.id }} className="hover:text-primary">
                  {sport.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="font-display text-sm uppercase tracking-wide">Company</h4>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li>
              <Link to="/owner" className="hover:text-primary">
                List your venue
              </Link>
            </li>
            <li>
              <Link to="/dashboard" className="hover:text-primary">
                My bookings
              </Link>
            </li>
            <li>support@bookmybox.app</li>
            <li>+91 98253 27612</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border px-4 py-5 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} BookmyBox. Play more, plan less.
      </div>
    </footer>
  );
}
