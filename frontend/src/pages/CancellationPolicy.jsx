import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Timer, Wallet, Ban, Bell, RefreshCw, Mail } from 'lucide-react'
import { animations, useScrollAnimation } from '../utils/animations'
import { Card, Badge } from '../components/ui'

const sections = [
  {
    id: 'overview',
    title: '1. Overview',
    body: [
      'This policy explains when you can cancel a booking on BookMyBox, what happens to any money you\'ve put toward it, and how cancellations initiated by a facility owner or admin are handled. It applies to every booking made through the platform, regardless of sport or venue.',
    ],
  },
  {
    id: 'window',
    title: '2. The 2-Hour Cancellation Window',
    body: [
      'You can cancel a confirmed booking free of charge any time up until 2 hours before its scheduled start time. Once you\'re inside that 2-hour window, the cancel action is blocked for everyone — this applies equally whether you, the facility owner, or a platform admin is the one trying to cancel. There are no exceptions made through the app itself; if something urgent comes up inside the window, contact us directly (see Section 6) and we\'ll do what we reasonably can.',
      'A booking can only be cancelled once — trying to cancel an already-cancelled booking will simply tell you it\'s already cancelled.',
    ],
  },
  {
    id: 'how',
    title: '3. How to Cancel',
    body: [
      'Open the booking from your Bookings tab or its booking details page and use the Cancel action. You can optionally leave a reason, which is shown to the other party. The cancellation takes effect immediately and cannot be undone — if you change your mind, you\'ll need to make a new booking, subject to availability.',
    ],
  },
  {
    id: 'refunds',
    title: '4. How Refunds Work',
    body: [
      'BookMyBox does not currently integrate an external payment gateway, so how a refund works depends on how the booking was paid for:',
      'Paid with wallet credit: if any part of your booking was paid using your in-app wallet balance, that exact amount is credited straight back to your wallet the moment the booking is cancelled — instantly, automatically, no request needed.',
      'Paid at the venue: most bookings are paid for in person when you arrive, which means nothing was actually collected by the platform up front. Cancelling one of these simply cancels the booking — there\'s no online charge to reverse, since none was made.',
      'There is currently no mechanism to refund money to an external bank account, UPI ID, or card, because no booking payment is ever taken through an external gateway in the first place. Any refund the platform can issue lands in your BookMyBox wallet, ready to use on a future booking.',
    ],
  },
  {
    id: 'owner-cancel',
    title: '5. If a Facility Owner or Admin Cancels Your Booking',
    body: [
      'Occasionally a facility owner (or an admin, on their behalf) may need to cancel a confirmed booking — for example, if a venue becomes unavailable. The same 2-hour cutoff applies to them too, and you\'ll get an in-app notification explaining the cancellation, including any reason provided.',
      'Any wallet amount you\'d put toward that booking is refunded to your wallet in exactly the same way as a self-initiated cancellation. If the slot you lost had other players waitlisted for it, cancelling also frees it up and notifies whoever was next in line.',
    ],
  },
]

const CancellationPolicy = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="pt-32 pb-16 px-4 sm:px-6 lg:px-8">
        <motion.div className="max-w-3xl mx-auto text-center" {...animations.slideInUp} {...useScrollAnimation()}>
          <Badge tone="primary" size="md" className="mb-6">
            <Timer size={14} />
            Legal
          </Badge>
          <h1 className="font-display font-black uppercase tracking-tight text-5xl sm:text-6xl lg:text-7xl leading-[0.95] text-foreground">
            Cancellation Policy
          </h1>
          <p className="text-lg lg:text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto mt-6">
            Simple, predictable rules for cancelling a booking — and getting your money back when it applies.
          </p>
          <Badge tone="neutral" size="sm" className="mt-6">Last updated: August 2026</Badge>
        </motion.div>
      </section>

      {/* Quick highlights */}
      <section className="pb-4 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-3 gap-6"
            variants={animations.staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
          >
            {[
              { icon: Timer, label: 'Cancel up to 2 hours before', body: 'Free cancellation any time until 2 hours before your slot starts.' },
              { icon: Wallet, label: 'Wallet refunds are instant', body: 'Anything paid from your wallet is credited straight back on cancellation.' },
              { icon: Ban, label: 'No refund gateway yet', body: 'We can\'t refund to a card or bank account — there\'s no external payment gateway in the app.' },
            ].map((item) => (
              <motion.div key={item.label} variants={animations.staggerItem}>
                <Card className="h-full">
                  <div className="w-11 h-11 rounded-xl bg-primary/15 text-primary flex items-center justify-center mb-4">
                    <item.icon size={20} strokeWidth={1.75} />
                  </div>
                  <h3 className="font-display font-semibold text-foreground mb-1.5">{item.label}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.body}</p>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Sections */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {sections.map((section) => (
            <motion.div
              key={section.id}
              id={section.id}
              {...animations.slideInUp}
              initial="initial"
              whileInView="animate"
              viewport={{ once: true, amount: 0.3 }}
            >
              <Card padding="lg">
                <h2 className="font-display font-semibold text-2xl text-foreground mb-4">{section.title}</h2>
                <div className="space-y-4 text-muted-foreground leading-relaxed">
                  {section.body.map((paragraph, idx) => (
                    <p key={idx}>{paragraph}</p>
                  ))}
                </div>
              </Card>
            </motion.div>
          ))}

          <motion.div {...animations.slideInUp} {...useScrollAnimation()}>
            <Card padding="lg" className="border-primary/30">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
                  <Bell size={20} strokeWidth={1.75} />
                </div>
                <div>
                  <h2 className="font-display font-semibold text-xl text-foreground mb-2">On a waitlist?</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    If a slot you wanted opens up because someone else cancelled, we notify you the moment it happens —
                    but it&apos;s first-come, first-served, so it&apos;s worth booking quickly.
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>

          <motion.div {...animations.slideInUp} {...useScrollAnimation()}>
            <Card padding="lg" className="border-primary/30">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
                  <Mail size={20} strokeWidth={1.75} />
                </div>
                <div>
                  <h2 className="font-display font-semibold text-xl text-foreground mb-2">Need help with a specific booking?</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Email{' '}
                    <a href="mailto:support@bookmybox.com" className="text-primary hover:text-primary/80 underline underline-offset-2">
                      support@bookmybox.com
                    </a>{' '}
                    or call +91 98253 27667. For the broader rules around bookings and payments, see our{' '}
                    <Link to="/terms" className="text-primary hover:text-primary/80 underline underline-offset-2">Terms of Service</Link>.
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>

          <motion.div {...animations.slideInUp} {...useScrollAnimation()} className="flex items-start gap-3 text-sm text-muted-foreground px-2">
            <RefreshCw size={16} className="shrink-0 mt-0.5" />
            <p>This policy reflects exactly how cancellations and refunds work in the app today, including the fact that there&apos;s no external payment gateway yet.</p>
          </motion.div>
        </div>
      </section>
    </div>
  )
}

export default CancellationPolicy
