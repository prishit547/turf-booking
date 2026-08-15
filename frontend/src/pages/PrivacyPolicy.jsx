import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { motion } from 'framer-motion'
import { Lock, UserRound, FileCheck2, Database, ShieldCheck, Mail } from 'lucide-react'
import { animations, useScrollAnimation } from '../utils/animations'
import { Card, Badge } from '../components/ui'

const sections = [
  {
    id: 'scope',
    title: '1. Scope of this Policy',
    body: [
      'This Privacy Policy explains what personal information BoxNplay collects when you use our platform to browse, book, or list sports facilities, how we use it, and the choices you have. It applies to Players, Facility Owners, and anyone who contacts us through the Contact page.',
    ],
  },
  {
    id: 'collect',
    title: '2. Information We Collect',
    body: [
      'Account information: when you sign up, we collect your first and last name, email address, phone number, location, and password (or your Google account identifier if you sign up with Google). Facility Owners also provide a business name.',
      'Profile information: from your Profile page, you may optionally add a profile photo, date of birth, a short bio, your preferred sports, an emergency contact number, and a home address.',
      'Owner verification documents: if you register as a Facility Owner, we may collect a PAN number, GST number, and a supporting verification document (e.g. a business registration or ID document) as part of our owner-verification review. This is collected from Facility Owners specifically — Players are never asked for this information.',
      'Booking & activity data: every booking you make — the facility, date, time, duration, amount, and status — is stored against your account, along with your wallet balance and full wallet transaction history (cashback, refunds, redeem codes, scratch-card and spin rewards, and spend), any coupons you\'ve used, reviews you\'ve written, and in-app notifications.',
      'Communications: if you contact us through the Contact page, we store the name, email, phone, subject, and message you submit so we can respond.',
    ],
  },
  {
    id: 'use',
    title: '3. How We Use Your Information',
    body: [
      'We use your information to: create and secure your account; process and manage bookings, including sharing the details a Facility Owner needs to honor your booking (see Section 5); operate the wallet, cashback, and rewards features; send booking confirmations, cancellations, and other account notifications; respond to support requests; and detect and prevent fraud or abuse (for example, coupon or booking abuse).',
      'We do not use your personal information to serve third-party advertising, and we do not sell your personal information.',
    ],
  },
  {
    id: 'payments',
    title: '4. Payments & the In-App Wallet',
    body: [
      'BoxNplay does not currently integrate a card, UPI, or bank payment gateway — most bookings are paid for directly at the venue, so we never collect or store your card, UPI, or bank account details. The one exception is the in-app wallet: wallet credit (from cashback, refunds, or rewards) is tracked and can be applied toward bookings, but it is platform-internal credit only, not a connection to any real bank account or payment method.',
    ],
  },
  {
    id: 'verification',
    title: '5. Owner Verification Documents',
    body: [
      'PAN numbers, GST numbers, and verification documents submitted by Facility Owners are used solely to review and approve owner accounts, and are only accessible to platform admins performing that review. They are not shown to Players, other Facility Owners, or used for any purpose beyond verification.',
    ],
  },
  {
    id: 'sharing',
    title: '6. Sharing of Information',
    body: [
      'When you make a booking, we share the booking details and the contact information needed to fulfil it (typically your name and phone number) with the Facility Owner whose venue you booked, so they can coordinate the slot.',
      'We may share information with service providers who help us run the platform (for example, hosting and infrastructure providers), under obligations to protect it, and where required by law or to protect the rights, safety, or property of BoxNplay, our users, or the public. We do not sell personal information to third parties.',
    ],
  },
  {
    id: 'security',
    title: '7. Data Retention & Security',
    body: [
      'We retain account, booking, and wallet-transaction data for as long as your account is active, and for a reasonable period afterward to meet accounting, dispute-resolution, and legal obligations. We use reasonable technical and organizational measures (such as password hashing and access controls) to protect your information, but no online service can guarantee absolute security.',
    ],
  },
  {
    id: 'rights',
    title: '8. Your Choices & Rights',
    body: [
      'You can review and update most of your account and profile information any time from the Profile page. If you\'d like a copy of your data, or want your account and associated personal data deleted, contact us at the email below and we\'ll help — note that we may need to retain certain booking and financial records for a period after deletion where required by law.',
    ],
  },
  {
    id: 'children',
    title: '9. Children\'s Privacy',
    body: [
      'BoxNplay is intended for users old enough to independently enter into a booking agreement. We do not knowingly collect personal information from young children. If you believe a child has created an account without appropriate consent, please contact us and we\'ll take appropriate action.',
    ],
  },
  {
    id: 'changes',
    title: '10. Changes to this Policy',
    body: [
      'We may update this Privacy Policy as the platform evolves — for example, if we add new features that collect new kinds of data. We\'ll update the "Last updated" date below whenever we do.',
    ],
  },
]

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Privacy Policy | BoxNplay</title>
        <meta name="description" content="Read BoxNplay's Privacy Policy to learn what personal information we collect when you browse, book, or list sports facilities, and how we use it." />
        <link rel="canonical" href={`${window.location.origin}/privacy`} />
        <meta property="og:title" content="Privacy Policy | BoxNplay" />
        <meta property="og:description" content="Read BoxNplay's Privacy Policy to learn what personal information we collect when you browse, book, or list sports facilities, and how we use it." />
        <meta property="og:url" content={`${window.location.origin}/privacy`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Privacy Policy | BoxNplay" />
        <meta name="twitter:description" content="Read BoxNplay's Privacy Policy to learn what personal information we collect when you browse, book, or list sports facilities, and how we use it." />
      </Helmet>
      {/* Hero */}
      <section className="pt-32 pb-16 px-4 sm:px-6 lg:px-8">
        <motion.div className="max-w-3xl mx-auto text-center" {...animations.slideInUp} {...useScrollAnimation()}>
          <Badge tone="primary" size="md" className="mb-6">
            <Lock size={14} />
            Legal
          </Badge>
          <h1 className="font-display font-black uppercase tracking-tight text-5xl sm:text-6xl lg:text-7xl leading-[0.95] text-foreground">
            Privacy Policy
          </h1>
          <p className="text-lg lg:text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto mt-6">
            What we collect, why we collect it, and how we keep it safe.
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
              { icon: UserRound, label: 'Profile data you control', body: 'Photo, date of birth, bio, and address are all optional and editable.' },
              { icon: FileCheck2, label: 'KYC only for owners', body: 'PAN/GST/verification docs are collected from facility owners, never players.' },
              { icon: Database, label: 'No card or bank storage', body: 'No payment gateway yet, so we never hold your card or bank details.' },
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
                  <Mail size={20} strokeWidth={1.75} />
                </div>
                <div>
                  <h2 className="font-display font-semibold text-xl text-foreground mb-2">Privacy questions or requests</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Email us at{' '}
                    <a href="mailto:Info@boxnplay.com" className="text-primary hover:text-primary/80 underline underline-offset-2">
                      Info@boxnplay.com
                    </a>{' '}
                    or call +91 98253 27667 for anything related to your personal data, including access, correction, or
                    deletion requests. See also our{' '}
                    <Link to="/terms" className="text-primary hover:text-primary/80 underline underline-offset-2">Terms of Service</Link>.
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>

          <motion.div {...animations.slideInUp} {...useScrollAnimation()} className="flex items-start gap-3 text-sm text-muted-foreground px-2">
            <ShieldCheck size={16} className="shrink-0 mt-0.5" />
            <p>We built this policy to describe, in plain language, exactly what this platform actually does with your data today — not a generic boilerplate template.</p>
          </motion.div>
        </div>
      </section>
    </div>
  )
}

export default PrivacyPolicy
