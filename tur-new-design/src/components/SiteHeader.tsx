import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Menu, X, LayoutDashboard } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/venues", label: "Venues" },
  { to: "/dashboard", label: "My bookings" },
  { to: "/owner", label: "For owners" },
] as const;

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary font-display text-sm font-black text-primary-foreground">
        B
      </span>
      <span className="font-display text-lg font-black uppercase tracking-tight">
        Bookmy<span className="text-primary">Box</span>
      </span>
    </Link>
  );
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const { signedIn, profile } = useStore();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
        <Logo />

        <nav className="hidden items-center gap-1 md:flex">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="relative rounded-full px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground"
              activeProps={{ className: "text-primary" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {signedIn ? (
            <Link
              to="/dashboard"
              className="hidden items-center gap-2 rounded-full border border-border px-3 py-2 text-sm md:inline-flex"
            >
              <LayoutDashboard className="h-4 w-4" /> {profile.name.split(" ")[0]}
            </Link>
          ) : (
            <Link
              to="/auth"
              className="hidden rounded-full border border-border px-4 py-2 text-sm transition hover:border-primary/60 md:block"
            >
              Log in
            </Link>
          )}
          <Link
            to="/venues"
            className="rounded-full bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wide text-primary-foreground shadow-glow transition hover:bg-primary/90"
          >
            Book now
          </Link>
          <button
            type="button"
            className="md:hidden"
            aria-label="Toggle menu"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <div
        className={cn(
          "overflow-hidden border-t border-border transition-all md:hidden",
          open ? "max-h-64" : "max-h-0",
        )}
      >
        <nav className="flex flex-col gap-1 p-4">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-card hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
          <Link
            to="/auth"
            onClick={() => setOpen(false)}
            className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-card hover:text-foreground"
          >
            Log in / Sign up
          </Link>
        </nav>
      </div>
    </header>
  );
}
