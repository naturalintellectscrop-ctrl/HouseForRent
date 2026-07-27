'use client';

import { useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Heart, Share2, MapPin, Bed, Bath, Maximize, Calendar,
  Building2, Car, PawPrint, Sofa, Eye, MessageSquare, Phone, User,
  ChevronLeft, ChevronRight, Home, Check, Box, Bell, Star, Link2,
  X, ShieldAlert, FileText, Landmark, Tag
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
  type CarouselApi,
} from '@/components/ui/carousel';
import { useAppStore, type Property } from '@/store/useAppStore';
import { toast } from 'sonner';
import PropertyCard from './PropertyCard';
import PropertyReviews from './PropertyReviews';
import ImageLightbox from './ImageLightbox';
import CostCalculator from './CostCalculator';
import PropertyValueBadge from './PropertyValueBadge';
import NeighborhoodInfo from './NeighborhoodInfo';
import AvailabilityCalendar from './AvailabilityCalendar';
import { formatUGX, propertyTypeLabels, listingTypeLabels, listingTypeColors } from './PropertyCard';

// Land title type labels and colors
const landTitleTypeLabels: Record<string, string> = {
  READY_TITLE: 'Ready Land Title',
  AGREEMENT: 'Agreement',
  MILE_LAND: 'Mile Land',
  CROWN_LAND: 'Crown Land',
};

const landTitleTypeColors: Record<string, string> = {
  READY_TITLE: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400',
  AGREEMENT: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-400',
  MILE_LAND: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-400',
  CROWN_LAND: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-400',
};

