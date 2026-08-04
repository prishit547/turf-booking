import heroTurf from "@/assets/hero-turf.jpg";
import venueFootball from "@/assets/venue-football.jpg";
import venueCricket from "@/assets/venue-cricket.jpg";
import venueBasketball from "@/assets/venue-basketball.jpg";
import venuePickleball from "@/assets/venue-pickleball.jpg";
import venueBadminton from "@/assets/venue-badminton.jpg";

export { heroTurf };

export type SportId = "football" | "cricket" | "basketball" | "pickleball" | "badminton";

export type Sport = {
  id: SportId;
  name: string;
  tagline: string;
  image: string;
};

export const sports: Sport[] = [
  { id: "football", name: "Football Turf", tagline: "5s, 7s & 9s", image: venueFootball },
  { id: "cricket", name: "Box Cricket", tagline: "Nets & cages", image: venueCricket },
  { id: "basketball", name: "Basketball", tagline: "Full & half court", image: venueBasketball },
  { id: "pickleball", name: "Pickleball", tagline: "Fastest growing", image: venuePickleball },
  { id: "badminton", name: "Badminton", tagline: "Indoor wood courts", image: venueBadminton },
];

export const cities = ["Bengaluru", "Mumbai", "Pune", "Hyderabad", "Delhi NCR", "Chennai"];

export const amenityList = [
  "Floodlights",
  "Parking",
  "Washroom",
  "Changing Room",
  "Drinking Water",
  "Cafeteria",
  "Equipment Rental",
  "Seating",
] as const;

export type Amenity = (typeof amenityList)[number];

export type Venue = {
  id: string;
  name: string;
  city: string;
  area: string;
  address: string;
  sports: SportId[];
  pricePerHour: number;
  peakPricePerHour: number;
  rating: number;
  reviewCount: number;
  distanceKm: number;
  indoor: boolean;
  amenities: Amenity[];
  images: string[];
  about: string;
  openHour: number;
  closeHour: number;
};

