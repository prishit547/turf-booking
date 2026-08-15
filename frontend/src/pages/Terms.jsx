import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ScrollText, ShieldCheck, Users, Wallet, Gavel, AlertTriangle } from 'lucide-react'
import { animations, useScrollAnimation } from '../utils/animations'
import { Card, Badge } from '../components/ui'

const sections = [
  {
    id: 'acceptance',
    title: '1. Acceptance of these Terms',
    body: [
      'These Terms of Service ("Terms") govern your access to and use of BookMyBox — the website, mobile experience, and any related services (together, the "Platform"). By creating an account, browsing facility listings, or making a booking, you agree to be bound by these Terms. If you do not agree, please do not use the Platform.',
      'BookMyBox is operated from India, and these Terms are written with that in mind — see Section 9 for governing law.',
    ],
  },
  {
    id: 'eligibility',
    title: '2. Accounts & Eligibility',
    body: [
      'You must provide accurate, current information when creating an account — including your name, email address, phone number, and location — and keep it up to date. You are responsible for all activity that happens under your account, and for keeping your password confidential.',
      'The Platform supports three kinds of accounts: Players (users who browse and book facilities), Facility Owners (who list and manage venues), and Platform Admins. You may sign up directly with an email and password, or via Google sign-in. Facility Owners additionally provide a business name at signup and may be asked to complete an identity/business verification step (see the Privacy Policy for what that involves).',
      'You must not create an account on behalf of someone else without their permission, or maintain more than one account to circumvent limits, coupons, or rewards.',
    ],
  },
  {
    id: 'bookings',
    title: '3. Booking & Payment Terms',
    body: [
      'When you book a facility, you\'re entering into a booking for a specific box, date, start time, and duration (bookings run between 1 and 6 hours, and must fall within the facility\'s posted opening and closing hours). You are responsible for the accuracy of the booking details you submit and for arriving on time — the Platform relies on the information you provide to hold the slot and to coordinate with the facility owner.',
      'Prices shown at the time of booking include any peak-hour pricing rules the facility owner has configured, minus any valid coupon or redeem code you apply. Unless you choose to pay using your in-app wallet balance, payment for a booking is made directly at the venue — the Platform does not currently process card, UPI, or net-banking payments online. If your wallet balance covers the full amount, your booking is marked paid at the time of booking; otherwise the remaining balance is due at the venue.',
      'Coupons and redeem codes are subject to their own validity windows, usage limits, and facility restrictions, and may be withdrawn or changed at any time without notice for future bookings.',
    ],
  },
  {
    id: 'cancellations',
    title: '4. Cancellations & Refunds',
    body: [
      'Bookings can be cancelled free of charge up to 2 hours before the scheduled start time. Cancellation requests inside that 2-hour window are not permitted through the Platform — by you, the facility owner, or an admin.',
      <>
        Refund mechanics depend on how a booking was paid — the full details, including how wallet-funded bookings are
        refunded, live in our dedicated{' '}
        <Link to="/cancellation-policy" className="text-primary hover:text-primary/80 underline underline-offset-2">
          Cancellation Policy
        </Link>
        , which forms part of these Terms.
      </>,
    ],
  },
  {
    id: 'owners',
    title: '5. Facility Owners are Independent Operators',
    body: [
      'Facility Owners who list venues on BookMyBox are independent, third-party venue operators — they are not employees, agents, or franchisees of BookMyBox. BookMyBox reviews and approves listings before they go live and provides the booking, scheduling, and payment-coordination infrastructure, but is not the operator of any venue and does not control day-to-day conditions, staffing, equipment, or safety at any facility.',
      'Facility Owners are responsible for the accuracy of their listings (pricing, amenities, opening hours, photos), for honoring confirmed bookings, and for the condition and safety of their premises. If you have an issue with a specific venue, please raise it with us through the Contact page so we can look into it — including, where appropriate, suspending or removing a listing.',
      'BookMyBox charges Facility Owners a commission on completed bookings made through the Platform, deducted from their payouts. Commission rates are set by BookMyBox and may vary by owner or sport.',
    ],
  },
  {
    id: 'wallet',
    title: '6. Wallet, Cashback & Rewards',
    body: [
      'The Platform includes an in-app wallet that can hold cashback, refunds, and other promotional credit, along with scratch-card and spin-the-wheel rewards and redeemable codes. Wallet balance is platform credit only — it has no cash value outside BookMyBox, cannot be withdrawn to a bank account, and can only be applied toward bookings made on the Platform.',
      'Promotional rewards (cashback rates, scratch cards, spin rewards, redeem codes) are offered at BookMyBox\'s discretion and may be changed, paused, or withdrawn at any time for future activity, without affecting wallet credit you\'ve already earned.',
    ],
  },
  {
    id: 'conduct',
    title: '7. Acceptable Use',
    body: [
      'You agree not to: submit false or misleading booking details; make bookings you do not intend to honor with the aim of blocking a slot for others; abuse coupons, redeem codes, or referral/reward mechanics; post fake or manipulated reviews; harass facility owners, staff, or other players; or attempt to access accounts, data, or systems you\'re not authorized to access.',
      'We may warn, suspend, or terminate accounts that violate these Terms, and may cancel bookings associated with abusive activity.',
    ],
  },
  {
    id: 'liability',
    title: '8. Disclaimers & Limitation of Liability',
    body: [
      'The Platform is provided "as is." BookMyBox facilitates discovery and booking of third-party venues but is not responsible for injuries, property damage, or disputes arising from your use of a facility itself — those are between you and the Facility Owner, though we\'re glad to help mediate.',
      'To the fullest extent permitted by law, BookMyBox\'s liability for any claim relating to the Platform is limited to the amount you actually paid through the Platform for the booking giving rise to the claim.',
    ],
  },
  {
    id: 'law',
    title: '9. Governing Law & Changes',
    body: [
      'These Terms are governed by the laws of India, and any disputes will be subject to the exclusive jurisdiction of the courts of Ahmedabad, Gujarat.',
      'We may update these Terms from time to time as the Platform evolves. We\'ll update the "Last updated" date below when we do — continued use of the Platform after a change means you accept the revised Terms.',
    ],
  },
]

