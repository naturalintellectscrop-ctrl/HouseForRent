'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Search, Home, Users, Building2, MapPin, Key, DoorOpen, Star, Sun, Sparkles, Landmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppStore } from '@/store/useAppStore';

const QUICK_CITIES = ['Kampala', 'Entebbe', 'Jinja', 'Mbarara', 'Gulu', 'Mbale'];

const floatingIcons = [
  { icon: Home, top: '15%', left: '8%', delay: 0, size: 'h-8 w-8' },
  { icon: Building2, top: '25%', right: '10%', delay: 1.5, size: 'h-10 w-10' },
  { icon: Key, bottom: '30%', left: '12%', delay: 3, size: 'h-7 w-7' },
  { icon: DoorOpen, bottom: '20%', right: '8%', delay: 4.5, size: 'h-8 w-8' },
];

// Decorative floating orbs with Ugandan colors
const colorOrbs = [
  { color: 'bg-red-500/20', size: 'w-72 h-72', top: '-10%', left: '-5%', delay: 0 },
  { color: 'bg-cyan-400/20', size: 'w-96 h-96', top: '20%', right: '-10%', delay: 2 },
  { color: 'bg-green-500/15', size: 'w-80 h-80', bottom: '-15%', left: '20%', delay: 4 },
  { color: 'bg-yellow-400/15', size: 'w-64 h-64', top: '5%', left: '40%', delay: 1 },
  { color: 'bg-red-400/10', size: 'w-56 h-56', bottom: '5%', right: '15%', delay: 3 },
  { color: 'bg-cyan-300/10', size: 'w-48 h-48', top: '40%', left: '5%', delay: 5 },
  { color: 'bg-green-400/10', size: 'w-60 h-60', top: '10%', right: '25%', delay: 2.5 },
];

function CounterAnimation({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated) {
          setHasAnimated(true);
          const duration = 2000;
          const steps = 60;
          const increment = target / steps;
          let current = 0;
          const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
              setCount(target);
              clearInterval(timer);
            } else {
              setCount(Math.floor(current));
            }
          }, duration / steps);
        }
      },
      { threshold: 0.5 }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target, hasAnimated]);

  return (
    <div ref={ref}>
      <p className="mt-2 text-2xl font-bold text-white drop-shadow-lg">
        {count.toLocaleString()}{suffix}
      </p>
    </div>
  );
}

