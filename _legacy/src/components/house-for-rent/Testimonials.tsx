'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { motion, useInView } from 'framer-motion';
import { Star, Quote } from 'lucide-react';
import Autoplay from 'embla-carousel-autoplay';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { Card, CardContent } from '@/components/ui/card';

const testimonials = [
  {
    quote: 'Found my dream apartment in Kololo within a week! The platform made it so easy to connect with landlords directly.',
    name: 'Grace W.',
    role: 'Tenant',
    rating: 5,
    initials: 'GW',
  },
  {
    quote: 'As a property owner, this platform has streamlined my tenant search process. Highly recommended!',
    name: 'James M.',
    role: 'Landlord',
    rating: 5,
    initials: 'JM',
  },
  {
    quote: 'The verified listings give me confidence. No more scams or wasted trips to see non-existent properties.',
    name: 'Fatima A.',
    role: 'Tenant',
    rating: 4,
    initials: 'FA',
  },
  {
    quote: 'I listed three properties and found quality tenants for all of them within the first month.',
    name: 'David K.',
    role: 'Landlord',
    rating: 5,
    initials: 'DK',
  },
  {
    quote: 'Moving to Kampala was stressful, but House For Rent made finding a home the easiest part.',
    name: 'Sarah N.',
    role: 'Tenant',
    rating: 5,
    initials: 'SN',
  },
];

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${
            i < rating
              ? 'fill-amber-400 text-amber-400'
              : 'fill-muted text-muted'
          }`}
        />
      ))}
    </div>
  );
}

function TestimonialCard({ testimonial, index }: { testimonial: typeof testimonials[0]; index: number }) {
  const [avatarHovered, setAvatarHovered] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.1, duration: 0.4 }}
    >
      <Card className="h-full border-0 shadow-md hover:shadow-lg transition-shadow bg-card relative overflow-hidden">
        <CardContent className="p-6 flex flex-col h-full relative">
          {/* Large quote icon in background */}
          <div className="absolute top-4 right-4 pointer-events-none select-none">
            <span className="text-7xl font-serif leading-none text-red-100 dark:text-red-900/60 opacity-60">
              &ldquo;
            </span>
          </div>

          {/* Quote icon */}
          <div className="mb-4">
            <Quote className="h-8 w-8 text-red-200 dark:text-red-800" />
          </div>

          {/* Quote text */}
          <p className="text-foreground leading-relaxed flex-1 mb-6 relative z-10">
            &ldquo;{testimonial.quote}&rdquo;
          </p>

          {/* Rating */}
          <div className="mb-4">
            <StarRating rating={testimonial.rating} />
          </div>

          {/* User info */}
          <div className="flex items-center gap-3 pt-4 border-t border-border">
            <motion.div
              className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-red-400 to-red-600 text-white text-sm font-semibold shadow-sm transition-all duration-300 ${
                avatarHovered ? 'ring-2 ring-red-400 ring-offset-2 ring-offset-card' : ''
              }`}
              onMouseEnter={() => setAvatarHovered(true)}
              onMouseLeave={() => setAvatarHovered(false)}
              whileHover={{ scale: 1.05 }}
            >
              {testimonial.initials}
            </motion.div>
            <div>
              <p className="font-medium text-sm text-foreground">{testimonial.name}</p>
              <p className={`text-xs font-medium ${
                testimonial.role === 'Landlord'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-amber-600 dark:text-amber-400'
              }`}>
                {testimonial.role}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function Testimonials() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  // Mobile auto-scroll with pause on hover
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);

  const autoScroll = useCallback(() => {
    if (isPaused || !scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    if (container.scrollTop + container.clientHeight >= container.scrollHeight - 10) {
      container.scrollTop = 0;
    } else {
      container.scrollTop += 1;
    }
  }, [isPaused]);

  useEffect(() => {
    const interval = setInterval(autoScroll, 40);
    return () => clearInterval(interval);
  }, [autoScroll]);

  return (
    <section ref={ref} className="py-16 sm:py-20 bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <span className="inline-block rounded-full bg-red-100 dark:bg-red-900/50 px-4 py-1.5 text-sm font-medium text-red-700 dark:text-red-300 mb-4">
            Testimonials
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Trusted by{' '}
            <span className="text-red-600">Thousands</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            See what our community has to say about their experience with House For Rent.
          </p>
        </motion.div>

        {/* Desktop: Carousel with autoplay + pause on hover */}
        <div className="hidden md:block">
          <Carousel
            opts={{
              align: 'start',
              loop: true,
            }}
            plugins={[
              Autoplay({
                delay: 4000,
                stopOnInteraction: true,
              }),
            ]}
            className="w-full"
          >
            <CarouselContent className="-ml-4">
              {testimonials.map((testimonial, i) => (
                <CarouselItem key={testimonial.name} className="pl-4 md:basis-1/2 lg:basis-1/3">
                  <TestimonialCard testimonial={testimonial} index={i} />
                </CarouselItem>
              ))}
            </CarouselContent>
            <div className="flex justify-center mt-4 gap-2">
              <CarouselPrevious className="static translate-y-0 left-0 top-0 relative" />
              <CarouselNext className="static translate-y-0 right-0 top-0 relative" />
            </div>
          </Carousel>
        </div>

        {/* Mobile: Vertical stack with auto-scroll and pause on hover */}
        <div
          ref={scrollContainerRef}
          className="md:hidden space-y-4 max-h-[28rem] overflow-y-auto pr-1 custom-scrollbar"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
          onTouchStart={() => setIsPaused(true)}
          onTouchEnd={() => setIsPaused(false)}
        >
          {testimonials.map((testimonial, i) => (
            <TestimonialCard key={testimonial.name} testimonial={testimonial} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
