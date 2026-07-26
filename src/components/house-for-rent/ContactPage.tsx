'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Phone, Mail, Send, Clock, HelpCircle, ChevronDown, Shield } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';

const contactSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email'),
  subject: z.string().min(1, 'Please select a subject'),
  message: z.string().min(10, 'Message must be at least 10 characters'),
});

type ContactFormValues = z.infer<typeof contactSchema>;

const contactCards = [
  {
    icon: Phone,
    title: 'Call Us',
    line1: '+256752255676',
    line2: 'Mon-Fri 8am-6pm, Sat 9am-1pm',
  },
  {
    icon: Mail,
    title: 'Email Us',
    line1: 'gthebanks@gmail.com',
    line2: 'We reply within 24 hours',
  },
];

const faqs = [
  {
    question: 'How do I list my property for rent or sale?',
    answer: 'Sign up as a landlord, click "Add Property", fill in the details including whether it\'s for rent, sale, or both. Our team will review it within 24 hours and it will go live once approved.',
  },
  {
    question: 'Is it free to browse properties?',
    answer: 'Yes! Tenants and buyers can browse all properties and contact landlords directly at no cost. There are no agent fees — you deal directly with the property owner.',
  },
  {
    question: 'How do I contact a property owner?',
    answer: 'Use the inquiry form or chat feature on any property listing. Your message goes directly to the landlord. No middlemen involved — you negotiate directly with the owner.',
  },
  {
    question: 'What types of land titles are accepted?',
    answer: 'Landlords can list properties with Ready Title, Agreement, Mailo Land, or Crown Land titles. The title type is displayed on each listing so buyers can make informed decisions.',
  },
  {
    question: 'How are properties verified?',
    answer: 'Our team reviews each listing for accuracy. Landlords must pay a listing fee and undergo identity verification. Properties with verified payment are marked accordingly.',
  },
  {
    question: 'Can I find properties outside Kampala?',
    answer: 'Absolutely! We have listings across Uganda including Entebbe, Jinja, Mbarara, Gulu, Mbale, Fort Portal, Arua, and more. Use the city filter to explore properties in any region.',
  },
  {
    question: 'What is your privacy policy?',
    answer: 'We take your privacy seriously. Our Privacy Policy outlines how we collect, use, and protect your personal information in compliance with Uganda\'s Data Protection and Privacy Act, 2019. You can view our full Privacy Policy for detailed information about your rights and our data practices.',
  },
];

const quickHelpItems = [
  {
    question: 'How do I pay the listing fee?',
    answer: 'After adding your property, you\'ll be prompted to pay the listing fee via Mobile Money (MTN MoMo or Airtel Money). Once payment is confirmed, your property will be reviewed and published.',
  },
  {
    question: 'How do I contact a landlord directly?',
    answer: 'Visit any property listing and use the inquiry form or chat feature. You must be logged in to send messages. All communication goes directly to the property owner — no agents involved.',
  },
  {
    question: 'What if a listing seems suspicious?',
    answer: 'Report it immediately using the flag button on the listing. Our team investigates all reports within 48 hours. We take fraud seriously to protect our community.',
  },
  {
    question: 'Can I edit my property listing after publishing?',
    answer: 'Yes! Go to your dashboard, find the property, and click "Edit". Changes are reviewed before going live to maintain listing quality.',
  },
];

const subjectOptions = [
  { value: 'general', label: 'General Inquiry' },
  { value: 'listing', label: 'Property Listing' },
  { value: 'support', label: 'Technical Support' },
  { value: 'complaint', label: 'Complaint' },
  { value: 'partnership', label: 'Partnership' },
];

// Office hours data
const officeHours = [
  { day: 'Monday - Friday', hours: '8:00 AM - 6:00 PM', isWeekday: true },
  { day: 'Saturday', hours: '9:00 AM - 1:00 PM', isWeekday: false },
  { day: 'Sunday', hours: 'Closed', isWeekday: false },
];

