'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Search, MessageSquare, Home, Building2, Shield, Users, ArrowRight } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/useAppStore';

const tenantSteps = [
  {
    number: 1,
    icon: Search,
    title: 'Search & Discover',
    description: 'Browse thousands of verified rental properties across Kampala. Filter by location, price, and amenities to find exactly what you need.',
  },
  {
    number: 2,
    icon: MessageSquare,
    title: 'Connect & Inquire',
    description: 'Chat directly with property owners. Ask questions, schedule viewings, and get all the details you need before making a decision.',
  },
  {
    number: 3,
    icon: Home,
    title: 'Move In',
    description: 'Find your perfect home and move in with confidence. All listings are verified, so what you see is what you get.',
  },
];

const landlordSteps = [
  {
    number: 1,
    icon: Building2,
    title: 'List Your Property',
    description: 'Add your property details, upload photos, and specify amenities. Our intuitive form makes listing quick and easy.',
  },
  {
    number: 2,
    icon: Shield,
    title: 'Get Verified',
    description: 'Quick verification process for trust and credibility. Verified landlords attract more quality tenants.',
  },
  {
    number: 3,
    icon: Users,
    title: 'Find Tenants',
    description: 'Receive inquiries from interested tenants. Manage all conversations and bookings from one dashboard.',
  },
];

function StepCard({ step, index, isLast }: { step: typeof tenantSteps[0]; index: number; isLast: boolean }) {
  const Icon = step.icon;
  return (
    <div className="flex flex-col items-center text-center relative">
      {/* Connecting dotted line - desktop only */}
      {!isLast && (
        <div className="hidden lg:block absolute top-10 left-[calc(50%+40px)] w-[calc(100%-80px)] border-t-2 border-dashed border-red-200 dark:border-red-800" />
      )}

      {/* Numbered circle with red gradient */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        whileInView={{ scale: 1, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: index * 0.2, type: 'spring', stiffness: 200 }}
        className="relative z-10 mb-4"
      >
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-red-400 to-red-600 shadow-lg shadow-red-200 dark:shadow-red-900/30">
          <Icon className="h-8 w-8 text-white" />
        </div>
        <span className="absolute -top-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-white dark:bg-gray-800 text-red-600 text-sm font-bold shadow-md border border-red-100 dark:border-red-900">
          {step.number}
        </span>
      </motion.div>

      {/* Title and description */}
      <motion.h3
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: index * 0.2 + 0.1 }}
        className="mb-2 text-lg font-semibold text-foreground"
      >
        {step.title}
      </motion.h3>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: index * 0.2 + 0.2 }}
        className="max-w-xs text-sm text-muted-foreground leading-relaxed"
      >
        {step.description}
      </motion.p>
    </div>
  );
}

export default function HowItWorks() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });
  const { user, setCurrentView, setShowAuthModal, setAuthMode } = useAppStore();

  const handleCTA = () => {
    if (user) {
      if (user.role === 'LANDLORD' || user.role === 'ADMIN') {
        setCurrentView('add-property');
      } else {
        setCurrentView('home');
      }
    } else {
      setAuthMode('register');
      setShowAuthModal(true);
    }
  };

  return (
    <section ref={ref} className="py-16 sm:py-20 bg-gradient-to-b from-red-50/50 to-background dark:from-red-950/20 dark:to-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <span className="inline-block rounded-full bg-red-100 dark:bg-red-900/50 px-4 py-1.5 text-sm font-medium text-red-700 dark:text-red-300 mb-4">
            How It Works
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Simple Steps to Your{' '}
            <span className="text-red-600">Perfect Home</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            Whether you&apos;re looking for a place to rent or have a property to list, we make the process seamless.
          </p>
        </motion.div>

        {/* Tabs */}
        <Tabs defaultValue="tenant" className="w-full">
          <div className="flex justify-center mb-10">
            <TabsList className="bg-red-100/50 dark:bg-red-900/30">
              <TabsTrigger
                value="tenant"
                className="data-[state=active]:bg-red-600 data-[state=active]:text-white px-6"
              >
                For Tenants
              </TabsTrigger>
              <TabsTrigger
                value="landlord"
                className="data-[state=active]:bg-red-600 data-[state=active]:text-white px-6"
              >
                For Landlords
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="tenant">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
              {tenantSteps.map((step, i) => (
                <StepCard key={step.number} step={step} index={i} isLast={i === tenantSteps.length - 1} />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="landlord">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
              {landlordSteps.map((step, i) => (
                <StepCard key={step.number} step={step} index={i} isLast={i === landlordSteps.length - 1} />
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.6 }}
          className="mt-12 text-center"
        >
          <Button
            size="lg"
            className="bg-red-600 hover:bg-red-700 text-white gap-2 px-8"
            onClick={handleCTA}
          >
            Get Started
            <ArrowRight className="h-4 w-4" />
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
