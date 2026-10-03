import { useState, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Target, Users, Award, Zap, Heart, Shield, ArrowRight, Star } from 'lucide-react'
import { animations, useScrollAnimation } from '../utils/animations'
import { Button, Card, Badge } from '../components/ui'
import useCountAnimation from '../hooks/useCountAnimation'
import { api } from '../api.jsx'

import teamRochan from '../assets/team_rochan.jpg'
import teamKhush from '../assets/team_khush.jpg'
import teamPushya from '../assets/team_pushya.jpg'
import teamSneha from '../assets/team_sneha.jpg'
import aboutStory from '../assets/about_story.jpg'

const features = [
  {
    icon: Target,
    title: 'Our Mission',
    description: 'To make sports accessible to everyone by providing easy booking of premium sports facilities across India.'
  },
  {
    icon: Users,
    title: 'Community First',
    description: 'Building a community of sports enthusiasts who can connect, play, and grow together.'
  },
  {
    icon: Award,
    title: 'Quality Assured',
    description: 'All our partner facilities are verified and maintain the highest standards of quality and safety.'
  },
  {
    icon: Zap,
    title: 'Instant Booking',
    description: 'Book your favorite sports box in seconds with our streamlined booking process.'
  },
  {
    icon: Heart,
    title: 'Passion Driven',
    description: 'Created by sports lovers, for sports lovers. We understand what players need.'
  },
  {
    icon: Shield,
    title: 'Secure & Safe',
    description: 'Your personal data is protected with industry-leading security measures.'
  }
]

const team = [
  {
    name: 'Rochan Shah',
    role: 'Founder & CEO',
    image: teamRochan,
    bio: 'Tech enthusiast with expertise in building scalable platforms.'
  },
  {
    name: 'Khush Shah',
    role: 'CTO',
    image: teamKhush,
    bio: 'Passionate about sports and technology.'
  },
  {
    name: 'Pushya Shah',
    role: 'Head of Operations',
    image: teamPushya,
    bio: 'Sports facility management expert with 10+ years experience.'
  },
  {
    name: 'Sneha Reddy',
    role: 'Head of Marketing',
    image: teamSneha,
    bio: 'Digital marketing specialist passionate about sports and community building.'
  }
]

function AnimatedStatCard({ stat, index }) {
  const count = useCountAnimation(stat.number, 2000, true)

  return (
    <motion.div variants={animations.staggerItem} transition={{ delay: index * 0.05 }}>
      <Card className="text-center">
        <div className="font-display text-3xl lg:text-4xl text-foreground tabular-nums mb-1">
          {count}
        </div>
        <div className="text-muted-foreground text-sm font-medium">{stat.label}</div>
      </Card>
    </motion.div>
  )
}