export const venues: Venue[] = [
  {
    id: "floodlight-arena",
    name: "Floodlight Arena",
    city: "Bengaluru",
    area: "Koramangala",
    address: "80 Feet Road, 6th Block, Koramangala, Bengaluru 560095",
    sports: ["football", "cricket"],
    pricePerHour: 1200,
    peakPricePerHour: 1600,
    rating: 4.8,
    reviewCount: 412,
    distanceKm: 2.4,
    indoor: false,
    amenities: ["Floodlights", "Parking", "Washroom", "Changing Room", "Drinking Water", "Cafeteria"],
    images: [venueFootball, heroTurf, venueCricket],
    about:
      "Rooftop FIFA-grade turf with 8 floodlight towers, netted cage and a skyline view. Two 5-a-side pitches convertible into a single 7-a-side ground.",
    openHour: 6,
    closeHour: 24,
  },
  {
    id: "the-box-yard",
    name: "The Box Yard",
    city: "Bengaluru",
    area: "Indiranagar",
    address: "12th Main, HAL 2nd Stage, Indiranagar, Bengaluru 560038",
    sports: ["cricket", "football"],
    pricePerHour: 950,
    peakPricePerHour: 1250,
    rating: 4.6,
    reviewCount: 288,
    distanceKm: 4.1,
    indoor: true,
    amenities: ["Floodlights", "Washroom", "Drinking Water", "Equipment Rental", "Seating"],
    images: [venueCricket, venueFootball],
    about:
      "Fully covered box cricket cage with bounce-true matting, bowling machine on request and live scoring boards.",
    openHour: 6,
    closeHour: 23,
  },
  {
    id: "hoopstate-courts",
    name: "Hoopstate Courts",
    city: "Mumbai",
    area: "Andheri West",
    address: "Veera Desai Road, Andheri West, Mumbai 400053",
    sports: ["basketball"],
    pricePerHour: 800,
    peakPricePerHour: 1100,
    rating: 4.7,
    reviewCount: 196,
    distanceKm: 6.8,
    indoor: true,
    amenities: ["Parking", "Washroom", "Changing Room", "Seating", "Cafeteria"],
    images: [venueBasketball],
    about:
      "Indoor maple hardwood full court with breakaway rims, shot clock and spectator seating for 120.",
    openHour: 7,
    closeHour: 23,
  },
  {
    id: "dink-district",
    name: "Dink District",
    city: "Pune",
    area: "Baner",
    address: "Baner Road, Pune 411045",
    sports: ["pickleball", "badminton"],
    pricePerHour: 600,
    peakPricePerHour: 850,
    rating: 4.9,
    reviewCount: 154,
    distanceKm: 3.2,
    indoor: false,
    amenities: ["Floodlights", "Parking", "Washroom", "Equipment Rental", "Drinking Water"],
    images: [venuePickleball, venueBadminton],
    about:
      "Four cushioned acrylic pickleball courts with tournament-grade nets. Paddles and balls included in the hourly rate.",
    openHour: 6,
    closeHour: 22,
  },
  {
    id: "smash-factory",
    name: "Smash Factory",
    city: "Hyderabad",
    area: "Gachibowli",
    address: "Financial District Road, Gachibowli, Hyderabad 500032",
    sports: ["badminton", "pickleball"],
    pricePerHour: 550,
    peakPricePerHour: 750,
    rating: 4.5,
    reviewCount: 331,
    distanceKm: 8.9,
    indoor: true,
    amenities: ["Washroom", "Changing Room", "Drinking Water", "Equipment Rental", "Seating"],
    images: [venueBadminton, venuePickleball],
    about:
      "Six wooden badminton courts with BWF-approved mats, 9m ceiling clearance and zero draft air conditioning.",
    openHour: 6,
    closeHour: 24,
  },
  {
    id: "turf-republic",
    name: "Turf Republic",
    city: "Delhi NCR",
    area: "Sector 45, Gurugram",
    address: "Sector 45, Gurugram, Haryana 122003",
    sports: ["football", "basketball", "cricket"],
    pricePerHour: 1400,
    peakPricePerHour: 1900,
    rating: 4.4,
    reviewCount: 502,
    distanceKm: 11.5,
    indoor: false,
    amenities: ["Floodlights", "Parking", "Washroom", "Changing Room", "Cafeteria", "Seating"],
    images: [heroTurf, venueFootball, venueBasketball],
    about:
      "Flagship 9-a-side turf plus two half courts. Home to weekend leagues and corporate tournaments.",
    openHour: 5,
    closeHour: 24,
  },
];

export type Review = {
  id: string;
  venueId: string;
  author: string;
  rating: number;
  date: string;
  text: string;
  sport: SportId;
};

export const reviews: Review[] = [
  {
    id: "r1",
    venueId: "floodlight-arena",
    author: "Aditya R.",
    rating: 5,
    date: "2 days ago",
    text: "Turf is bouncy and the floodlights are genuinely stadium level. Booked 10pm slot, zero waiting.",
    sport: "football",
  },
  {
    id: "r2",
    venueId: "floodlight-arena",
    author: "Nikita S.",
    rating: 4,
    date: "1 week ago",
    text: "Great pitch, parking fills up fast on weekends. Cafeteria chai is a nice touch after a game.",
    sport: "football",
  },
  {
    id: "r3",
    venueId: "floodlight-arena",
    author: "Faizan M.",
    rating: 5,
    date: "2 weeks ago",
    text: "We run our office league here every Thursday. Slot booking has never double-booked us.",
    sport: "cricket",
  },
  {
    id: "r4",
    venueId: "the-box-yard",
    author: "Rohit K.",
    rating: 5,
    date: "4 days ago",
    text: "Matting plays true, bowling machine is worth the extra. Indoor means monsoon-proof.",
    sport: "cricket",
  },
  {
    id: "r5",
    venueId: "hoopstate-courts",
    author: "Meera J.",
    rating: 5,
    date: "3 days ago",
    text: "Real hardwood, proper rims. Feels like a college gym in the best way.",
    sport: "basketball",
  },
  {
    id: "r6",
    venueId: "dink-district",
    author: "Sameer T.",
    rating: 5,
    date: "Yesterday",
    text: "Best pickleball surface in Pune. Paddles included so friends can just show up.",
    sport: "pickleball",
  },
  {
    id: "r7",
    venueId: "smash-factory",
    author: "Divya P.",
    rating: 4,
    date: "5 days ago",
    text: "Courts are excellent. Shuttle rental could be cheaper but the AC makes long sessions doable.",
    sport: "badminton",
  },
  {
    id: "r8",
    venueId: "turf-republic",
    author: "Karan B.",
    rating: 4,
    date: "1 week ago",
    text: "Huge ground, well maintained. Peak hour pricing is steep but the surface justifies it.",
    sport: "football",
  },
];