export default function HeroSection() {
  const { searchQuery, setSearchQuery, setCurrentPage, setFilters, setCurrentView, filters } = useAppStore();
  const [searchFocused, setSearchFocused] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end start'],
  });

  const parallaxY1 = useTransform(scrollYProgress, [0, 1], [0, -60]);
  const parallaxY2 = useTransform(scrollYProgress, [0, 1], [0, -40]);
  const parallaxY3 = useTransform(scrollYProgress, [0, 1], [0, -80]);
  const parallaxY4 = useTransform(scrollYProgress, [0, 1], [0, -50]);

  const parallaxOffsets = [parallaxY1, parallaxY2, parallaxY3, parallaxY4];

  const handleSearch = () => {
    setCurrentPage(1);
  };

  const handleCityClick = (city: string) => {
    setSearchQuery(city);
    setCurrentPage(1);
  };

  return (
    <section ref={sectionRef} className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #1a0a0a 0%, #0d1117 25%, #0a1628 50%, #0d1117 75%, #1a0a0a 100%)' }}>
      {/* Animated colorful gradient overlay - multi-color shifting */}
      <div className="absolute inset-0">
        <div
          className="absolute inset-0 animate-pulse"
          style={{
            background: `
              radial-gradient(ellipse 600px 400px at 20% 30%, rgba(239,68,68,0.35) 0%, transparent 70%),
              radial-gradient(ellipse 500px 500px at 80% 20%, rgba(6,182,212,0.3) 0%, transparent 70%),
              radial-gradient(ellipse 400px 300px at 60% 70%, rgba(34,197,94,0.25) 0%, transparent 70%),
              radial-gradient(ellipse 300px 300px at 10% 80%, rgba(234,179,8,0.2) 0%, transparent 70%),
              radial-gradient(ellipse 350px 250px at 90% 60%, rgba(168,85,247,0.15) 0%, transparent 70%)
            `,
          }}
        />
        {/* Secondary shifting gradient */}
        <div
          className="absolute inset-0 opacity-40"
          style={{
            background: `
              conic-gradient(from 180deg at 50% 50%,
                rgba(239,68,68,0.15) 0deg,
                rgba(234,179,8,0.1) 60deg,
                rgba(34,197,94,0.12) 120deg,
                rgba(6,182,212,0.15) 180deg,
                rgba(168,85,247,0.1) 240deg,
                rgba(239,68,68,0.15) 360deg
              )
            `,
          }}
        />
      </div>

      {/* Floating decorative color orbs */}
      {colorOrbs.map((orb, i) => (
        <motion.div
          key={i}
          className={`absolute rounded-full blur-3xl pointer-events-none ${orb.color} ${orb.size}`}
          style={{
            top: orb.top,
            left: orb.left,
            right: orb.right,
            bottom: orb.bottom,
          }}
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.6, 1, 0.6],
          }}
          transition={{
            duration: 8,
            delay: orb.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}

      {/* Background Pattern - subtle geometric */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: `
            url("data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M50 50c0-5.523 4.477-10 10-10s10 4.477 10 10-4.477 10-10 10c0 5.523-4.477 10-10 10s-10-4.477-10-10 4.477-10 10-10zM10 10c0-5.523 4.477-10 10-10s10 4.477 10 10-4.477 10-10 10c0 5.523-4.477 10-10 10S0 25.523 0 20s4.477-10 10-10z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")
          `,
        }} />
      </div>

      {/* Decorative stripes at top - Ugandan flag colors (Black, Yellow, Red) */}
      <div className="absolute top-0 left-0 right-0 flex h-2 z-10">
        <div className="flex-1 bg-black" />
        <div className="flex-1 bg-yellow-500" />
        <div className="flex-1 bg-red-600" />
      </div>

      {/* Sparkle decorations */}
      {[...Array(12)].map((_, i) => (
        <motion.div
          key={`sparkle-${i}`}
          className="absolute pointer-events-none"
          style={{
            top: `${10 + Math.random() * 80}%`,
            left: `${5 + Math.random() * 90}%`,
          }}
          animate={{
            opacity: [0, 1, 0],
            scale: [0, 1, 0],
            rotate: [0, 180],
          }}
          transition={{
            duration: 3,
            delay: i * 0.8,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          <Star className="h-3 w-3 text-yellow-300/60" />
        </motion.div>
      ))}

      {/* Floating house/building icons with parallax */}
      {floatingIcons.map(({ icon: Icon, top, left, right, bottom, delay, size }, i) => (
        <motion.div
          key={i}
          className="absolute text-white/15 pointer-events-none hidden lg:block"
          style={{ top, left, right, bottom, y: parallaxOffsets[i] }}
          animate={{
            y: [0, -15, 0],
            rotate: [0, 5, -5, 0],
          }}
          transition={{
            duration: 6,
            delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          <Icon className={size} />
        </motion.div>
      ))}

      <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          {/* Badge with Ugandan flag accent */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm relative overflow-hidden border border-white/20"
          >
            {/* Shimmer effect */}
            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" style={{ backgroundSize: '200% 100%' }} />
            <Sparkles className="h-4 w-4 relative z-10 text-yellow-400" />
            <span className="relative z-10">Uganda&apos;s #1 Rental Platform</span>
          </motion.div>

          {/* Main heading with text shadow for visibility */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl lg:text-6xl"
            style={{ textShadow: '0 2px 10px rgba(0,0,0,0.5), 0 4px 20px rgba(0,0,0,0.3)' }}
          >
            Find Your Next Home
            <br />
            <span className="bg-gradient-to-r from-yellow-300 via-red-400 to-cyan-400 bg-clip-text text-transparent">
              With Ease
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mx-auto mt-6 max-w-2xl text-lg text-white/90 sm:text-xl"
            style={{ textShadow: '0 1px 8px rgba(0,0,0,0.5)' }}
          >
            Discover thousands of rental properties across Uganda. From cozy bedsitters
            to luxurious villas, your perfect home awaits.
          </motion.p>

          {/* Search Bar with glow on focus */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mx-auto mt-8 max-w-2xl"
          >
            <div
              className={`flex items-center gap-2 rounded-xl bg-white/95 p-2 shadow-2xl transition-shadow duration-500 sm:gap-3 sm:p-3 backdrop-blur-sm ${
                searchFocused ? 'ring-2 ring-cyan-400 shadow-[0_0_30px_rgba(6,182,212,0.3)]' : ''
              }`}
            >
              <div className="relative flex-1">
                <MapPin className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-red-500" />
                <Input
                  placeholder="Search by city, address, or property name..."
                  className="border-0 pl-10 text-base shadow-none focus-visible:ring-0 bg-transparent"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                />
              </div>
              <Button
                className="hidden h-11 shrink-0 bg-red-600 px-6 text-base hover:bg-red-700 sm:flex shadow-lg shadow-red-500/25"
                onClick={handleSearch}
              >
                <Search className="mr-2 h-4 w-4" />
                Search
              </Button>
              <Button
                className="h-11 shrink-0 bg-red-600 hover:bg-red-700 sm:hidden shadow-lg shadow-red-500/25"
                size="icon"
                onClick={handleSearch}
              >
                <Search className="h-5 w-5" />
              </Button>
            </div>
          </motion.div>

          {/* CTA Buttons: Rent a Home / Buy Land & Houses */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.45 }}
            className="mt-6 flex flex-wrap items-center justify-center gap-3"
          >
            <Button
              className="h-11 px-6 text-base bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white shadow-lg shadow-red-500/25 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-red-500/30"
              onClick={() => {
                setFilters({ ...filters, listingType: 'RENT' });
                setCurrentPage(1);
                setCurrentView('home');
                document.getElementById('properties-section')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              <Home className="mr-2 h-4 w-4" />
              Rent a Home
            </Button>
            <Button
              className="h-11 px-6 text-base bg-gradient-to-r from-green-600 to-cyan-600 hover:from-green-700 hover:to-cyan-700 text-white shadow-lg shadow-green-500/25 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-green-500/30"
              onClick={() => {
                setFilters({ ...filters, listingType: 'SALE' });
                setCurrentPage(1);
                setCurrentView('home');
                document.getElementById('properties-section')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              <Landmark className="mr-2 h-4 w-4" />
              Buy Land & Houses
            </Button>
          </motion.div>

          {/* Quick City Chips with colorful borders */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="mt-6 flex flex-wrap items-center justify-center gap-2"
          >
            <span className="text-sm text-white/70">Popular:</span>
            {QUICK_CITIES.map((city, i) => {
              const colors = [
                'border-red-400/50 hover:bg-red-500/30 hover:border-red-400',
                'border-cyan-400/50 hover:bg-cyan-500/30 hover:border-cyan-400',
                'border-green-400/50 hover:bg-green-500/30 hover:border-green-400',
                'border-yellow-400/50 hover:bg-yellow-500/30 hover:border-yellow-400',
                'border-red-400/50 hover:bg-red-500/30 hover:border-red-400',
                'border-cyan-400/50 hover:bg-cyan-500/30 hover:border-cyan-400',
              ];
              return (
                <button
                  key={city}
                  onClick={() => handleCityClick(city)}
                  className={`rounded-full bg-white/10 px-3 py-1 text-sm text-white backdrop-blur-sm transition-all duration-300 border ${colors[i % colors.length]} hover:scale-105`}
                >
                  {city}
                </button>
              );
            })}
          </motion.div>

          {/* Stats with counter animation and colorful accents */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="mt-12 grid grid-cols-3 gap-4 mx-auto max-w-lg"
          >
            {[
              { icon: Building2, value: 500, suffix: '+', label: 'Properties', color: 'from-red-500/20 to-red-600/10 border-red-400/30', iconColor: 'text-red-300', hoverShadow: 'hover:shadow-red-500/20' },
              { icon: Users, value: 200, suffix: '+', label: 'Landlords', color: 'from-cyan-500/20 to-cyan-600/10 border-cyan-400/30', iconColor: 'text-cyan-300', hoverShadow: 'hover:shadow-cyan-500/20' },
              { icon: Home, value: 1000, suffix: '+', label: 'Happy Tenants', color: 'from-green-500/20 to-green-600/10 border-green-400/30', iconColor: 'text-green-300', hoverShadow: 'hover:shadow-green-500/20' },
            ].map(({ icon: Icon, value, suffix, label, color, iconColor, hoverShadow }) => (
              <div
                key={label}
                className={`text-center rounded-xl bg-gradient-to-b ${color} backdrop-blur-sm border px-3 py-4 transition-all duration-300 hover:bg-white/15 hover:-translate-y-1 hover:shadow-lg ${hoverShadow}`}
              >
                <Icon className={`mx-auto h-6 w-6 ${iconColor}`} />
                <CounterAnimation target={value} suffix={suffix} />
                <p className="text-sm text-white/70">{label}</p>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </div>

      {/* Colorful wave shape at the bottom - Ugandan flag themed */}
      <div className="absolute bottom-0 left-0 right-0">
        <svg
          viewBox="0 0 1440 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-auto"
          preserveAspectRatio="none"
        >
          {/* Back wave - red */}
          <path
            d="M0 60C180 90 360 95 540 75C720 55 900 25 1080 35C1260 45 1380 60 1440 65V100H0V60Z"
            fill="rgba(239,68,68,0.15)"
          />
          {/* Middle wave - green */}
          <path
            d="M0 70C200 85 400 90 600 70C800 50 1000 30 1200 40C1350 48 1440 65 1440 65V100H0V70Z"
            fill="rgba(34,197,94,0.12)"
          />
          {/* Front wave - cyan */}
          <path
            d="M0 75C240 88 480 92 720 72C960 52 1200 38 1440 50V100H0V75Z"
            className="fill-background"
          />
        </svg>
      </div>
    </section>
  );
}