const About = () => {
  // Real platform counts, not the hardcoded "500+"-style copy this section
  // used to ship with — starts at 0 so the count-up animation always has
  // somewhere to animate from while the real numbers load.
  const [platformStats, setPlatformStats] = useState({ facilities: 0, cities: 0, users: 0, bookings_completed: 0 })

  useEffect(() => {
    api.get('/boxes/public/stats/').then((res) => setPlatformStats(res.data)).catch(() => {})
  }, [])

  const stats = [
    { number: `${platformStats.facilities}+`, label: 'Sports Facilities' },
    { number: `${platformStats.cities}+`, label: 'Cities' },
    { number: `${platformStats.users}+`, label: 'Happy Users' },
    { number: `${platformStats.bookings_completed}+`, label: 'Bookings Completed' },
  ]

  return (
    <div className="min-h-screen">
      <Helmet>
        <title>About Us | BoxNplay</title>
        <meta name="description" content="Learn about BoxNplay, India's sports facility booking platform connecting players with premium cricket, football, badminton, and other sports venues." />
        <link rel="canonical" href="https://boxnplay.com/about" />
        <meta property="og:title" content="About Us | BoxNplay" />
        <meta property="og:description" content="Learn about BoxNplay, India's sports facility booking platform connecting players with premium cricket, football, badminton, and other sports venues." />
        <meta property="og:url" content="https://boxnplay.com/about" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="About Us | BoxNplay" />
        <meta name="twitter:description" content="Learn about BoxNplay, India's sports facility booking platform connecting players with premium cricket, football, badminton, and other sports venues." />
      </Helmet>
      {/* Hero */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div {...animations.slideInUp} {...useScrollAnimation()}>
            <Badge tone="primary" size="md" className="mb-6">
              India&apos;s #1 Sports Booking Platform
            </Badge>

            <h1 className="font-display font-black uppercase text-5xl lg:text-7xl leading-[0.95] tracking-tight text-foreground">
              About BoxNplay
            </h1>
            <p className="text-lg lg:text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto mt-6">
              We&apos;re revolutionizing how people discover, book, and enjoy sports facilities.
              Our platform connects sports enthusiasts with premium venues across India,
              making it easier than ever to play your favorite sport.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center mt-9">
              <Button as={Link} to="/boxes" size="lg" iconRight={<ArrowRight size={18} />}>
                Explore Facilities
              </Button>
              <Button as={Link} to="/contact" variant="outline" size="lg" icon={<Heart size={18} />}>
                Join Our Community
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 border-y border-border">
        <div className="max-w-5xl mx-auto">
          <motion.div
            className="grid grid-cols-2 lg:grid-cols-4 gap-6"
            variants={animations.staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
          >
            {stats.map((stat, index) => (
              <AnimatedStatCard key={stat.label} stat={stat} index={index} />
            ))}
          </motion.div>
        </div>
      </section>

      {/* Why choose us */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <motion.div {...animations.slideInUp} {...useScrollAnimation()} className="text-center mb-14">
            <h2 className="font-display font-extrabold uppercase tracking-tight text-3xl sm:text-4xl text-foreground">
              Why Choose BoxNplay?
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mt-3">
              We&apos;re more than just a booking platform. We&apos;re your partner in making sports accessible and enjoyable.
            </p>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            variants={animations.staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
          >
            {features.map((feature) => (
              <motion.div key={feature.title} variants={animations.staggerItem}>
                <Card className="text-center h-full">
                  <div className="w-14 h-14 mx-auto mb-5 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
                    <feature.icon size={26} strokeWidth={1.75} />
                  </div>
                  <h3 className="font-display font-semibold text-lg text-foreground mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Team */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-secondary/40">
        <div className="max-w-7xl mx-auto">
          <motion.div {...animations.slideInUp} {...useScrollAnimation()} className="text-center mb-14">
            <h2 className="font-display font-extrabold uppercase tracking-tight text-3xl sm:text-4xl text-foreground">
              Meet Our Dream Team
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mt-3">
              Passionate individuals working together to transform the sports booking experience in India.
            </p>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
            variants={animations.staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
          >
            {team.map((member) => (
              <motion.div key={member.name} variants={animations.staggerItem}>
                <Card className="text-center h-full">
                  <div className="relative w-24 h-24 mx-auto mb-5">
                    <img
                      src={member.image}
                      alt={member.name}
                      className="w-24 h-24 rounded-full object-cover ring-4 ring-primary/20"
                    />
                    <div className="absolute -top-1 -right-1 bg-primary w-7 h-7 rounded-full flex items-center justify-center">
                      <Star size={14} className="text-primary-foreground fill-current" />
                    </div>
                  </div>

                  <h3 className="font-display font-semibold text-lg text-foreground mb-2">
                    {member.name}
                  </h3>
                  <Badge tone="primary" size="sm" className="mb-4">
                    {member.role}
                  </Badge>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {member.bio}
                  </p>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Our Story */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
              <h2 className="font-display font-extrabold uppercase tracking-tight text-3xl sm:text-4xl text-foreground mb-8">
                Our Story
              </h2>
              <div className="space-y-5 text-muted-foreground leading-relaxed">
                <p className="text-lg">
                  BoxNplay was born from a simple frustration: finding and booking quality sports facilities was unnecessarily complicated. Our founders, all avid sports players, experienced firsthand the challenges of coordinating games with friends.
                </p>
                <p className="text-lg">
                  In 2025, we set out to solve this problem by creating a platform that would make sports booking as easy as ordering food online. We started with a handful of cricket boxes in Mumbai and have since expanded to over 500 facilities across 50+ cities.
                </p>
                <p className="text-lg">
                  Today, BoxNplay is India&apos;s leading sports facility booking platform, trusted by thousands of players and facility owners. But we&apos;re just getting started &ndash; our vision is to make sports accessible to every Indian, in every city, at every skill level.
                </p>
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                <Badge tone="primary" variant="soft" size="md">Founded in 2025</Badge>
                <Badge tone="secondary" variant="soft" size="md">500+ Facilities</Badge>
                <Badge tone="primary" variant="soft" size="md">50+ Cities</Badge>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
              <Card padding="none" className="overflow-hidden relative">
                <img
                  src={aboutStory}
                  alt="Sports facility"
                  className="w-full h-96 object-cover"
                />
                <div className="absolute top-4 right-4 bg-primary text-primary-foreground font-display font-black px-4 py-2 rounded-full shadow-glow">
                  #1
                </div>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="bg-elevated border border-border shadow-lift rounded-2xl px-8 py-14 lg:py-20 text-center"
          >
            <h2 className="font-display font-black uppercase text-3xl sm:text-4xl lg:text-5xl text-foreground mb-5">
              Ready to Play?
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-9">
              Whether you&apos;re a player looking for your next game or a facility owner wanting to reach more customers, we&apos;re here to help you succeed.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button as={Link} to="/boxes" size="lg" iconRight={<ArrowRight size={18} />}>
                Start Playing Today
              </Button>
              <Button as={Link} to="/contact" size="lg" variant="outline" icon={<Users size={18} />}>
                Partner With Us
              </Button>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  )
}

export default About
