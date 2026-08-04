import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "motion/react";
import { Apple, Chrome, Mail, Phone } from "lucide-react";
import { Logo } from "@/components/SiteHeader";
import { MagneticButton } from "@/components/MagneticButton";
import { SportIcon } from "@/components/SportIcon";
import { cities, sports, type SportId } from "@/data/mock";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Log in or Sign up | BookmyBox" },
      {
        name: "description",
        content: "Log in with email or phone OTP to book turfs and courts and get a personalised feed.",
      },
      { property: "og:title", content: "Log in or Sign up | BookmyBox" },
      { property: "og:description", content: "Sign in to book slots and track your games." },
    ],
  }),
  component: Auth,
});

function Auth() {
  const navigate = useNavigate();
  const { signIn } = useStore();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [step, setStep] = useState<"credentials" | "otp" | "onboarding">("credentials");
  const [method, setMethod] = useState<"email" | "phone">("phone");
  const [value, setValue] = useState("");
  const [otp, setOtp] = useState("");
  const [picked, setPicked] = useState<SportId[]>([]);
  const [city, setCity] = useState<string>(cities[0] ?? "Bengaluru");

  return (
    <div className="grid min-h-screen place-items-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-3xl border border-border bg-card p-7"
      >
        <Logo />

        {step === "credentials" && (
          <>
            <h1 className="mt-6 font-display text-2xl uppercase">
              {mode === "login" ? "Welcome back" : "Create your account"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Book turfs in seconds and keep your squad in sync.
            </p>

            <div className="mt-5 flex gap-2">
              {(["phone", "email"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  aria-pressed={method === m}
                  className={cn(
                    "flex-1 rounded-xl border px-3 py-2 text-sm capitalize transition",
                    method === m ? "border-primary text-primary" : "border-border text-muted-foreground",
                  )}
                >
                  {m === "phone" ? (
                    <Phone className="mr-1.5 inline h-4 w-4" />
                  ) : (
                    <Mail className="mr-1.5 inline h-4 w-4" />
                  )}
                  {m}
                </button>
              ))}
            </div>

            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={method === "phone" ? "+91 98765 43210" : "you@example.com"}
              className="mt-3 w-full rounded-xl border border-input bg-elevated px-3 py-3 text-sm outline-none focus:border-primary"
            />

            <MagneticButton
              className="mt-4 w-full"
              onClick={() => {
                if (!value.trim()) {
                  toast.error("Enter your number or email first");
                  return;
                }
                setStep("otp");
                toast.success("OTP sent — use 1234 for this demo");
              }}
            >
              Send OTP
            </MagneticButton>

            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> or continue with{" "}
              <span className="h-px flex-1 bg-border" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Google", Icon: Chrome },
                { label: "Apple", Icon: Apple },
              ].map(({ label, Icon }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setStep("onboarding")}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm"
                >
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              {mode === "login" ? "New to BookmyBox?" : "Already have an account?"}{" "}
              <button
                type="button"
                className="text-primary"
                onClick={() => setMode(mode === "login" ? "signup" : "login")}
              >
                {mode === "login" ? "Sign up" : "Log in"}
              </button>
            </p>
          </>
        )}

        {step === "otp" && (
          <>
            <h1 className="mt-6 font-display text-2xl uppercase">Enter the code</h1>
            <p className="mt-1 text-sm text-muted-foreground">Sent to {value}</p>
            <input
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              inputMode="numeric"
              maxLength={4}
              placeholder="1234"
              className="mt-5 w-full rounded-xl border border-input bg-elevated px-3 py-3 text-center font-display text-2xl tracking-[0.5em] outline-none focus:border-primary"
            />
            <MagneticButton className="mt-4 w-full" onClick={() => setStep("onboarding")}>
              Verify
            </MagneticButton>
          </>
        )}

        {step === "onboarding" && (
          <>
            <h1 className="mt-6 font-display text-2xl uppercase">What do you play?</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              We'll personalise your home feed around it.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {sports.map((s) => {
                const active = picked.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() =>
                      setPicked((prev) =>
                        prev.includes(s.id) ? prev.filter((p) => p !== s.id) : [...prev, s.id],
                      )
                    }
                    aria-pressed={active}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm transition",
                      active
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    <SportIcon sport={s.id} className="h-4 w-4" /> {s.name}
                  </button>
                );
              })}
            </div>

            <label className="mt-5 block text-sm">
              <span className="mb-1 block text-muted-foreground">Your city</span>
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full rounded-xl border border-input bg-elevated px-3 py-3 text-sm"
              >
                {cities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <MagneticButton
              className="mt-5 w-full"
              onClick={() => {
                signIn({ city, favouriteSports: picked });
                toast.success("You're in. Let's find you a ground.");
                navigate({ to: "/venues" });
              }}
            >
              Start booking
            </MagneticButton>
          </>
        )}
      </motion.div>
    </div>
  );
}
