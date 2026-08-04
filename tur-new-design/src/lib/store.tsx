import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { CONVENIENCE_FEE, TAX_RATE, type SportId } from "@/data/mock";

export type BookingDraft = {
  venueId: string;
  venueName: string;
  sport: SportId;
  dateISO: string;
  hours: number[];
  pricePerSlot: Record<number, number>;
};

export type BookingStatus = "confirmed" | "completed" | "cancelled";

export type Booking = BookingDraft & {
  id: string;
  status: BookingStatus;
  total: number;
  createdAt: string;
};

export type Profile = {
  name: string;
  email: string;
  phone: string;
  city: string;
  favouriteSports: SportId[];
};

type Store = {
  hydrated: boolean;
  draft: BookingDraft | null;
  setDraft: (draft: BookingDraft | null) => void;
  bookings: Booking[];
  addBooking: (booking: Booking) => void;
  cancelBooking: (id: string) => void;
  favourites: string[];
  toggleFavourite: (venueId: string) => void;
  signedIn: boolean;
  profile: Profile;
  signIn: (profile: Partial<Profile>) => void;
  signOut: () => void;
  blockedSlots: Record<string, number[]>;
  toggleBlockedSlot: (key: string, hour: number) => void;
};

const defaultProfile: Profile = {
  name: "Arjun Kapoor",
  email: "arjun@example.com",
  phone: "+91 98765 43210",
  city: "Bengaluru",
  favouriteSports: ["football"],
};

const StoreContext = createContext<Store | null>(null);

const KEY = "bookmybox.v1";

type Persisted = {
  bookings: Booking[];
  favourites: string[];
  signedIn: boolean;
  profile: Profile;
  blockedSlots: Record<string, number[]>;
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [draft, setDraft] = useState<BookingDraft | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [favourites, setFavourites] = useState<string[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [blockedSlots, setBlockedSlots] = useState<Record<string, number[]>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Persisted>;
        setBookings(parsed.bookings ?? []);
        setFavourites(parsed.favourites ?? []);
        setSignedIn(parsed.signedIn ?? false);
        setProfile({ ...defaultProfile, ...(parsed.profile ?? {}) });
        setBlockedSlots(parsed.blockedSlots ?? {});
      }
    } catch {
      /* ignore corrupt storage */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const payload: Persisted = { bookings, favourites, signedIn, profile, blockedSlots };
    try {
      localStorage.setItem(KEY, JSON.stringify(payload));
    } catch {
      /* storage full or unavailable */
    }
  }, [hydrated, bookings, favourites, signedIn, profile, blockedSlots]);

  const addBooking = useCallback((booking: Booking) => {
    setBookings((prev) => [booking, ...prev]);
  }, []);

  const cancelBooking = useCallback((id: string) => {
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status: "cancelled" } : b)));
  }, []);

  const toggleFavourite = useCallback((venueId: string) => {
    setFavourites((prev) =>
      prev.includes(venueId) ? prev.filter((v) => v !== venueId) : [...prev, venueId],
    );
  }, []);

  const signIn = useCallback((next: Partial<Profile>) => {
    setProfile((prev) => ({ ...prev, ...next }));
    setSignedIn(true);
  }, []);

  const signOut = useCallback(() => setSignedIn(false), []);

  const toggleBlockedSlot = useCallback((key: string, hour: number) => {
    setBlockedSlots((prev) => {
      const current = prev[key] ?? [];
      return {
        ...prev,
        [key]: current.includes(hour) ? current.filter((h) => h !== hour) : [...current, hour],
      };
    });
  }, []);

  const value = useMemo<Store>(
    () => ({
      hydrated,
      draft,
      setDraft,
      bookings,
      addBooking,
      cancelBooking,
      favourites,
      toggleFavourite,
      signedIn,
      profile,
      signIn,
      signOut,
      blockedSlots,
      toggleBlockedSlot,
    }),
    [
      hydrated,
      draft,
      bookings,
      addBooking,
      cancelBooking,
      favourites,
      toggleFavourite,
      signedIn,
      profile,
      signIn,
      signOut,
      blockedSlots,
      toggleBlockedSlot,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}

export function priceBreakdown(subtotal: number, discountPct = 0) {
  const discount = Math.round((subtotal * discountPct) / 100);
  const taxable = subtotal - discount + CONVENIENCE_FEE;
  const taxes = Math.round(taxable * TAX_RATE);
  return {
    subtotal,
    discount,
    convenienceFee: CONVENIENCE_FEE,
    taxes,
    total: taxable + taxes,
  };
}

export function inr(value: number) {
  return `₹${value.toLocaleString("en-IN")}`;
}
