import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion, useScroll, useTransform } from "motion/react";
import { useRef, useState } from "react";
import { ArrowRight, CalendarDays, MapPin, Search, Sparkles, Ticket, Zap } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Reveal, WordReveal } from "@/components/Reveal";
import { VenueCard } from "@/components/VenueCard";
import { SportIcon } from "@/components/SportIcon";
import { MagneticButton } from "@/components/MagneticButton";
import { cities, heroTurf, sports, testimonials, venues, type SportId } from "@/data/mock";
import { todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BookmyBox — Book Turfs, Courts & Box Cricket by the Hour" },
      {
        name: "description",
        content:
          "Find and book football turfs, box cricket cages, basketball, pickleball and badminton courts near you with live hourly availability.",
      },
      { property: "og:title", content: "BookmyBox — Book Turfs & Courts by the Hour" },
      {
        property: "og:description",
        content: "Live slot availability, instant confirmation, no phone calls. Pick a slot and play.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const bgY = useTransform(scrollYProgress, [0, 1], ["0%", "18%"]);
  const bgScale = useTransform(scrollYProgress, [0, 1], [1.05, 1.18]);

  const [sport, setSport] = useState<SportId | "">("");
  const [city, setCity] = useState<string>(cities[0] ?? "Bengaluru");
  const [date, setDate] = useState(todayISO());

  const popular = [...venues].sort((a, b) => b.rating - a.rating).slice(0, 4);

  return (
    <div className="min-h-screen">
      <SiteHeader />

      {/* Hero */}
      <section ref={heroRef} className="relative overflow-hidden">
        <motion.img
          src={heroTurf}
          alt="Football turf under floodlights at night"
          width={1920}
          height={1080}
          style={{ y: bgY, scale: bgScale }}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/70 to-background" />
        <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-20 sm:pt-28">
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-primary"
          >
            <Zap className="h-3.5 w-3.5" /> Live availability in {venues.length * 43} venues
          </motion.p>

          <h1 className="mt-6 max-w-3xl font-display text-5xl font-black uppercase leading-[0.95] tracking-tight sm:text-7xl">
            <WordReveal text="Your game." />
            <br />
            <span className="text-primary">
              <WordReveal text="Booked in 60 seconds." />
            </span>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.6 }}
            className="mt-5 max-w-xl text-lg text-muted-foreground"
          >
            Football turfs, box cricket cages, hoops, pickleball and badminton courts — real-time slots,
            instant confirmation, zero phone calls.
          </motion.p>

          {/* Quick search */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.85, duration: 0.6 }}
            className="mt-9 rounded-2xl border border-border bg-card/85 p-3 backdrop-blur sm:max-w-3xl"
          >
            <div className="grid gap-2 sm:grid-cols-[1.1fr_1fr_1fr_auto]">
              <label className="flex items-center gap-2 rounded-xl bg-elevated px-3 py-2.5">
                <Sparkles className="h-4 w-4 text-primary" />
                <select
                  value={sport}
                  onChange={(e) => setSport(e.target.value as SportId | "")}
                  aria-label="Sport"
                  className="w-full bg-transparent text-sm outline-none"
                >
                  <option value="">Any sport</option>
                  {sports.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 rounded-xl bg-elevated px-3 py-2.5">
                <MapPin className="h-4 w-4 text-primary" />
                <select
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  aria-label="City"
                  className="w-full bg-transparent text-sm outline-none"
                >
                  {cities.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 rounded-xl bg-elevated px-3 py-2.5">
                <CalendarDays className="h-4 w-4 text-primary" />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  aria-label="Date"
                  className="w-full bg-transparent text-sm outline-none"
                />
              </label>
              <MagneticButton
                onClick={() =>
                  navigate({
                    to: "/venues",
                    search: { ...(sport ? { sport } : {}), city, date },
                  })
                }
                className="px-6 py-2.5"
              >
                <Search className="h-4 w-4" /> Search
              </MagneticButton>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Sport categories */}
      <section className="mx-auto max-w-7xl px-4 py-16">
        <Reveal>
          <h2 className="font-display text-3xl uppercase sm:text-4xl">Pick your sport</h2>
          <p className="mt-2 text-muted-foreground">Every surface, every hour, one app.</p>
        </Reveal>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {sports.map((s, i) => (
            <Reveal key={s.id} delay={i * 0.06}>
              <Link
                to="/venues"
                search={{ sport: s.id }}
                className="group relative block h-48 overflow-hidden rounded-2xl border border-border"
              >
                <img
                  src={s.image}
                  alt={s.name}
                  loading="lazy"
                  width={1024}
                  height={768}
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
                <div className="relative flex h-full flex-col justify-end p-4">
                  <SportIcon sport={s.id} className="h-6 w-6 text-primary" />
                  <h3 className="mt-2 font-display text-lg uppercase">{s.name}</h3>
                  <p className="text-xs text-muted-foreground">{s.tagline}</p>
                  <span className="mt-2 h-0.5 w-0 bg-primary transition-all duration-300 group-hover:w-16" />
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Popular venues */}
      <section className="mx-auto max-w-7xl px-4 py-10">
        <Reveal className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-3xl uppercase sm:text-4xl">Popular near you</h2>
            <p className="mt-2 text-muted-foreground">Top rated grounds booked most this week.</p>
          </div>
          <Link to="/venues" className="inline-flex items-center gap-2 text-sm text-primary">
            View all venues <ArrowRight className="h-4 w-4" />
          </Link>
        </Reveal>
        <div className="no-scrollbar mt-8 flex snap-x gap-4 overflow-x-auto pb-2 lg:grid lg:grid-cols-4 lg:overflow-visible">
          {popular.map((venue, i) => (
            <Reveal key={venue.id} delay={i * 0.05} className="w-80 shrink-0 snap-start lg:w-auto">
              <VenueCard venue={venue} />
            </Reveal>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-7xl px-4 py-16">
        <Reveal>
          <h2 className="font-display text-3xl uppercase sm:text-4xl">How it works</h2>
        </Reveal>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            {
              icon: MapPin,
              title: "Choose your ground",
              body: "Filter by sport, price, distance and amenities. Compare turfs on a map.",
            },
            {
              icon: CalendarDays,
              title: "Pick your slot",
              body: "Live hour-by-hour availability. Stack consecutive hours in one tap.",
            },
            {
              icon: Ticket,
              title: "Pay & play",
              body: "Instant confirmation with a QR pass. Show up and walk straight in.",
            },
          ].map((step, i) => (
            <Reveal key={step.title} delay={i * 0.1}>
              <div className="group h-full rounded-2xl border border-border bg-card p-6 transition hover:border-primary/50">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/15 text-primary transition group-hover:scale-110">
                  <step.icon className="h-5 w-5" />
                </div>
                <p className="mt-4 font-display text-sm uppercase tracking-wide text-primary">
                  Step {i + 1}
                </p>
                <h3 className="mt-1 font-display text-xl">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section className="mx-auto max-w-7xl px-4 py-10">
        <Reveal>
          <h2 className="font-display text-3xl uppercase sm:text-4xl">Players & owners</h2>
        </Reveal>
        <div className="no-scrollbar mt-8 flex snap-x gap-4 overflow-x-auto pb-2">
          {testimonials.map((t, i) => (
            <Reveal key={t.id} delay={i * 0.08} className="w-[22rem] shrink-0 snap-start">
              <figure className="h-full rounded-2xl border border-border bg-card p-6">
                <blockquote className="text-sm leading-relaxed text-foreground">"{t.quote}"</blockquote>
                <figcaption className="mt-4">
                  <p className="font-display text-sm uppercase">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.role}</p>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Offers banner */}
      <section className="mx-auto max-w-7xl px-4 py-16">
        <Reveal>
          <div
            className={cn(
              "relative overflow-hidden rounded-3xl border border-primary/30 bg-card p-8 sm:p-12",
            )}
          >
            <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
            <div className="relative flex flex-wrap items-center justify-between gap-6">
              <div>
                <p className="font-display text-sm uppercase tracking-wide text-primary">
                  First booking offer
                </p>
                <h2 className="mt-2 max-w-md font-display text-3xl uppercase sm:text-4xl">
                  20% off with code FIRSTGAME
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Valid on every sport, every venue, all week.
                </p>
              </div>
              <Link
                to="/venues"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-display text-sm font-bold uppercase tracking-wide text-primary-foreground shadow-glow"
              >
                Grab a slot <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      <SiteFooter />
    </div>
  );
}