function QuickHelpItem({ item, index }: { item: typeof quickHelpItems[0]; index: number }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.3 }}
      className="rounded-lg border border-border/60 bg-card overflow-hidden transition-all duration-200 hover:border-red-200 dark:hover:border-red-800"
    >
      <button
        className="w-full text-left p-4 flex items-center justify-between gap-3"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 dark:bg-red-950/40">
            <HelpCircle className="h-4 w-4 text-red-600" />
          </div>
          <span className="text-sm font-medium">{item.question}</span>
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0"
        >
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </motion.div>
      </button>
      <motion.div
        initial={false}
        animate={{
          height: isOpen ? 'auto' : 0,
          opacity: isOpen ? 1 : 0,
        }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className="overflow-hidden"
      >
        <div className="px-4 pb-4 pl-15 text-sm text-muted-foreground leading-relaxed" style={{ paddingLeft: '3.25rem' }}>
          {item.answer}
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function ContactPage() {
  const [submitting, setSubmitting] = useState(false);
  const { setCurrentView } = useAppStore();

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: '',
      email: '',
      subject: '',
      message: '',
    },
  });

  const onSubmit = async (data: ContactFormValues) => {
    setSubmitting(true);
    // Simulate submission
    await new Promise((resolve) => setTimeout(resolve, 800));
    toast.success("Message sent! We'll get back to you soon.");
    form.reset();
    setSubmitting(false);
  };

  return (
    <div>
      {/* Hero Banner */}
      <div className="relative overflow-hidden bg-gradient-to-r from-red-600 to-cyan-600 py-20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent_60%)]" />
        <div className="relative mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-4xl font-bold text-white sm:text-5xl"
          >
            Get In Touch
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-4 text-lg text-red-100"
          >
            Connecting tenants &amp; buyers directly with property owners across Uganda
          </motion.p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 space-y-16">
        {/* Contact Cards Row - Only Call Us and Email Us */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="grid grid-cols-1 gap-6 sm:grid-cols-2 max-w-2xl mx-auto"
        >
          {contactCards.map((card) => (
            <Card
              key={card.title}
              className="text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-red-500/10 dark:hover:shadow-red-500/5"
            >
              <CardContent className="flex flex-col items-center gap-3 pt-6">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40">
                  <card.icon className="h-7 w-7 text-red-600" />
                </div>
                <h3 className="text-lg font-semibold">{card.title}</h3>
                <p className="text-muted-foreground font-medium">{card.line1}</p>
                {card.line2 && (
                  <p className="text-sm text-muted-foreground">{card.line2}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </motion.div>

        {/* Office Hours Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <Card className="overflow-hidden max-w-2xl mx-auto">
            <CardContent className="p-0">
              <div className="flex flex-col sm:flex-row">
                {/* Left: Icon + Title */}
                <div className="flex items-center gap-3 p-6 bg-gradient-to-br from-red-50 to-cyan-50 dark:from-red-950/40 dark:to-cyan-950/40 sm:w-64 shrink-0">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/60">
                    <Clock className="h-6 w-6 text-red-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">Office Hours</h3>
                    <p className="text-xs text-muted-foreground">EAT (UTC+3)</p>
                  </div>
                </div>
                {/* Right: Schedule */}
                <div className="flex-1 p-6">
                  <div className="space-y-3">
                    {officeHours.map((schedule) => (
                      <div key={schedule.day} className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className={`h-2 w-2 rounded-full ${
                            schedule.hours === 'Closed'
                              ? 'bg-red-400'
                              : schedule.isWeekday
                                ? 'bg-red-500'
                                : 'bg-amber-400'
                          }`} />
                          <span className="text-sm font-medium">{schedule.day}</span>
                        </div>
                        <span className={`text-sm ${
                          schedule.hours === 'Closed'
                            ? 'text-red-500 font-medium'
                            : 'text-muted-foreground'
                        }`}>
                          {schedule.hours}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Quick Help Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
        >
          <div className="flex items-center gap-2 mb-6">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/40">
              <HelpCircle className="h-4 w-4 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold">Quick Help</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {quickHelpItems.map((item, i) => (
              <QuickHelpItem key={item.question} item={item} index={i} />
            ))}
          </div>
        </motion.div>

        {/* Contact Form + FAQ */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Form */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <Card>
              <CardContent className="pt-6">
                <h2 className="text-2xl font-bold mb-6">Send Us a Message</h2>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Your name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="your@email.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="subject"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Subject</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a subject" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {subjectOptions.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="message"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Message</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Tell us how we can help..."
                              className="min-h-[120px]"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="submit"
                      className="w-full bg-red-600 hover:bg-red-700 text-white"
                      disabled={submitting}
                    >
                      <Send className="mr-2 h-4 w-4" />
                      {submitting ? 'Sending...' : 'Send Message'}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </motion.div>

          {/* FAQ */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <Card>
              <CardContent className="pt-6">
                <h2 className="text-2xl font-bold mb-6">Frequently Asked Questions</h2>
                <Accordion type="single" collapsible className="w-full">
                  {faqs.map((faq, index) => (
                    <AccordionItem key={index} value={`faq-${index}`}>
                      <AccordionTrigger className="text-left">
                        {faq.question}
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground">
                        {faq.answer}
                        {faq.question === 'What is your privacy policy?' && (
                          <button
                            onClick={() => {
                              setCurrentView('privacy');
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="inline-flex items-center gap-1 mt-2 text-red-600 hover:text-red-700 font-medium text-sm transition-colors"
                          >
                            <Shield className="h-3.5 w-3.5" />
                            View Full Privacy Policy →
                          </button>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>

      <Separator />
    </div>
  );
}
