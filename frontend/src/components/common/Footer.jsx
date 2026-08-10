import { Link } from 'react-router-dom'
import { Facebook, Twitter, Instagram } from 'lucide-react'
import { Logo } from './Header'

const cities = ['Mumbai', 'Bengaluru', 'Pune', 'Delhi', 'Ahmedabad', 'Hyderabad']
const sportsList = ['Cricket', 'Football', 'Tennis', 'Badminton']

const Footer = () => {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="border-t border-border bg-card/40">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm text-muted-foreground">
            Book sports boxes by the hour. Live availability, instant confirmation, no phone calls.
          </p>
          <div className="mt-5 flex gap-3">
            {[Facebook, Twitter, Instagram].map((Icon, i) => (
              <a
                key={i}
                href="#"
                className="grid h-9 w-9 place-items-center rounded-full border border-border text-muted-foreground transition hover:border-primary/60 hover:text-primary"
              >
                <Icon className="h-4 w-4" />
              </a>
            ))}
          </div>
        </div>

        <div>
          <h4 className="font-display text-sm uppercase tracking-wide">Cities</h4>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            {cities.map((city) => (
              <li key={city}>
                <Link to={`/boxes?location=${encodeURIComponent(city)}`} className="hover:text-primary">
                  Boxes in {city}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="font-display text-sm uppercase tracking-wide">Sports</h4>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            {sportsList.map((sport) => (
              <li key={sport}>
                <Link to={`/boxes?sport=${sport.toLowerCase()}`} className="hover:text-primary">
                  {sport}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="font-display text-sm uppercase tracking-wide">Company</h4>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li>
              <Link to="/signup" className="hover:text-primary">
                List your venue
              </Link>
            </li>
            <li>
              <Link to="/dashboard" className="hover:text-primary">
                My bookings
              </Link>
            </li>
            <li>
              <Link to="/about" className="hover:text-primary">
                About us
              </Link>
            </li>
            <li>
              <Link to="/contact" className="hover:text-primary">
                Contact
              </Link>
            </li>
            <li>support@bookmybox.com</li>
            <li>+91 98253 27667</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border px-4 py-5 text-center text-xs text-muted-foreground">
        © {currentYear} BookMyBox. Play more, plan less.
      </div>
    </footer>
  )
}

export default Footer
