import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { Home, Search } from 'lucide-react'
import { Button } from '../components/ui'

const NotFound = () => {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 sm:px-6 lg:px-8">
      <Helmet>
        <title>Page Not Found | BoxNplay</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center max-w-lg mx-auto"
      >
        <div className="font-display font-black text-8xl md:text-9xl leading-none text-primary">
          404
        </div>

        <h1 className="text-2xl md:text-3xl font-display font-extrabold uppercase tracking-tight text-foreground mt-4">
          This court doesn&apos;t exist
        </h1>

        <p className="text-muted-foreground leading-relaxed mt-4">
          The page you&apos;re looking for seems to have wandered off the field.
          Let&apos;s get you back to booking amazing sports facilities.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center mt-8">
          <Button as={Link} to="/" size="lg" icon={<Home size={18} />} className="min-w-[200px]">
            Go to Homepage
          </Button>
          <Button as={Link} to="/boxes" variant="outline" size="lg" icon={<Search size={18} />} className="min-w-[200px]">
            Browse Sports Boxes
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

export default NotFound
