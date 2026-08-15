import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Phone, MapPin, Clock, Send, MessageCircle, Sparkles, ArrowRight, CheckCircle, AlertCircle, ChevronDown } from 'lucide-react';
import { api } from '../api';
import { animations, useScrollAnimation } from '../utils/animations';
import { Button, Card, Input, Select, Badge } from '../components/ui';

const Contact = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: '',
    type: 'general'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');
  const [errors, setErrors] = useState({}); // State for validation errors
  const [openFaq, setOpenFaq] = useState(0);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear the error for the field being changed
    setErrors(prev => ({
      ...prev,
      [name]: '' // Clear specific error when input changes
    }));
  };

  const validateForm = () => {
    let newErrors = {};
    let isValid = true;

    // Name validation: required and at least 2 characters
    if (!formData.name.trim()) {
      newErrors.name = 'Full Name is required.';
      isValid = false;
    } else if (formData.name.trim().length < 2) {
      newErrors.name = 'Full Name must be at least 2 characters.';
      isValid = false;
    }

    // Email validation using a common regex pattern
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email.trim()) {
      newErrors.email = 'Email Address is required.';
      isValid = false;
    } else if (!emailRegex.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address.';
      isValid = false;
    }

    // Phone number validation: optional but if provided, must be a valid 10-digit Indian number
    // Regex for Indian mobile numbers: starts with 6, 7, 8, or 9, followed by 9 digits
    const indianPhoneRegex = /^[6-9]\d{9}$/;
    if (formData.phone.trim() && !indianPhoneRegex.test(formData.phone)) {
      newErrors.phone = 'Please enter a valid 10-digit Indian phone number (e.g., 9876543210).';
      isValid = false;
    }
    // If phone number was mandatory, uncomment the following:
    // if (!formData.phone.trim()) {
    //   newErrors.phone = 'Phone number is required.';
    //   isValid = false;
    // } else if (!indianPhoneRegex.test(formData.phone)) {
    //   newErrors.phone = 'Please enter a valid 10-digit Indian phone number.';
    //   isValid = false;
    // }


    // Subject validation: required
    if (!formData.subject.trim()) {
      newErrors.subject = 'Subject is required.';
      isValid = false;
    }

    // Message validation: required and at least 10 characters
    if (!formData.message.trim()) {
      newErrors.message = 'Message is required.';
      isValid = false;
    } else if (formData.message.trim().length < 10) {
      newErrors.message = 'Message must be at least 10 characters.';
      isValid = false;
    }

    setErrors(newErrors); // Update the errors state
    return isValid; // Return overall validity
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Perform client-side validation
    if (!validateForm()) {
      setSubmitMessage('Please correct the errors in the form before submitting.');
      // Keep isSubmitting false as we didn't attempt submission
      return;
    }

    setIsSubmitting(true);
    setSubmitMessage(''); // Clear previous messages before new attempt

    try {
      await api.post('/contact/', {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        subject: formData.subject,
        message: formData.message,
        inquiry_type: formData.type,
      });
      setSubmitMessage('Message sent successfully! We\'ll get back to you soon.');
      // Clear form data on successful submission
      setFormData({
        name: '',
        email: '',
        phone: '',
        subject: '',
        message: '',
        type: 'general'
      });
      setErrors({}); // Clear all validation errors on success
    } catch (error) {
      console.error('Contact form submit error:', error.response?.data || error.message);
      setSubmitMessage('Failed to send message. Please try again later.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const contactInfo = [
    {
      icon: Mail,
      title: 'Email Us',
      details: 'support@bookmybox.com',
      description: 'Send us an email anytime'
    },
    {
      icon: Phone,
      title: 'Call Us',
      details: '+91 98253 27667',
      description: 'Mon-Fri from 8am to 6pm'
    },
    {
      icon: MapPin,
      title: 'Visit Us',
      details: 'D/89 Ananya Society, Ahmedabad, Gujarat - 380050',
      description: 'Come say hello at our office'
    },
    {
      icon: Clock,
      title: 'Working Hours',
      details: 'Mon-Fri: 8am-6pm, Sat: 9am-4pm',
      description: 'We\'re here to help'
    }
  ];

  const faqItems = [
    {
      question: 'How do I book a sports box?',
      answer: 'Simply browse our available boxes, select your preferred date and time, and confirm your booking. You\'ll receive instant confirmation — payment is made directly at the venue.'
    },
    {
      question: 'Can I cancel my booking?',
      answer: 'Yes, you can cancel your booking free of charge up to 2 hours before the scheduled time. Cancellations within 2 hours of the booking time are not allowed.'
    },
    {
      question: 'How do I become a partner facility?',
      answer: 'Contact us through the form below or call our partnership team. We\'ll guide you through the onboarding process and requirements.'
    },
    {
      question: 'How do I pay for my booking?',
      answer: 'Payment is made directly at the venue when you arrive — no online payment is required to confirm your booking.'
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="pt-32 pb-16 px-4 sm:px-6 lg:px-8">
        <motion.div
          className="max-w-3xl mx-auto text-center"
          {...animations.slideInUp}
          {...useScrollAnimation()}
        >
          <Badge tone="primary" size="md" className="mb-6">
            <MessageCircle size={14} />
            We&apos;re here to help
          </Badge>
          <h1 className="font-display font-black uppercase tracking-tight text-5xl sm:text-6xl lg:text-7xl leading-[0.95] text-foreground">
            Get in touch
          </h1>
          <p className="text-lg lg:text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto mt-6">
            Have questions? We&apos;d love to hear from you. Send us a message and we&apos;ll respond as soon as possible.
          </p>
        </motion.div>
      </section>

      {/* Contact Info Cards */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-secondary/40">
        <div className="max-w-7xl mx-auto">
          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
            variants={animations.staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
          >
            {contactInfo.map((info) => (
              <motion.div key={info.title} variants={animations.staggerItem}>
                <Card className="text-center h-full">
                  <div className="w-14 h-14 mx-auto mb-5 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
                    <info.icon size={26} strokeWidth={1.75} />
                  </div>
                  <h3 className="font-display font-semibold text-lg text-foreground mb-2">
                    {info.title}
                  </h3>
                  <p className="text-foreground font-medium mb-1">{info.details}</p>
                  <p className="text-sm text-muted-foreground">{info.description}</p>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Contact Form & Sidebar */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            {/* Contact Form */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <Card id="contact-form" padding="lg">
                <div className="flex items-center mb-8">
                  <div className="w-11 h-11 rounded-xl bg-primary flex items-center justify-center mr-4 shrink-0">
                    <MessageCircle className="text-primary-foreground" size={20} />
                  </div>
                  <h2 className="font-display font-semibold text-2xl text-foreground">
                    Send us a message
                  </h2>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <Input
                      label="Full Name *"
                      type="text"
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      placeholder="Your full name"
                      error={errors.name}
                    />
                    <Input
                      label="Phone Number"
                      type="tel"
                      id="phone"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      placeholder="Your phone number"
                      error={errors.phone}
                    />
                  </div>

                  <Input
                    label="Email Address *"
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    placeholder="your.email@example.com"
                    error={errors.email}
                  />

                  <Select
                    label="Inquiry Type"
                    id="type"
                    name="type"
                    value={formData.type}
                    onChange={handleChange}
                  >
                    <option value="general">General Inquiry</option>
                    <option value="booking">Booking Support</option>
                    <option value="partnership">Partnership</option>
                    <option value="technical">Technical Issue</option>
                    <option value="feedback">Feedback</option>
                  </Select>

                  <Input
                    label="Subject *"
                    type="text"
                    id="subject"
                    name="subject"
                    value={formData.subject}
                    onChange={handleChange}
                    required
                    placeholder="Brief subject of your message"
                    error={errors.subject}
                  />

                  <div className="space-y-1.5">
                    <label htmlFor="message" className="block text-sm font-medium text-foreground">
                      Message *
                    </label>
                    <textarea
                      id="message"
                      name="message"
                      value={formData.message}
                      onChange={handleChange}
                      required
                      rows={5}
                      className={`w-full px-4 py-2.5 rounded-lg bg-elevated text-foreground border transition-colors duration-150 outline-none resize-none placeholder-muted-foreground focus:ring-2 focus:ring-primary/40 focus:border-primary ${errors.message ? 'border-danger' : 'border-input'}`}
                      placeholder="Tell us how we can help you..."
                    />
                    {errors.message && (
                      <motion.p
                        className="text-sm text-danger"
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        {errors.message}
                      </motion.p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    loading={isSubmitting}
                    fullWidth
                    size="lg"
                    className="group"
                    iconRight={<Send size={18} className="group-hover:translate-x-1 transition-transform" />}
                  >
                    {isSubmitting ? 'Sending...' : 'Send Message'}
                  </Button>

                  {submitMessage && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`text-center p-4 rounded-lg flex items-center justify-center gap-2 border ${
                        submitMessage.includes('successfully')
                          ? 'bg-success/10 border-success/30 text-success'
                          : 'bg-danger/10 border-danger/30 text-danger'
                      }`}
                    >
                      {submitMessage.includes('successfully') ? (
                        <CheckCircle size={20} className="shrink-0" />
                      ) : (
                        <AlertCircle size={20} className="shrink-0" />
                      )}
                      <span className="text-sm font-medium">{submitMessage}</span>
                    </motion.div>
                  )}
                </form>
              </Card>
            </motion.div>

            {/* Map & Additional Info */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="space-y-6"
            >
              {/* Map placeholder */}
              <Card padding="none" className="overflow-hidden">
                <div className="h-72 bg-background flex items-center justify-center">
                  <div className="text-center px-6">
                    <MapPin size={48} className="text-primary mx-auto mb-4" strokeWidth={1.5} />
                    <h3 className="font-display font-semibold text-xl text-foreground mb-1.5">Visit Our Office</h3>
                    <p className="text-muted-foreground text-sm mb-4">Ahmedabad, Gujarat</p>
                    <Badge tone="primary">Interactive map coming soon</Badge>
                  </div>
                </div>
              </Card>

              {/* Office Hours */}
              <Card>
                <div className="flex items-center mb-6">
                  <div className="w-11 h-11 rounded-xl bg-turf/15 text-turf flex items-center justify-center mr-4 shrink-0">
                    <Clock size={20} strokeWidth={1.75} />
                  </div>
                  <h3 className="font-display font-semibold text-lg text-foreground">Office Hours</h3>
                </div>
                <div className="space-y-2">
                  {[
                    { days: 'Monday - Friday', hours: '8:00 AM - 6:00 PM' },
                    { days: 'Saturday', hours: '9:00 AM - 4:00 PM' },
                    { days: 'Sunday', hours: 'Closed' }
                  ].map((schedule) => (
                    <div
                      key={schedule.days}
                      className="flex justify-between items-center p-3 bg-elevated/60 rounded-lg"
                    >
                      <span className="text-muted-foreground font-medium text-sm">{schedule.days}</span>
                      <span className="font-semibold text-foreground text-sm">{schedule.hours}</span>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Quick Links */}
              <Card>
                <div className="flex items-center mb-6">
                  <div className="w-11 h-11 rounded-xl bg-primary/15 text-primary flex items-center justify-center mr-4 shrink-0">
                    <ArrowRight size={20} strokeWidth={1.75} />
                  </div>
                  <h3 className="font-display font-semibold text-lg text-foreground">Quick Links</h3>
                </div>
                <div className="space-y-2">
                  {[
                    { title: 'Frequently Asked Questions', href: '#faq' },
                    { title: 'Support Center', href: 'mailto:support@bookmybox.com' },
                    { title: 'Partner with Us', href: '#contact-form' },
                  ].map((link) => (
                    <motion.a
                      key={link.title}
                      href={link.href}
                      className="flex items-center justify-between p-3 bg-elevated/60 rounded-lg text-primary hover:text-primary/80 font-medium text-sm group transition-colors"
                      whileHover={{ x: 4 }}
                      transition={{ duration: 0.2 }}
                    >
                      {link.title}
                      <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                    </motion.a>
                  ))}
                </div>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-secondary/40" id="faq">
        <div className="max-w-7xl mx-auto">
          <motion.div
            className="text-center mb-14"
            {...animations.slideInUp}
            {...useScrollAnimation()}
          >
            <Badge tone="secondary" size="md" className="mb-6">
              <Sparkles size={14} />
              Common questions
            </Badge>
            <h2 className="font-display font-extrabold uppercase tracking-wide text-3xl sm:text-4xl text-foreground">
              Frequently asked questions
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mt-3">
              Find quick answers to common questions about BookMyBox
            </p>
          </motion.div>

          <div className="max-w-3xl mx-auto">
            <motion.div
              className="space-y-4"
              variants={animations.staggerContainer}
              initial="initial"
              whileInView="animate"
              viewport={{ once: true }}
            >
              {faqItems.map((item, index) => {
                const isOpen = openFaq === index;
                return (
                  <motion.div key={item.question} variants={animations.staggerItem}>
                    <Card padding="none" className="overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setOpenFaq(isOpen ? -1 : index)}
                        className="w-full flex items-center justify-between gap-4 text-left px-6 py-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                        aria-expanded={isOpen}
                      >
                        <span className="font-display font-semibold text-foreground">
                          {item.question}
                        </span>
                        <motion.span
                          animate={{ rotate: isOpen ? 180 : 0 }}
                          transition={{ duration: 0.2 }}
                          className="text-muted-foreground shrink-0"
                        >
                          <ChevronDown size={20} />
                        </motion.span>
                      </button>
                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: 'easeOut' }}
                            className="overflow-hidden"
                          >
                            <p className="px-6 pb-5 text-muted-foreground leading-relaxed">
                              {item.answer}
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </Card>
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Contact;
