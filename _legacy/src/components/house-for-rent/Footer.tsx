'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Mail, Phone, MapPin, Facebook, Twitter, Instagram, ArrowUp, Send } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';

export default function Footer() {
  const [email, setEmail] = useState('');
  const [subscribing, setSubscribing] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const { setCurrentView } = useAppStore();

  const navigateToContact = () => {
    setCurrentView('contact');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateTo = (view: 'privacy' | 'terms') => {
    setCurrentView(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubscribing(true);
    // Simulate subscription
    await new Promise((resolve) => setTimeout(resolve, 800));
    toast.success('Subscribed successfully! 🎉');
    setEmail('');
    setSubscribing(false);
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="mt-auto bg-gray-900 text-gray-300">
      {/* Decorative top border with red gradient */}
      <div className="h-1 bg-gradient-to-r from-red-400 via-cyan-500 to-red-400" />

      {/* Wave/curve divider between header and footer content */}
      <div className="relative -mb-1">
        <svg
          viewBox="0 0 1440 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-auto"
          preserveAspectRatio="none"
        >
          <path
            d="M0 40V20C240 0 480 0 720 10C960 20 1200 30 1440 20V40H0Z"
            className="fill-gray-900"
          />
        </svg>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Image
                src="/logo.png"
                alt="House For Rent Logo"
                width={36}
                height={36}
                className="rounded-lg"
                unoptimized
              />
              <span className="text-lg font-bold text-white">House For Rent</span>
            </div>
            <p className="text-sm leading-relaxed">
              Find your perfect rental home in Uganda. We connect tenants with verified landlords for a seamless renting experience.
            </p>
            {/* Social Icons with ring animation on hover */}
            <div className="flex gap-3 pt-2">
              {[
                { icon: Facebook, label: 'Facebook' },
                { icon: Twitter, label: 'Twitter' },
                { icon: Instagram, label: 'Instagram' },
              ].map(({ icon: Icon, label }) => (
                <a
                  key={label}
                  href="#"
                  aria-label={label}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-800 transition-all duration-300 hover:bg-red-600 hover:scale-110 hover:ring-2 hover:ring-red-400 hover:ring-offset-2 hover:ring-offset-gray-900"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white">Quick Links</h3>
            <ul className="space-y-2">
              {[
                { label: 'Browse Properties', action: () => setCurrentView('home') },
                { label: 'Featured Listings', action: () => setCurrentView('home') },
                { label: 'How It Works', action: () => setCurrentView('home') },
                { label: 'Contact Us', action: navigateToContact },
                { label: 'Privacy Policy', action: () => navigateTo('privacy') },
                { label: 'Terms of Service', action: () => navigateTo('terms') },
              ].map(({ label, action }) => (
                <li key={label}>
                  <span
                    className="cursor-pointer text-sm transition-all duration-200 hover:text-red-400 hover:translate-x-1 inline-block"
                    onClick={action}
                  >
                    {label}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* For Landlords */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white">For Landlords</h3>
            <ul className="space-y-2">
              {['List Your Property', 'Landlord Dashboard', 'Pricing Plans', 'Verification Process'].map((link) => (
                <li key={link}>
                  <span className="cursor-pointer text-sm transition-all duration-200 hover:text-red-400 hover:translate-x-1 inline-block">
                    {link}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Newsletter + Contact with focus glow */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white">Stay Updated</h3>
            <p className="text-sm">Subscribe to get the latest listings and updates.</p>
            <form onSubmit={handleSubscribe} className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type="email"
                  placeholder="Your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                  className={`bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 transition-all duration-300 ${
                    emailFocused
                      ? 'ring-2 ring-red-500/40 border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.2)]'
                      : 'focus-visible:ring-red-500'
                  }`}
                  required
                />
              </div>
              <Button
                type="submit"
                size="icon"
                className="shrink-0 bg-red-600 hover:bg-red-700 text-white"
                disabled={subscribing}
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
            <Separator className="bg-gray-700" />
            <ul className="space-y-2.5">
              <li
                className="flex items-center gap-2 text-sm cursor-pointer hover:text-red-400 transition-colors"
                onClick={navigateToContact}
              >
                <Phone className="h-4 w-4 shrink-0 text-red-400" />
                +256752255676
              </li>
              <li
                className="flex items-center gap-2 text-sm cursor-pointer hover:text-red-400 transition-colors"
                onClick={navigateToContact}
              >
                <Mail className="h-4 w-4 shrink-0 text-red-400" />
                gthebanks@gmail.com
              </li>
            </ul>
          </div>
        </div>

        <Separator className="my-8 bg-gray-700" />

        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-sm">
            &copy; {new Date().getFullYear()} House For Rent. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            {[
              { label: 'Privacy Policy', action: () => navigateTo('privacy') },
              { label: 'Terms of Service', action: () => navigateTo('terms') },
              { label: 'Cookie Policy', action: () => navigateTo('privacy') },
            ].map(({ label, action }) => (
              <span key={label} onClick={action} className="cursor-pointer text-sm transition-colors duration-200 hover:text-red-400">
                {label}
              </span>
            ))}
            <Button
              variant="ghost"
              size="icon"
              onClick={scrollToTop}
              className="h-8 w-8 rounded-full bg-gray-800 text-gray-400 hover:bg-red-600 hover:text-white transition-all duration-200"
              aria-label="Back to top"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </footer>
  );
}