const Terms = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="pt-32 pb-16 px-4 sm:px-6 lg:px-8">
        <motion.div className="max-w-3xl mx-auto text-center" {...animations.slideInUp} {...useScrollAnimation()}>
          <Badge tone="primary" size="md" className="mb-6">
            <ScrollText size={14} />
            Legal
          </Badge>
          <h1 className="font-display font-black uppercase tracking-tight text-5xl sm:text-6xl lg:text-7xl leading-[0.95] text-foreground">
            Terms of Service
          </h1>
          <p className="text-lg lg:text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto mt-6">
            The rules of the road for booking and listing sports facilities on BookMyBox.
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
              { icon: Users, label: 'Independent owners', body: 'Facility owners run their own venues — BookMyBox connects you to them.' },
              { icon: Wallet, label: 'Pay at venue or wallet', body: 'No online gateway yet — pay on arrival, or use in-app wallet credit.' },
              { icon: ShieldCheck, label: '2-hour cancellation', body: 'Free to cancel until 2 hours before your slot, every time.' },
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
                  <Gavel size={20} strokeWidth={1.75} />
                </div>
                <div>
                  <h2 className="font-display font-semibold text-xl text-foreground mb-2">Questions about these Terms?</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Reach out any time at{' '}
                    <a href="mailto:support@bookmybox.com" className="text-primary hover:text-primary/80 underline underline-offset-2">
                      support@bookmybox.com
                    </a>{' '}
                    or call +91 98253 27667. You can also see our{' '}
                    <Link to="/privacy" className="text-primary hover:text-primary/80 underline underline-offset-2">Privacy Policy</Link>{' '}
                    and{' '}
                    <Link to="/cancellation-policy" className="text-primary hover:text-primary/80 underline underline-offset-2">Cancellation Policy</Link>.
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>

          <motion.div {...animations.slideInUp} {...useScrollAnimation()} className="flex items-start gap-3 text-sm text-muted-foreground px-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <p>This page is a plain-language summary of our terms for a small, growing platform — not a substitute for independent legal advice if you need it.</p>
          </motion.div>
        </div>
      </section>
    </div>
  )
}

export default Terms
