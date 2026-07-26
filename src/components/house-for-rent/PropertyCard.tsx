'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, MapPin, Bed, Bath, Maximize, Car, PawPrint, GitCompare, Eye, Star, Eye as ViewIcon, Sofa, ShieldCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import PriceDropBadge from './PriceDropBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAppStore, type Property } from '@/store/useAppStore';
import { toast } from 'sonner';

const formatUGX = (amount: number, listingType?: string) => {
  const suffix = listingType === 'SALE' ? '' : '/mo';
  return `UGX ${amount.toLocaleString('en-UG')}${suffix}`;
};

const propertyTypeLabels: Record<string, string> = {
  APARTMENT: 'Apartment',
  HOUSE: 'House',
  VILLA: 'Villa',
  STUDIO: 'Studio',
  BUNGALOW: 'Bungalow',
  TOWNHOUSE: 'Townhouse',
  BEDSITTER: 'Bedsitter',
  CONDO: 'Condominium',
  LAND: 'Land',
};

const propertyTypeColors: Record<string, string> = {
  APARTMENT: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
  HOUSE: 'bg-green-100 text-green-800 hover:bg-green-100',
  VILLA: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  STUDIO: 'bg-purple-100 text-purple-800 hover:bg-purple-100',
  CONDO: 'bg-cyan-100 text-cyan-800 hover:bg-cyan-100',
  TOWNHOUSE: 'bg-orange-100 text-orange-800 hover:bg-orange-100',
  BUNGALOW: 'bg-rose-100 text-rose-800 hover:bg-rose-100',
  BEDSITTER: 'bg-gray-100 text-gray-800 hover:bg-gray-100',
  LAND: 'bg-orange-100 text-orange-800 hover:bg-orange-100',
};

const listingTypeLabels: Record<string, string> = {
  RENT: 'For Rent',
  SALE: 'For Sale',
  BOTH: 'Rent/Sale',
};

const listingTypeColors: Record<string, string> = {
  RENT: 'bg-green-100 text-green-800',
  SALE: 'bg-cyan-100 text-cyan-800',
  BOTH: 'bg-amber-100 text-amber-800',
};

// Staggered entrance variants for grid items
const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      delay: i * 0.08,
      duration: 0.4,
      ease: 'easeOut' as const,
    },
  }),
};

