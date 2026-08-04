import { useEffect, useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { ArrowRight, Users, Shield, Zap, Heart } from 'lucide-react'
import { useBox } from '../context/BoxContext'
import { Loader } from '../components/ui'
import Chatbot from '../components/common/Chatbot'
import { useAuth } from '../api.jsx'
import useCountAnimation from '../hooks/useCountAnimation'
import { animations } from '../utils/animations'
import { Button, Card } from '../components/ui'
import { Reveal, WordReveal } from '../components/motion/Reveal'
import { MagneticButton } from '../components/motion/MagneticButton'
import { BoxCard } from '../components/boxes/BoxCard'
import { CricketIcon, FootballIcon, TennisIcon, BadmintonIcon, BasketballIcon, PickleballIcon } from '../components/icons/SportIcons'
import heroBanner from '../assets/hero_banner.jpg'

const stats = [
  { number: 150, suffix: '+', label: 'Sports boxes' },
  { number: 2500, suffix: '+', label: 'Happy users' },
  { number: 8750, suffix: '+', label: 'Total bookings' },
  { number: 4.8, suffix: '★', label: 'Average rating' },
]

const sports = [
  { name: 'Cricket', Icon: CricketIcon, description: 'Box cricket, practice nets' },
  { name: 'Football', Icon: FootballIcon, description: '5-a-side, 7-a-side' },
  { name: 'Tennis', Icon: TennisIcon, description: 'Singles & doubles courts' },
  { name: 'Badminton', Icon: BadmintonIcon, description: 'Indoor courts' },
  { name: 'Basketball', Icon: BasketballIcon, description: 'Half & full courts' },
  { name: 'Pickleball', Icon: PickleballIcon, description: 'Modern courts' },
]

const features = [
  { Icon: Shield, title: 'Secure booking', text: 'Advanced security measures ensure your bookings and personal data are always protected.' },
  { Icon: Zap, title: 'Instant confirmation', text: 'Get immediate confirmations with real-time availability and seamless calendar integration.' },
  { Icon: Heart, title: 'Community driven', text: 'Join a vibrant community of sports enthusiasts and take part in tournaments and events.' },
]

function StatItem({ stat, index, startAnimation }) {
  const animatedValue = useCountAnimation(stat.number, 1600 + index * 150, startAnimation)
  return (
    <div className="text-center">
      <div className="font-display text-3xl sm:text-4xl font-bold text-foreground tabular-nums">
        {startAnimation ? animatedValue : '0'}{stat.suffix}
      </div>
      <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
    </div>
  )
}

const Home = () => {
  const { featuredBoxes, popularBoxes, fetchFeaturedBoxes, fetchPopularBoxes } = useBox()
  const { isAuthenticated } = useAuth()
  const [startCounting, setStartCounting] = useState(false)
  const statsRef = useRef(null)

  useEffect(() => {
    fetchFeaturedBoxes()
    fetchPopularBoxes()
  }, [fetchFeaturedBoxes, fetchPopularBoxes])

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !startCounting) setStartCounting(true)
      },
      { threshold: 0.3 }
    )
    const node = statsRef.current
    if (node) observer.observe(node)
    return () => { if (node) observer.unobserve(node) }
  }, [startCounting])

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative h-[78vh] min-h-[560px] mt-16 overflow-hidden">
        <img
          src={heroBanner}
          alt="A premium sports box facility"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/20" />
        <div className="relative h-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col justify-end pb-14">
          <Reveal y={16} className="max-w-2xl">
            <span className="inline-block text-sm font-semibold uppercase tracking-widest text-primary mb-4">
              India&rsquo;s sports box booking platform
            </span>
            <h1 className="font-display font-black uppercase text-5xl sm:text-6xl lg:text-7xl leading-[0.95] tracking-tight text-foreground">
              <WordReveal text="Book your perfect sports box" />
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed max-w-xl mt-6">
              Browse premium facilities, check real-time availability, and lock in your slot in seconds — cricket, football, tennis, and more.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 mt-8">
              <MagneticButton onClick={() => {}} className="text-base">
                <Link to="/boxes" className="inline-flex items-center gap-2">
                  Explore boxes <ArrowRight size={18} />
                </Link>
              </MagneticButton>
              <Button as={Link} to="/about" variant="outline" size="lg">
                Learn more
              </Button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Stats strip */}
      <section className="py-12 border-y border-border" ref={statsRef}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, index) => (
            <StatItem key={stat.label} stat={stat} index={index} startAnimation={startCounting} />
          ))}
        </div>
      </section>

      {/* Popular Sports */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <Reveal className="text-center mb-14">
            <h2 className="font-display font-extrabold uppercase tracking-tight text-3xl sm:text-4xl text-foreground">
              Pick your sport
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mt-3">
              Premium facilities for your favorite sports, across multiple cities.
            </p>
          </Reveal>

          <motion.div
            className="grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6"
            variants={animations.staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
          >
            {sports.map((sport) => (
              <motion.div key={sport.name} variants={animations.staggerItem}>
                <Link to={`/boxes?sport=${sport.name.toLowerCase()}`}>
                  <Card interactive className="text-center h-full">
                    <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
                      <sport.Icon size={26} />
                    </div>
                    <h3 className="font-display font-semibold text-foreground mb-1">
                      {sport.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">{sport.description}</p>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Why choose us */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-card/40">
        <div className="max-w-7xl mx-auto">
          <Reveal className="text-center mb-14">
            <h2 className="font-display font-extrabold uppercase tracking-tight text-3xl sm:text-4xl text-foreground">
              Why choose BookMyBox?
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mt-3">
              A booking experience built for real players, not just browsers.
            </p>
          </Reveal>

          <motion.div
            className="grid md:grid-cols-3 gap-6"
            variants={animations.staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
          >
            {features.map((feature) => (
              <motion.div key={feature.title} variants={animations.staggerItem}>
                <Card className="h-full">
                  <div className="w-14 h-14 rounded-xl bg-turf/15 text-turf flex items-center justify-center mb-5">
                    <feature.Icon size={26} strokeWidth={1.75} />
                  </div>
                  <h3 className="font-display font-semibold text-lg text-foreground mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">{feature.text}</p>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Featured Boxes */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <Reveal className="text-center mb-14">
            <h2 className="font-display font-extrabold uppercase tracking-tight text-3xl sm:text-4xl text-foreground">
              Featured boxes
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mt-3">
              Handpicked facilities with top ratings and exceptional service.
            </p>
          </Reveal>

          {featuredBoxes.length === 0 ? (
            <div className="flex justify-center">
              <Loader text="Loading featured boxes..." />
            </div>
          ) : (
            <motion.div
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              variants={animations.staggerContainer}
              initial="initial"
              whileInView="animate"
              viewport={{ once: true }}
            >
              {featuredBoxes.map((box) => (
                <motion.div key={box.id} variants={animations.staggerItem}>
                  <BoxCard box={box} />
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </section>

      {/* Trending Now */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-card/40">
        <div className="max-w-7xl mx-auto">
          <Reveal className="text-center mb-14">
            <h2 className="font-display font-extrabold uppercase tracking-tight text-3xl sm:text-4xl text-foreground">
              Trending now
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mt-3">
              Most popular boxes based on bookings and community ratings.
            </p>
          </Reveal>

          {popularBoxes.length === 0 ? (
            <div className="flex justify-center">
              <Loader text="Loading popular boxes..." />
            </div>
          ) : (
            <motion.div
              className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6"
              variants={animations.staggerContainer}
              initial="initial"
              whileInView="animate"
              viewport={{ once: true }}
            >
              {popularBoxes.map((box) => (
                <motion.div key={box.id} variants={animations.staggerItem}>
                  <BoxCard box={box} compact />
                </motion.div>
              ))}
            </motion.div>
          )}
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
            className="relative overflow-hidden rounded-3xl border border-border bg-card px-8 py-14 lg:py-20 text-center"
          >
            <div className="pointer-events-none absolute -top-24 -right-24 w-96 h-96 rounded-full bg-primary/25 blur-3xl" />
            <div className="relative">
              <h2 className="font-display font-black uppercase text-3xl sm:text-4xl lg:text-5xl tracking-tight text-foreground mb-5">
                Ready to play?
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-9">
                Join thousands of sports enthusiasts who trust BookMyBox for their game time.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
                <MagneticButton>
                  <Link to="/boxes" className="inline-flex items-center gap-2">
                    Browse all boxes <ArrowRight size={18} />
                  </Link>
                </MagneticButton>
                {!isAuthenticated && (
                  <Button as={Link} to="/signup" size="lg" variant="outline" icon={<Users size={18} />}>
                    Create account
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-2xl mx-auto">
                {[
                  ['150+', 'Premium facilities'],
                  ['2.5K+', 'Happy members'],
                  ['8.7K+', 'Successful bookings'],
                  ['4.8★', 'Average rating'],
                ].map(([value, label]) => (
                  <div key={label} className="text-center">
                    <div className="font-display text-2xl text-foreground">{value}</div>
                    <div className="text-sm text-muted-foreground mt-1">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <Chatbot />
    </div>
  )
}

export default Home
