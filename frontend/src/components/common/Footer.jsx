import { Link } from 'react-router-dom'
import { Facebook, Twitter, Instagram, Mail, Phone, MapPin } from 'lucide-react'

const Footer = () => {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="bg-card/40 border-t border-border text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Company Info */}
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="bg-primary text-primary-foreground w-9 h-9 rounded-lg flex items-center justify-center font-display font-semibold text-sm">
                BMB
              </div>
              <span className="font-display font-semibold text-xl">BookMyBox</span>
            </div>
            <p className="text-muted-foreground text-sm">
              Your premier destination for booking sports facilities.
              Find and book the perfect sports box for your game.
            </p>
            <div className="flex gap-3">
              <a
                href="#"
                className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                <Facebook size={16} />
              </a>
              <a
                href="#"
                className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                <Twitter size={16} />
              </a>
              <a
                href="#"
                className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                <Instagram size={16} />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-4">
            <h3 className="font-display font-semibold text-lg">Quick Links</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/boxes" className="text-muted-foreground hover:text-primary transition-colors">
                  Browse Boxes
                </Link>
              </li>
              <li>
                <Link to="/about" className="text-muted-foreground hover:text-primary transition-colors">
                  About Us
                </Link>
              </li>
              <li>
                <Link to="/contact" className="text-muted-foreground hover:text-primary transition-colors">
                  Contact
                </Link>
              </li>
              <li>
                <Link to="/contact#faq" className="text-muted-foreground hover:text-primary transition-colors">
                  FAQ
                </Link>
              </li>
            </ul>
          </div>

          {/* Sports */}
          <div className="space-y-4">
            <h3 className="font-display font-semibold text-lg">Sports</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/boxes?sport=cricket" className="text-muted-foreground hover:text-primary transition-colors">
                  Cricket
                </Link>
              </li>
              <li>
                <Link to="/boxes?sport=football" className="text-muted-foreground hover:text-primary transition-colors">
                  Football
                </Link>
              </li>
              <li>
                <Link to="/boxes?sport=tennis" className="text-muted-foreground hover:text-primary transition-colors">
                  Tennis
                </Link>
              </li>
              <li>
                <Link to="/boxes?sport=badminton" className="text-muted-foreground hover:text-primary transition-colors">
                  Badminton
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact Info */}
          <div className="space-y-4">
            <h3 className="font-display font-semibold text-lg">Contact Info</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Mail size={16} className="text-primary" />
                <span className="text-muted-foreground">support@bookmybox.com</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone size={16} className="text-primary" />
                <span className="text-muted-foreground">+91 98253 27667</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin size={16} className="text-primary" />
                <span className="text-muted-foreground">Ahmedabad, Gujarat, India</span>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-border mt-8 pt-8 text-center">
          <p className="text-muted-foreground text-sm">
            © {currentYear} BookMyBox. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}

export default Footer