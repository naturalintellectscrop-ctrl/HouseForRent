'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAppStore } from '@/store/useAppStore';
import { toast } from 'sonner';
import { LogIn, UserPlus, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const PROPERTY_IMAGES = [
  {
    url: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=600&h=800&fit=crop',
    label: 'Luxury Villas',
  },
  {
    url: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=600&h=800&fit=crop',
    label: 'Modern Apartments',
  },
  {
    url: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=600&h=800&fit=crop',
    label: 'Executive Condos',
  },
  {
    url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=600&h=800&fit=crop',
    label: 'Cozy Bungalows',
  },
  {
    url: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=600&h=800&fit=crop',
    label: 'Family Homes',
  },
];

export default function AuthModal() {
  const {
    showAuthModal,
    setShowAuthModal,
    authMode,
    setAuthMode,
    setUser,
  } = useAppStore();

  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    phone: '',
    role: 'TENANT',
  });

  // Auto-rotate images every 5 seconds
  useEffect(() => {
    if (!showAuthModal) return;
    const interval = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % PROPERTY_IMAGES.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [showAuthModal]);

  // Reset image index when modal opens
  useEffect(() => {
    if (showAuthModal) {
      setCurrentImageIndex(0);
    }
  }, [showAuthModal]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const fetchCurrentUser = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const user = await res.json();
        setUser(user);
      }
    } catch {
      // Silently fail
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (!formData.email || !formData.password) {
      setAuthError('Please fill in all fields');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email, password: formData.password }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errorMsg = data.error || 'Login failed. Please check your credentials.';
        setAuthError(errorMsg);
        return;
      }
      setUser(data);
      setShowAuthModal(false);
      toast.success('Welcome back!');
      setFormData({ email: '', password: '', name: '', phone: '', role: 'TENANT' });
    } catch {
      setAuthError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (!formData.email || !formData.password || !formData.name) {
      setAuthError('Please fill in all required fields');
      return;
    }
    if (formData.password.length < 6) {
      setAuthError('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Registration failed');
        return;
      }
      await fetchCurrentUser();
      setShowAuthModal(false);
      toast.success('Account created successfully!');
      setFormData({ email: '', password: '', name: '', phone: '', role: 'TENANT' });
    } catch {
      setAuthError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={showAuthModal} onOpenChange={setShowAuthModal}>
      <DialogContent className="sm:max-w-4xl p-0 overflow-hidden gap-0">
        <div className="flex min-h-[560px]">
          {/* Left Panel - Property Image Carousel (hidden on mobile) */}
          <div className="hidden md:block md:w-[45%] relative overflow-hidden bg-gray-900">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentImageIndex}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.8, ease: 'easeInOut' }}
                className="absolute inset-0"
              >
                <Image
                  src={PROPERTY_IMAGES[currentImageIndex].url}
                  alt={PROPERTY_IMAGES[currentImageIndex].label}
                  fill
                  className="object-cover"
                  unoptimized
                />
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-transparent to-black/20" />
              </motion.div>
            </AnimatePresence>

            {/* Label overlay */}
            <div className="absolute bottom-0 left-0 right-0 p-6 z-10">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentImageIndex}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.5 }}
                >
                  <span className="inline-block px-3 py-1 rounded-full bg-red-600/90 text-white text-xs font-medium mb-2 backdrop-blur-sm">
                    {PROPERTY_IMAGES[currentImageIndex].label}
                  </span>
                  <p className="text-white/90 text-sm leading-relaxed">
                    Discover your dream property across Uganda with House For Rent
                  </p>
                </motion.div>
              </AnimatePresence>

              {/* Image navigation dots */}
              <div className="flex items-center gap-2 mt-4">
                {PROPERTY_IMAGES.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentImageIndex(i)}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      i === currentImageIndex
                        ? 'w-6 bg-red-500'
                        : 'w-1.5 bg-white/40 hover:bg-white/60'
                    }`}
                    aria-label={`View image ${i + 1}`}
                  />
                ))}
              </div>
            </div>

            {/* Navigation arrows */}
            <button
              onClick={() => setCurrentImageIndex((prev) => (prev - 1 + PROPERTY_IMAGES.length) % PROPERTY_IMAGES.length)}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 h-8 w-8 flex items-center justify-center rounded-full bg-black/30 text-white/80 hover:bg-black/50 hover:text-white transition-all backdrop-blur-sm"
              aria-label="Previous image"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCurrentImageIndex((prev) => (prev + 1) % PROPERTY_IMAGES.length)}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 h-8 w-8 flex items-center justify-center rounded-full bg-black/30 text-white/80 hover:bg-black/50 hover:text-white transition-all backdrop-blur-sm"
              aria-label="Next image"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            {/* Logo at top of carousel */}
            <div className="absolute top-4 left-4 z-10">
              <Image
                src="/logo.png"
                alt="House For Rent Logo"
                width={40}
                height={40}
                className="rounded-lg shadow-lg"
                unoptimized
              />
            </div>
          </div>

          {/* Right Panel - Auth Form */}
          <div className="flex-1 p-6 sm:p-8 flex flex-col">
            <DialogHeader className="mb-4">
              {/* Logo on mobile */}
              <div className="flex items-center justify-center gap-2 mb-2 md:hidden">
                <Image
                  src="/logo.png"
                  alt="House For Rent Logo"
                  width={40}
                  height={40}
                  className="rounded-lg"
                  unoptimized
                />
              </div>
              {/* Logo on desktop - smaller, inline */}
              <div className="hidden md:flex items-center justify-center gap-2 mb-2">
                <Image
                  src="/logo.png"
                  alt="House For Rent Logo"
                  width={32}
                  height={32}
                  className="rounded-lg"
                  unoptimized
                />
                <span className="font-bold text-lg">
                  House<span className="text-red-600">ForRent</span>
                </span>
              </div>
              <DialogTitle className="text-center text-xl">
                {authMode === 'login' ? 'Welcome Back' : 'Create Account'}
              </DialogTitle>
              <DialogDescription className="text-center">
                {authMode === 'login'
                  ? 'Sign in to manage your properties and inquiries'
                  : 'Join House For Rent to find your perfect home'}
              </DialogDescription>
            </DialogHeader>

            {/* Inline error message */}
            {authError && (
              <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/50 px-4 py-3 text-sm text-red-700 dark:text-red-400 flex items-center gap-2 mb-4">
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                {authError}
              </div>
            )}

            <form onSubmit={authMode === 'login' ? handleLogin : handleRegister} className="space-y-4 flex-1">
              {authMode === 'register' && (
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="John Doe"
                    value={formData.name}
                    onChange={handleChange}
                    disabled={loading}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>

              {authMode === 'register' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input
                      id="phone"
                      name="phone"
                      placeholder="+256 700 000 000"
                      value={formData.phone}
                      onChange={handleChange}
                      disabled={loading}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>I am a</Label>
                    <Select
                      value={formData.role}
                      onValueChange={(value) => setFormData((prev) => ({ ...prev, role: value }))}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TENANT">Tenant - Looking for a home</SelectItem>
                        <SelectItem value="LANDLORD">Landlord - Listing properties</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              <Button
                type="submit"
                className="w-full bg-red-600 hover:bg-red-700 text-white"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : authMode === 'login' ? (
                  <LogIn className="mr-2 h-4 w-4" />
                ) : (
                  <UserPlus className="mr-2 h-4 w-4" />
                )}
                {authMode === 'login' ? 'Sign In' : 'Create Account'}
              </Button>
            </form>

            <div className="text-center text-sm text-muted-foreground mt-4">
              {authMode === 'login' ? (
                <>
                  Don&apos;t have an account?{' '}
                  <button
                    onClick={() => { setAuthMode('register'); setAuthError(''); }}
                    className="font-medium text-red-600 hover:text-red-700 hover:underline"
                  >
                    Sign up
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <button
                    onClick={() => { setAuthMode('login'); setAuthError(''); }}
                    className="font-medium text-red-600 hover:text-red-700 hover:underline"
                  >
                    Sign in
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