export const testimonials = [
  {
    id: "t1",
    name: "Aarav Menon",
    role: "Captain, Sunday Sixes",
    quote:
      "We used to lose 40 minutes on WhatsApp every week arguing about slots. Now one person books in 20 seconds and the group just shows up.",
  },
  {
    id: "t2",
    name: "Priya Nair",
    role: "Pickleball, 3x a week",
    quote:
      "Live availability is the whole thing. I can see exactly which courts are open tonight instead of calling five places.",
  },
  {
    id: "t3",
    name: "Vikram Shetty",
    role: "Owner, Floodlight Arena",
    quote:
      "Off-peak slots that used to sit empty are now 70% filled. The owner calendar is the first tool that actually fits how we operate.",
  },
];

export const coupons: Record<string, { discountPct: number; label: string }> = {
  FIRSTGAME: { discountPct: 20, label: "20% off your first booking" },
  NIGHTOWL: { discountPct: 10, label: "10% off late night slots" },
  BOXPRO: { discountPct: 15, label: "15% off box cricket" },
};

export const CONVENIENCE_FEE = 29;
export const TAX_RATE = 0.18;

/* ---------- Slots ---------- */

export type SlotStatus = "available" | "booked" | "blocked";

export type Slot = {
  hour: number;
  label: string;
  status: SlotStatus;
  price: number;
  peak: boolean;
};

function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function formatHour(hour: number) {
  const h = hour % 24;
  const suffix = h < 12 ? "AM" : "PM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:00 ${suffix}`;
}

export function isPeakHour(hour: number) {
  return hour >= 18 && hour <= 22;
}

export function getSlots(venueId: string, dateISO: string): Slot[] {
  const venue = venues.find((v) => v.id === venueId);
  if (!venue) return [];
  const out: Slot[] = [];
  for (let hour = venue.openHour; hour < venue.closeHour; hour++) {
    const seed = hash(`${venueId}|${dateISO}|${hour}`) % 100;
    const peak = isPeakHour(hour);
    let status: SlotStatus = "available";
    if (seed < (peak ? 45 : 18)) status = "booked";
    else if (seed > 96) status = "blocked";
    out.push({
      hour,
      label: formatHour(hour),
      status,
      price: peak ? venue.peakPricePerHour : venue.pricePerHour,
      peak,
    });
  }
  return out;
}

export function getVenue(id: string) {
  return venues.find((v) => v.id === id);
}

export function getReviews(venueId: string) {
  return reviews.filter((r) => r.venueId === venueId);
}

/* ---------- Owner analytics mock ---------- */

export const earningsByDay = [
  { day: "Mon", earnings: 12400, bookings: 9 },
  { day: "Tue", earnings: 15800, bookings: 12 },
  { day: "Wed", earnings: 14200, bookings: 11 },
  { day: "Thu", earnings: 19600, bookings: 15 },
  { day: "Fri", earnings: 26400, bookings: 20 },
  { day: "Sat", earnings: 34800, bookings: 27 },
  { day: "Sun", earnings: 31200, bookings: 24 },
];

export const sportSplit = [
  { sport: "Football", value: 46 },
  { sport: "Cricket", value: 27 },
  { sport: "Pickleball", value: 14 },
  { sport: "Basketball", value: 13 },
];
