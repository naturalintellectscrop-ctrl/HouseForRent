'use client';

import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Bed, Bath, Maximize, Sofa, Car, PawPrint, MessageSquare, Eye, Check,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useAppStore, type Property } from '@/store/useAppStore';
import { formatUGX, propertyTypeLabels, propertyTypeColors, listingTypeLabels, listingTypeColors } from './PropertyCard';
import { toast } from 'sonner';

export default function PropertyQuickView() {
  const { quickViewPropertyId, setQuickViewPropertyId, setSelectedPropertyId, setCurrentView, setShowAuthModal, setAuthMode, user } = useAppStore();
  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchProperty = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/properties/${id}`);
      if (res.ok) {
        const data = await res.json();
        setProperty(data);
      } else {
        toast.error('Failed to load property');
      }
    } catch {
      toast.error('Failed to load property');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (quickViewPropertyId) {
      fetchProperty(quickViewPropertyId);
    }
  }, [quickViewPropertyId, fetchProperty]);

  const handleViewFullDetails = () => {
    if (property) {
      setQuickViewPropertyId(null);
      setSelectedPropertyId(property.id);
      setCurrentView('property-detail');
    }
  };

  const handleContactLandlord = () => {
    if (!user) {
      toast.error('Please login to contact a landlord');
      setAuthMode('login');
      setShowAuthModal(true);
      return;
    }
    if (property) {
      setQuickViewPropertyId(null);
      setSelectedPropertyId(property.id);
      setCurrentView('property-detail');
      // Scroll to inquiry form after a short delay
      setTimeout(() => {
        const inquirySection = document.getElementById('inquiry-section');
        if (inquirySection) {
          inquirySection.scrollIntoView({ behavior: 'smooth' });
        }
      }, 300);
    }
  };

  const isOpen = quickViewPropertyId !== null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) setQuickViewPropertyId(null); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        {loading ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-48 w-full rounded-lg" />
            <div className="flex gap-3">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="h-16 w-full" />
          </div>
        ) : property ? (
          <>
            {/* Image */}
            {property.images && property.images.length > 0 && (
              <div className="relative aspect-video w-full overflow-hidden rounded-t-lg">
                <Image
                  src={property.images[0].url}
                  alt={property.title}
                  fill
                  className="object-cover"
                  unoptimized
                />
                <div className="absolute left-3 bottom-3">
                  <Badge className="bg-red-600 text-white text-sm font-semibold px-3 py-1 shadow-md hover:bg-red-700">
                    {formatUGX(property.price, property.listingType)}
                  </Badge>
                </div>
                {property.images.length > 1 && (
                  <div className="absolute right-3 top-3">
                    <Badge variant="secondary" className="bg-black/50 text-white backdrop-blur-sm text-xs">
                      {property.images.length} photos
                    </Badge>
                  </div>
                )}
              </div>
            )}

            <div className="p-6 space-y-4">
              <DialogHeader className="p-0 space-y-0 text-left">
                <DialogTitle className="text-xl font-bold">{property.title}</DialogTitle>
                <DialogDescription className="flex items-center gap-1 text-muted-foreground">
                  <MapPin className="h-4 w-4 text-red-500" />
                  {property.address}, {property.city}
                </DialogDescription>
              </DialogHeader>

              <Separator />

              {/* Key Details */}
              <div className="flex flex-wrap gap-4 text-sm">
                <div className="flex items-center gap-1.5">
                  <Bed className="h-4 w-4 text-red-600" />
                  <span>{property.bedrooms} Bed</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Bath className="h-4 w-4 text-red-600" />
                  <span>{property.bathrooms} Bath</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Maximize className="h-4 w-4 text-red-600" />
                  <span>{property.area} sqm</span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Eye className="h-4 w-4" />
                  <span>{property.views} views</span>
                </div>
              </div>

              {/* Feature Badges */}
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant="secondary"
                  className={propertyTypeColors[property.propertyType] || 'bg-gray-100 text-gray-800'}
                >
                  {propertyTypeLabels[property.propertyType] || property.propertyType}
                </Badge>
                <Badge className={listingTypeColors[property.listingType] || 'bg-gray-100 text-gray-800'}>
                  {listingTypeLabels[property.listingType] || property.listingType}
                </Badge>
                {property.furnished && (
                  <Badge variant="outline" className="gap-1">
                    <Sofa className="h-3 w-3" /> Furnished
                  </Badge>
                )}
                {property.parking && (
                  <Badge variant="outline" className="gap-1">
                    <Car className="h-3 w-3" /> Parking
                  </Badge>
                )}
                {property.petsAllowed && (
                  <Badge variant="outline" className="gap-1">
                    <PawPrint className="h-3 w-3" /> Pets OK
                  </Badge>
                )}
              </div>

              <Separator />

              {/* Landlord Info */}
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={property.landlord?.avatar || undefined} alt={property.landlord?.name} />
                  <AvatarFallback className="bg-red-100 text-red-700 text-sm">
                    {property.landlord?.name?.charAt(0) || '?'}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold truncate">{property.landlord?.name}</p>
                    {property.landlord?.verified && (
                      <Check className="h-3.5 w-3.5 text-red-600 shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">Landlord</p>
                </div>
              </div>

              <Separator />
              <div className="flex gap-3">
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                  onClick={handleViewFullDetails}
                >
                  View Full Details
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 gap-2 border-red-600 text-red-600 hover:bg-red-50"
                  onClick={handleContactLandlord}
                >
                  <MessageSquare className="h-4 w-4" />
                  Contact Landlord
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