// Helper: relative time display for "Listed X days ago"
function getListedDaysAgo(dateStr: string): string {
  const now = new Date();
  const created = new Date(dateStr);
  const diffMs = now.getTime() - created.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 30) return `${diffDays} days ago`;
  if (diffDays < 60) return '1 month ago';
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths} months ago`;
}

const amenityIcons: Record<string, string> = {
  WiFi: '📶', Parking: '🅿️', 'Swimming Pool': '🏊', Gym: '🏋️', Garden: '🌿',
  Security: '🔒', Elevator: '🛗', 'Air Conditioning': '❄️', Heating: '🔥',
  Balcony: '🏗️', 'Storage Room': '📦', Laundry: '👕', Kitchen: '🍳',
  'Pet Friendly': '🐾', 'Backup Generator': '⚡', 'Water Supply': '💧',
  CCTV: '📹', 'Intercom': '📞', Playground: '🎠', Jacuzzi: '🛁',
};

// Staggered entrance variants for grid items
const gridItemVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.08,
      duration: 0.35,
      ease: 'easeOut' as const,
    },
  }),
};

// Thumbnail slide-in variants
const thumbVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: {
      delay: i * 0.06,
      duration: 0.3,
      ease: 'easeOut' as const,
    },
  }),
};

export default function PropertyDetail() {
  const { selectedPropertyId, user, setCurrentView, setShowAuthModal, setAuthMode } = useAppStore();
  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFav, setIsFav] = useState(false);
  const [favLoading, setFavLoading] = useState(false);
  const [inquiryMessage, setInquiryMessage] = useState('');
  const [sendingInquiry, setSendingInquiry] = useState(false);
  const [similarProperties, setSimilarProperties] = useState<Property[]>([]);
  const [avgRating, setAvgRating] = useState(0);
  const [totalReviews, setTotalReviews] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showMobileCTA, setShowMobileCTA] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [carouselApi, setCarouselApi] = useState<CarouselApi | null>(null);
  const [currentCarouselIndex, setCurrentCarouselIndex] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const inquiryRef = useRef<HTMLDivElement>(null);

  // Track carousel index for lightbox integration
  useEffect(() => {
    if (!carouselApi) return;
    const onSelect = () => {
      setCurrentCarouselIndex(carouselApi.selectedScrollSnap());
    };
    carouselApi.on('select', onSelect);
    onSelect(); // Initialize
    return () => {
      carouselApi.off('select', onSelect);
    };
  }, [carouselApi]);

  // Open lightbox at a specific index
  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  // Close lightbox
  const closeLightbox = () => {
    setLightboxOpen(false);
  };

  // Scroll progress tracker and mobile CTA visibility
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight > 0) {
        setScrollProgress(Math.min((scrollTop / docHeight) * 100, 100));
      }

      // Show mobile CTA when scrolled past the inquiry section
      if (inquiryRef.current) {
        const inquiryRect = inquiryRef.current.getBoundingClientRect();
        setShowMobileCTA(inquiryRect.top < 0);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [property]);

  useEffect(() => {
    if (!selectedPropertyId) return;
    setLoading(true);
    fetch(`/api/properties/${selectedPropertyId}`)
      .then((res) => res.json())
      .then((data) => {
        setProperty(data);
        setIsFav(data.isFavorited || false);

        // Fetch similar properties
        const params = new URLSearchParams();
        if (data.city) params.set('city', data.city);
        if (data.propertyType) params.set('propertyType', data.propertyType);
        params.set('limit', '4');
        fetch(`/api/properties?${params.toString()}`)
          .then((res) => res.ok ? res.json() : null)
          .then((similarData) => {
            if (similarData?.properties) {
              const filtered = similarData.properties
                .filter((p: Property) => p.id !== data.id)
                .slice(0, 3);
              setSimilarProperties(filtered);
            }
          })
          .catch(() => {});

        // Fetch reviews summary
        fetch(`/api/reviews?propertyId=${data.id}`)
          .then((res) => res.ok ? res.json() : null)
          .then((reviewData) => {
            if (reviewData) {
              setAvgRating(reviewData.avgRating || 0);
              setTotalReviews(reviewData.totalReviews || 0);
            }
          })
          .catch(() => {});
      })
      .catch(() => toast.error('Failed to load property'))
      .finally(() => setLoading(false));
  }, [selectedPropertyId]);

  const handleFavorite = async () => {
    if (!user) {
      toast.error('Please login to save favorites');
      setAuthMode('login');
      setShowAuthModal(true);
      return;
    }
    setFavLoading(true);
    try {
      const res = await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId: property!.id }),
      });
      if (res.ok) {
        const data = await res.json();
        setIsFav(data.favorited);
        toast.success(data.favorited ? 'Added to favorites' : 'Removed from favorites');
      }
    } catch {
      toast.error('Failed to update favorite');
    } finally {
      setFavLoading(false);
    }
  };

  const handleInquiry = async () => {
    if (!user) {
      toast.error('Please login to send an inquiry');
      setAuthMode('login');
      setShowAuthModal(true);
      return;
    }
    if (!inquiryMessage.trim()) {
      toast.error('Please enter a message');
      return;
    }
    setSendingInquiry(true);
    try {
      const res = await fetch(`/api/properties/${property!.id}/inquiries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: inquiryMessage }),
      });
      if (res.ok) {
        toast.success('Inquiry sent successfully!');
        setInquiryMessage('');
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to send inquiry');
      }
    } catch {
      toast.error('Failed to send inquiry');
    } finally {
      setSendingInquiry(false);
    }
  };

  const handleShare = async (platform?: string) => {
    const url = window.location.href;
    const text = `Check out this property: ${property?.title} - ${property ? formatUGX(property.price, property.listingType) : ''}`;
    
    if (platform === 'whatsapp') {
      window.open(`https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`, '_blank');
    } else if (platform === 'twitter') {
      window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
    } else if (platform === 'facebook') {
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
    } else {
      try {
        await navigator.clipboard.writeText(url);
        toast.success('Link copied to clipboard!');
      } catch {
        toast.error('Failed to copy link');
      }
    }
  };

  const scrollToInquiry = () => {
    const el = document.getElementById('inquiry-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <div className="h-8 w-24 animate-pulse rounded bg-muted" />
        <div className="aspect-[16/9] animate-pulse rounded-xl bg-muted" />
        <div className="space-y-4">
          <div className="h-8 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-6 w-1/2 animate-pulse rounded bg-muted" />
          <div className="h-32 animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Home className="h-16 w-16 text-muted-foreground/40" />
        <h2 className="mt-4 text-xl font-semibold">Property not found</h2>
        <Button className="mt-4" onClick={() => setCurrentView('home')}>
          Back to Home
        </Button>
      </div>
    );
  }

  const isLandlord = user?.role === 'LANDLORD' || user?.role === 'ADMIN';
  const isOwnProperty = user?.id === property.landlordId;

  // Determine listing type display text
  const getListingTypeDisplay = () => {
    if (property.listingType === 'SALE') return 'Property for Sale';
    if (property.listingType === 'RENT') return 'Available for Rent';
    if (property.listingType === 'BOTH') return 'Available for Rent or Purchase';
    return 'Available';
  };

  return (
    <>
      {/* Progress bar showing scroll progress */}
      <div className="fixed top-16 left-0 right-0 z-30 h-1 bg-transparent">
        <div
          className="h-full bg-gradient-to-r from-red-500 to-cyan-500 transition-all duration-150 ease-out"
          style={{ width: `${scrollProgress}%` }}
        />
      </div>

      <motion.div
        ref={contentRef}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="mx-auto max-w-6xl px-4 py-6 space-y-6"
      >
        {/* Top Bar */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => setCurrentView('home')} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="icon">
                  <Share2 className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Share2 className="h-5 w-5 text-red-600" />
                    Share this Property
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">Share &quot;{property.title}&quot; with friends and family</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      variant="outline"
                      className="gap-2 h-12 bg-green-50 hover:bg-green-100 border-green-200 dark:bg-green-950/30 dark:border-green-800 dark:hover:bg-green-950/50"
                      onClick={() => handleShare('whatsapp')}
                    >
                      <svg className="h-5 w-5 text-green-600" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      WhatsApp
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-2 h-12 bg-sky-50 hover:bg-sky-100 border-sky-200 dark:bg-sky-950/30 dark:border-sky-800 dark:hover:bg-sky-950/50"
                      onClick={() => handleShare('twitter')}
                    >
                      <svg className="h-5 w-5 text-sky-500" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                      Twitter / X
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-2 h-12 bg-blue-50 hover:bg-blue-100 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800 dark:hover:bg-blue-950/50"
                      onClick={() => handleShare('facebook')}
                    >
                      <svg className="h-5 w-5 text-blue-600" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                      Facebook
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-2 h-12 bg-red-50 hover:bg-red-100 border-red-200 dark:bg-red-950/30 dark:border-red-800 dark:hover:bg-red-950/50"
                      onClick={() => handleShare()}
                    >
                      <Link2 className="h-5 w-5 text-red-600" />
                      Copy Link
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Button
              variant="outline"
              size="icon"
              onClick={handleFavorite}
              disabled={favLoading}
            >
              <Heart className={`h-4 w-4 ${isFav ? 'fill-red-500 text-red-500' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Image Gallery */}
        {property.images && property.images.length > 0 && (
          <div className="space-y-3">
            <Carousel className="w-full" opts={{ loop: true }} setApi={setCarouselApi}>
              <CarouselContent>
                {property.images.map((img, i) => (
                  <CarouselItem key={img.id}>
                    <div
                      className="relative aspect-[16/9] overflow-hidden rounded-xl cursor-pointer group"
                      onClick={() => openLightbox(i)}
                    >
                      <Image
                        src={img.url}
                        alt={img.caption || property.title}
                        fill
                        className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                        unoptimized
                        priority
                      />
                      {/* Click-to-expand overlay hint */}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-200 flex items-center justify-center">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center gap-1.5 bg-white/80 dark:bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5">
                          <Maximize className="h-4 w-4 text-red-600" />
                          <span className="text-xs font-medium text-red-700 dark:text-red-400">View Full Size</span>
                        </div>
                      </div>
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              {property.images.length > 1 && (
                <>
                  <CarouselPrevious className="left-4 bg-white/80 backdrop-blur-sm hover:bg-white" />
                  <CarouselNext className="right-4 bg-white/80 backdrop-blur-sm hover:bg-white" />
                </>
              )}
            </Carousel>

            {/* Thumbnails with slide-in animation */}
            {property.images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {property.images.map((img, i) => (
                  <motion.div
                    key={img.id}
                    custom={i}
                    variants={thumbVariants}
                    initial="hidden"
                    animate="visible"
                    className="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2 border-transparent cursor-pointer hover:border-red-500 transition-colors"
                    onClick={() => openLightbox(i)}
                  >
                    <Image
                      src={img.url}
                      alt={img.caption || `Photo ${i + 1}`}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                    {/* Expand icon overlay */}
                    <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-center justify-center">
                      <Maximize className="h-3.5 w-3.5 text-white opacity-0 hover:opacity-100 transition-opacity" />
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Virtual Tour Placeholder */}
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <div className="relative flex h-48 items-center justify-center bg-gradient-to-br from-red-50 to-cyan-50 dark:from-red-950/30 dark:to-cyan-950/30">
                  <div className="absolute inset-0 opacity-10" style={{
                    backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 35px, rgba(0,0,0,0.05) 35px, rgba(0,0,0,0.05) 70px)',
                  }} />
                  <div className="relative flex flex-col items-center gap-3">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/50">
                      <Box className="h-8 w-8 text-red-600" />
                    </div>
                    <p className="text-lg font-semibold text-red-700 dark:text-red-400">Virtual Tour Coming Soon</p>
                    <p className="text-sm text-muted-foreground">Experience this property from the comfort of your home</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-1 gap-1.5 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:hover:bg-red-950/50"
                      onClick={() => toast.success('You\'ll be notified when the virtual tour is available!')}
                    >
                      <Bell className="h-3.5 w-3.5" />
                      Be Notified
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left Column - Details */}
          <div className="space-y-6 lg:col-span-2">
            {/* Title & Price */}
            <div>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold sm:text-3xl">{property.title}</h1>
                  <div className="mt-2 flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4 text-red-500" />
                    <span>{property.address}, {property.city}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <p className="text-2xl font-bold text-red-600">{formatUGX(property.price, property.listingType)}</p>
                    <PropertyValueBadge
                      price={property.price}
                      area={property.area}
                      city={property.city}
                      propertyType={property.propertyType}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    UGX {Math.round(property.price / property.area).toLocaleString()}/sqm
                  </p>
                  <div className="mt-1 flex items-center justify-end gap-2 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Eye className="h-3.5 w-3.5" />
                      {property.views} views
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      Listed {getListedDaysAgo(property.createdAt)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Badge variant="secondary">
                  {propertyTypeLabels[property.propertyType] || property.propertyType}
                </Badge>
                {/* Listing Type Badge */}
                <Badge className={listingTypeColors[property.listingType] || 'bg-gray-100 text-gray-800'}>
                  {listingTypeLabels[property.listingType] || property.listingType}
                </Badge>
                <Badge variant={property.status === 'AVAILABLE' ? 'default' : 'secondary'}
                  className={property.status === 'AVAILABLE' ? 'bg-red-600' : ''}>
                  {property.status === 'AVAILABLE' ? 'Available' : property.status}
                </Badge>
                {property.featured && (
                  <Badge className="bg-amber-500">Featured</Badge>
                )}
                {avgRating > 0 && (
                  <Badge variant="outline" className="gap-1 border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                    <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                    {avgRating.toFixed(1)} ({totalReviews})
                  </Badge>
                )}
              </div>
            </div>

            <Separator />

            {/* Property Details Grid with staggered entrance */}
            <div>
              <h2 className="text-lg font-semibold mb-4">Property Details</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {[
                  ...(property.propertyType !== 'LAND' ? [
                    { icon: Bed, label: 'Bedrooms', value: property.bedrooms },
                    { icon: Bath, label: 'Bathrooms', value: property.bathrooms },
                  ] : []),
                  { icon: Maximize, label: 'Area', value: `${property.area} sqm` },
                  { icon: Building2, label: 'Type', value: propertyTypeLabels[property.propertyType] || property.propertyType },
                  ...(property.yearBuilt ? [{ icon: Calendar, label: 'Year Built', value: property.yearBuilt }] : []),
                  ...(property.floor ? [{ icon: Building2, label: 'Floor', value: `${property.floor}/${property.totalFloors || '?'}` }] : []),
                ].map(({ icon: Icon, label, value }, i) => (
                  <motion.div
                    key={label}
                    custom={i}
                    variants={gridItemVariants}
                    initial="hidden"
                    animate="visible"
                    className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:border-red-200 dark:hover:border-red-800"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 dark:bg-red-950/50">
                      <Icon className="h-5 w-5 text-red-600" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="font-semibold">{String(value)}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Features */}
            <div>
              <h2 className="text-lg font-semibold mb-4">Features</h2>
              <div className="flex flex-wrap gap-3">
                {property.furnished && (
                  <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
                    <Sofa className="h-4 w-4 text-red-600" />
                    <span className="text-sm font-medium">Furnished</span>
                    <Check className="h-3.5 w-3.5 text-red-600" />
                  </div>
                )}
                {property.parking && (
                  <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
                    <Car className="h-4 w-4 text-red-600" />
                    <span className="text-sm font-medium">Parking</span>
                    <Check className="h-3.5 w-3.5 text-red-600" />
                  </div>
                )}
                {property.petsAllowed && (
                  <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
                    <PawPrint className="h-4 w-4 text-red-600" />
                    <span className="text-sm font-medium">Pets Allowed</span>
                    <Check className="h-3.5 w-3.5 text-red-600" />
                  </div>
                )}
                {!property.furnished && !property.parking && !property.petsAllowed && (
                  <p className="text-sm text-muted-foreground">No specific features listed</p>
                )}
              </div>
            </div>

            {/* Amenities */}
            {property.amenities && property.amenities.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-4">Amenities</h2>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {property.amenities.map((pa) => (
                    <div key={pa.id} className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                      <span className="text-lg">{amenityIcons[pa.amenity.name] || '✨'}</span>
                      <span className="text-sm">{pa.amenity.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Land & Title Information */}
            <Card className="border-amber-200 dark:border-amber-800">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Landmark className="h-5 w-5 text-amber-600" />
                  <CardTitle className="text-base">Land & Title Information</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-3">
                  {/* Land Title Type Badge */}
                  {property.landTitleType && (
                    <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
                      <FileText className="h-4 w-4 text-amber-600" />
                      <span className="text-sm font-medium">Land Title:</span>
                      <Badge className={landTitleTypeColors[property.landTitleType] || 'bg-gray-100 text-gray-800'}>
                        {landTitleTypeLabels[property.landTitleType] || property.landTitleType}
                      </Badge>
                    </div>
                  )}

                  {/* Listing Type Badge */}
                  <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
                    <Tag className="h-4 w-4 text-red-600" />
                    <span className="text-sm font-medium">Listing:</span>
                    <Badge className={listingTypeColors[property.listingType] || 'bg-gray-100 text-gray-800'}>
                      {listingTypeLabels[property.listingType] || property.listingType}
                    </Badge>
                  </div>
                </div>

                {/* Prominent listing type display */}
                <div className={`rounded-lg p-4 text-center font-semibold ${
                  property.listingType === 'SALE'
                    ? 'bg-cyan-50 text-cyan-800 border border-cyan-200 dark:bg-cyan-950/30 dark:text-cyan-400 dark:border-cyan-800'
                    : property.listingType === 'BOTH'
                      ? 'bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800'
                      : 'bg-green-50 text-green-800 border border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800'
                }`}>
                  {getListingTypeDisplay()}
                </div>

                {!property.landTitleType && (
                  <p className="text-sm text-muted-foreground">
                    No land title information provided for this property.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Description with subtle background pattern */}
            <div className="relative rounded-xl overflow-hidden">
              <div className="absolute inset-0 opacity-[0.03]" style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23000' fill-opacity='1' fill-rule='evenodd'%3E%3Cpath d='M0 38.59l2.83-2.83 1.41 1.41L1.41 40H0v-1.41zM0 1.4l2.83 2.83 1.41-1.41L1.41 0H0v1.41zM38.59 40l-2.83-2.83 1.41-1.41L40 38.59V40h-1.41zM40 1.41l-2.83 2.83-1.41-1.41L38.59 0H40v1.41zM20 18.6l2.83-2.83 1.41 1.41L21.41 20l2.83 2.83-1.41 1.41L20 21.41l-2.83 2.83-1.41-1.41L18.59 20l-2.83-2.83 1.41-1.41L20 18.59z'/%3E%3C/g%3E%3C/svg%3E")`,
              }} />
              <div className="relative p-6 bg-muted/30 dark:bg-muted/10">
                <h2 className="text-lg font-semibold mb-4">Description</h2>
                <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                  {property.description}
                </p>
              </div>
            </div>
          </div>

          {/* Right Column - Sidebar */}
          <div className="space-y-6">
            {/* Landlord Card */}
            <Card className="border-l-4 border-l-red-500">
              <CardHeader>
                <CardTitle className="text-base">Listed by</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={property.landlord.avatar || undefined} alt={property.landlord.name} />
                    <AvatarFallback className="bg-red-100 text-red-700">
                      {property.landlord.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold">{property.landlord.name}</p>
                    {property.landlord.verified && (
                      <Badge variant="outline" className="mt-0.5 gap-1 text-red-600 border-red-200 bg-red-50">
                        <Check className="h-3 w-3" /> Verified
                      </Badge>
                    )}
                  </div>
                </div>
                {property.landlord.phone && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="h-4 w-4" />
                    {property.landlord.phone}
                  </div>
                )}
                {property.landlord.bio && (
                  <p className="text-sm text-muted-foreground">{property.landlord.bio}</p>
                )}
                <div className="flex gap-2 text-sm text-muted-foreground">
                  <MessageSquare className="h-4 w-4" />
                  {property._count?.inquiries || 0} inquiries
                </div>
              </CardContent>
            </Card>

            {/* Inquiry Form */}
            {!isOwnProperty && (
              <Card id="inquiry-section" ref={inquiryRef}>
                <CardHeader>
                  <CardTitle className="text-base">Interested in this property?</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    placeholder="Send a message to the landlord..."
                    value={inquiryMessage}
                    onChange={(e) => setInquiryMessage(e.target.value)}
                    className="min-h-[100px]"
                  />
                  <Button
                    className="w-full bg-red-600 hover:bg-red-700 text-white"
                    onClick={handleInquiry}
                    disabled={sendingInquiry || !inquiryMessage.trim()}
                  >
                    <MessageSquare className="mr-2 h-4 w-4" />
                    {sendingInquiry ? 'Sending...' : 'Send Inquiry'}
                  </Button>
                  {!user && (
                    <p className="text-xs text-center text-muted-foreground">
                      <button
                        className="text-red-600 hover:underline"
                        onClick={() => { setAuthMode('login'); setShowAuthModal(true); }}
                      >
                        Login
                      </button>
                      {' '}to send inquiries
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Safety Warning */}
            <Card className="border-amber-300 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20">
              <CardContent className="p-4">
                <div className="flex gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/50">
                    <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="font-semibold text-amber-800 dark:text-amber-300 text-sm">
                      ⚠️ Important Safety Notice
                    </h3>
                    <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                      Before making any payments or signing agreements, please visit the property in person to verify its existence and condition. House For Rent verifies properties before listing, but we advise you to exercise caution with all transactions.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Schedule Viewing - Availability Calendar */}
            {!isOwnProperty && (
              <AvailabilityCalendar propertyId={property.id} />
            )}

            {/* Cost Calculator */}
            <CostCalculator
              rent={property.price}
              area={property.area}
              bedrooms={property.bedrooms}
              parkingIncluded={property.parking}
              furnished={property.furnished}
            />

            {/* Favorite Button */}
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={handleFavorite}
              disabled={favLoading}
            >
              <Heart className={`h-4 w-4 ${isFav ? 'fill-red-500 text-red-500' : ''}`} />
              {isFav ? 'Saved to Favorites' : 'Save to Favorites'}
            </Button>
          </div>
        </div>

        {/* Similar Properties */}
        {similarProperties.length > 0 && (
          <div className="mt-10">
            <Separator className="mb-8" />
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-block h-1.5 w-6 rounded-full bg-red-500" />
              <h2 className="text-xl font-bold">Similar Properties in {property.city}</h2>
            </div>
            <div className="flex gap-6 overflow-x-auto pb-4">
              {similarProperties.map((similar, i) => (
                <div key={similar.id} className="min-w-[280px] max-w-[320px] shrink-0">
                  <PropertyCard property={similar} index={i} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reviews & Ratings */}
        <div className="mt-10">
          <Separator className="mb-8" />
          <PropertyReviews propertyId={property.id} />
        </div>
      </motion.div>

      {/* Sticky "Book Now" CTA bar - mobile only, visible when scrolled past inquiry form */}
      <AnimatePresence>
        {showMobileCTA && !isOwnProperty && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="fixed bottom-16 left-0 right-0 z-30 lg:hidden"
          >
            <div className="mx-4 mb-2 flex items-center gap-3 rounded-xl bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border border-red-200 dark:border-red-800 p-3 shadow-xl shadow-red-500/10">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{property.title}</p>
                <p className="text-red-600 font-bold text-lg">{formatUGX(property.price, property.listingType)}</p>
              </div>
              <Button
                className="shrink-0 bg-red-600 hover:bg-red-700 text-white px-4"
                onClick={scrollToInquiry}
              >
                <MessageSquare className="mr-1.5 h-4 w-4" />
                Book Now
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Image Lightbox */}
      {property.images && property.images.length > 0 && (
        <ImageLightbox
          images={property.images}
          initialIndex={lightboxIndex}
          isOpen={lightboxOpen}
          onClose={closeLightbox}
          title={property.title}
        />
      )}
    </>
  );
}