export default function PropertyCard({ property, index = 0 }: { property: Property; index?: number }) {
  const { user, setSelectedPropertyId, setCurrentView, setQuickViewPropertyId, comparisonList, addToComparison, removeFromComparison } = useAppStore();
  const [isFav, setIsFav] = useState(property.isFavorited || false);
  const [favLoading, setFavLoading] = useState(false);
  const [heartAnimating, setHeartAnimating] = useState(false);
  const [compareAnimating, setCompareAnimating] = useState(false);

  // Carousel state
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isHovering, setIsHovering] = useState(false);
  const images = property.images?.map((img) => img.url).filter(Boolean) || [];
  const totalImages = images.length;

  // Auto-cycling carousel
  const nextImage = useCallback(() => {
    if (totalImages <= 1) return;
    setCurrentImageIndex((prev) => (prev + 1) % totalImages);
  }, [totalImages]);

  const prevImage = useCallback(() => {
    if (totalImages <= 1) return;
    setCurrentImageIndex((prev) => (prev - 1 + totalImages) % totalImages);
  }, [totalImages]);

  useEffect(() => {
    if (totalImages <= 1 || isHovering) return;
    const interval = setInterval(nextImage, 4000);
    return () => clearInterval(interval);
  }, [totalImages, isHovering, nextImage]);

  const isInComparison = comparisonList.includes(property.id);
  const isComparisonFull = comparisonList.length >= 3;
  const isNew = new Date(property.createdAt) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const isHighlyViewed = (property.views || 0) > 50;
  const isFeatured = property.featured;

  const handleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      toast.error('Please login to save favorites');
      return;
    }
    setFavLoading(true);
    try {
      const res = await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId: property.id }),
      });
      if (res.ok) {
        const data = await res.json();
        setIsFav(data.favorited);
        if (data.favorited) {
          setHeartAnimating(true);
          setTimeout(() => setHeartAnimating(false), 400);
        }
        toast.success(data.favorited ? 'Added to favorites' : 'Removed from favorites');
      }
    } catch {
      toast.error('Failed to update favorite');
    } finally {
      setFavLoading(false);
    }
  };

  const handleClick = () => {
    setSelectedPropertyId(property.id);
    setCurrentView('property-detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCompareToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCompareAnimating(true);
    setTimeout(() => setCompareAnimating(false), 300);
    if (isInComparison) {
      removeFromComparison(property.id);
      toast.success('Removed from comparison');
    } else if (isComparisonFull) {
      toast.error('Maximum 3 properties can be compared at once');
    } else {
      addToComparison(property.id);
      toast.success('Added to comparison');
    }
  };

  const handleCarouselPrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    prevImage();
  };

  const handleCarouselNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    nextImage();
  };

  return (
    <motion.div
      custom={index}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      className="group cursor-pointer"
      onClick={handleClick}
    >
      <div className="relative overflow-hidden rounded-xl border bg-card shadow-sm transition-all duration-300 hover:shadow-lg hover:border-red-200 dark:hover:border-red-800">
        {/* Animated gradient border on hover */}
        <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none z-10"
          style={{
            background: 'linear-gradient(var(--gradient-angle, 0deg), oklch(0.577 0.245 27.325), oklch(0.6 0.2 192), oklch(0.577 0.245 27.325))',
            padding: '2px',
            WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude',
            animation: 'gradient-rotate 3s linear infinite',
          }}
        />

        {/* Image Carousel */}
        <div
          className="relative aspect-[4/3] overflow-hidden bg-muted"
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
        >
          {images.length > 0 ? (
            <div className="relative w-full h-full">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentImageIndex}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="absolute inset-0"
                >
                  <Image
                    src={images[currentImageIndex]}
                    alt={`${property.title} - Image ${currentImageIndex + 1}`}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-110"
                    unoptimized
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-red-100 to-red-50 dark:from-red-950/50 dark:to-red-900/30">
              <MapPin className="h-12 w-12 text-red-300 dark:text-red-700" />
            </div>
          )}

          {/* Carousel Navigation Arrows - visible on hover */}
          {totalImages > 1 && (
            <>
              <button
                onClick={handleCarouselPrev}
                className="absolute left-2 top-1/2 -translate-y-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/70 backdrop-blur-sm shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-white/90"
              >
                <ChevronLeft className="h-4 w-4 text-gray-700" />
              </button>
              <button
                onClick={handleCarouselNext}
                className="absolute right-2 top-1/2 -translate-y-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/70 backdrop-blur-sm shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-white/90"
              >
                <ChevronRight className="h-4 w-4 text-gray-700" />
              </button>
            </>
          )}

          {/* Dot indicators */}
          {totalImages > 1 && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-[2] flex items-center gap-1.5">
              {images.map((_, i) => (
                <button
                  key={i}
                  onClick={(e) => { e.stopPropagation(); setCurrentImageIndex(i); }}
                  className={`h-1.5 w-1.5 rounded-full transition-all duration-200 ${
                    i === currentImageIndex
                      ? 'bg-red-500 w-3'
                      : 'bg-white/80 hover:bg-white'
                  }`}
                />
              ))}
            </div>
          )}

          {/* Always-visible gradient overlay at bottom of image for price readability */}
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/40 to-transparent pointer-events-none z-[1]" />

          {/* Hover Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-red-900/70 via-red-800/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
            <Button
              className="bg-white/90 text-red-700 hover:bg-white font-medium shadow-lg"
              onClick={(e) => {
                e.stopPropagation();
                setQuickViewPropertyId(property.id);
              }}
            >
              <Eye className="mr-2 h-4 w-4" />
              Quick View
            </Button>
          </div>

          {/* New Badge with pulse */}
          {isNew && (
            <div className="absolute left-3 top-3 z-10">
              <Badge className="bg-green-500 text-white hover:bg-green-500 text-xs font-bold px-2 py-0.5 shadow-md animate-badge-pulse">
                New
              </Badge>
            </div>
          )}

          {/* Compare Checkbox - top-left below New badge */}
          <div className={`absolute left-3 z-10 ${isNew ? 'top-12' : 'top-3'}`}>
            <motion.button
              onClick={handleCompareToggle}
              className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium shadow-md backdrop-blur-sm transition-colors ${
                isInComparison
                  ? 'bg-red-600 text-white'
                  : 'bg-white/80 text-gray-700 hover:bg-white'
              }`}
              title={isInComparison ? 'Remove from comparison' : 'Add to comparison'}
              animate={compareAnimating ? { scale: [1, 1.2, 0.9, 1] } : {}}
              transition={{ duration: 0.3 }}
            >
              <GitCompare className="h-3 w-3" />
              <AnimatePresence mode="wait">
                <motion.span
                  key={isInComparison ? 'added' : 'compare'}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.15 }}
                >
                  {isInComparison ? 'Added' : 'Compare'}
                </motion.span>
              </AnimatePresence>
            </motion.button>
          </div>

          {/* Price Badge with pulse for "New" properties */}
          <div className="absolute left-3 bottom-3 z-[2]">
            <Badge className={`text-sm font-semibold px-3 py-1 shadow-md ${
              isNew
                ? 'bg-red-600 text-white hover:bg-red-700 animate-badge-pulse'
                : 'bg-red-600 text-white hover:bg-red-700'
            }`}>
              {formatUGX(property.price, property.listingType)}
            </Badge>
          </div>

          {/* Shimmer line below price for featured properties */}
          {isFeatured && (
            <div className="absolute left-3 bottom-0 z-[2] w-24 h-[3px] overflow-hidden">
              <div
                className="h-full w-full"
                style={{
                  background: 'linear-gradient(90deg, transparent, oklch(0.7 0.2 27), transparent)',
                  animation: 'shimmer 2s infinite',
                  backgroundSize: '200% 100%',
                }}
              />
            </div>
          )}

          {/* Property Type Badge + Listing Type Badge + Hot Deal Badge */}
          <div className="absolute right-3 top-3 flex flex-col items-end gap-1">
            <Badge
              variant="secondary"
              className={`shadow-md backdrop-blur-sm ${propertyTypeColors[property.propertyType] || 'bg-white/90 text-gray-800 hover:bg-white/90'}`}
            >
              {propertyTypeLabels[property.propertyType] || property.propertyType}
            </Badge>
            {/* Listing Type Badge */}
            <Badge
              variant="secondary"
              className={`shadow-md backdrop-blur-sm ${listingTypeColors[property.listingType] || 'bg-gray-100 text-gray-800'}`}
            >
              {listingTypeLabels[property.listingType] || property.listingType}
            </Badge>
            <PriceDropBadge price={property.price} area={property.area} featured={property.featured} />
          </div>

          {/* Favorite Button with scale+color animation */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-3 bottom-3 h-9 w-9 rounded-full bg-white/80 backdrop-blur-sm shadow-md hover:bg-white"
            onClick={handleFavorite}
            disabled={favLoading}
          >
            <Heart
              className={`h-5 w-5 transition-colors ${
                isFav ? 'fill-red-500 text-red-500' : 'text-gray-600'
              } ${heartAnimating ? 'animate-heart-pop' : ''}`}
            />
          </Button>

          {/* Image Count */}
          {totalImages > 1 && (
            <div className="absolute right-3 top-14">
              <Badge variant="secondary" className="bg-black/50 text-white backdrop-blur-sm text-xs">
                {totalImages} photos
              </Badge>
            </div>
          )}

          {/* Viewed indicator for highly viewed properties */}
          {isHighlyViewed && (
            <div className="absolute right-3 bottom-14">
              <Badge variant="secondary" className="bg-amber-500/90 text-white backdrop-blur-sm text-xs gap-1">
                <ViewIcon className="h-3 w-3" />
                {property.views} views
              </Badge>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="relative p-4 space-y-3">
          {/* Subtle red gradient at bottom on hover */}
          <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-red-50/0 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none dark:from-red-950/30" />

          <h3 className="font-semibold text-base line-clamp-1 group-hover:text-red-600 transition-colors">
            {property.title}
          </h3>

          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 text-red-500 shrink-0" />
            <span className="line-clamp-1">{property.city}, {property.address}</span>
          </div>

          {property.propertyType !== 'LAND' && (
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Bed className="h-4 w-4" />
                {property.bedrooms} Bed
              </span>
              <span className="flex items-center gap-1">
                <Bath className="h-4 w-4" />
                {property.bathrooms} Bath
              </span>
              <span className="flex items-center gap-1">
                <Maximize className="h-4 w-4" />
                {property.area} sqm
              </span>
            </div>
          )}

          {property.propertyType === 'LAND' && (
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Maximize className="h-4 w-4" />
                {property.area} sqm
              </span>
            </div>
          )}

          {/* Feature Badges + Verified Landlord */}
          <div className="flex flex-wrap gap-1.5">
            {property.furnished && (
              <Badge variant="outline" className="text-xs gap-1">
                <Sofa className="h-3 w-3" /> Furnished
              </Badge>
            )}
            {property.parking && (
              <Badge variant="outline" className="text-xs gap-1">
                <Car className="h-3 w-3" /> Parking
              </Badge>
            )}
            {property.petsAllowed && (
              <Badge variant="outline" className="text-xs gap-1">
                <PawPrint className="h-3 w-3" /> Pets OK
              </Badge>
            )}
            {/* Verified landlord checkmark */}
            {property.landlord?.verified && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-xs gap-1 border-red-300 text-red-600 dark:border-red-700 dark:text-red-400">
                      <ShieldCheck className="h-3 w-3" /> Verified
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>This landlord is verified and trusted</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>

          {/* Landlord name with verified checkmark */}
          {property.landlord && (
            <div className="flex items-center gap-2 pt-2 border-t border-border/50">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 text-[10px] font-bold shrink-0">
                {property.landlord.name?.charAt(0) || '?'}
              </div>
              <span className="text-xs text-muted-foreground truncate">
                {property.landlord.name}
              </span>
              {property.landlord.verified && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <ShieldCheck className="h-3.5 w-3.5 text-red-500 shrink-0" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Verified landlord</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export { formatUGX, propertyTypeLabels, propertyTypeColors, listingTypeLabels, listingTypeColors };
