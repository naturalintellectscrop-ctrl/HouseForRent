'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { MapPin, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useAppStore, type Property } from '@/store/useAppStore';
import { formatUGX } from './PropertyCard';

const STORAGE_KEY = 'recently-viewed-properties';
const MAX_RECENT = 6;

function getRecentlyViewedIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function addRecentlyViewedId(id: string) {
  if (typeof window === 'undefined') return;
  try {
    const existing = getRecentlyViewedIds();
    const filtered = existing.filter((eid) => eid !== id);
    const updated = [id, ...filtered].slice(0, MAX_RECENT);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Silently fail
  }
}

export default function RecentlyViewed() {
  const { selectedPropertyId, currentView, setSelectedPropertyId, setCurrentView } = useAppStore();
  const [recentProperties, setRecentProperties] = useState<Property[]>([]);

  // Track recently viewed property IDs
  useEffect(() => {
    if (currentView === 'property-detail' && selectedPropertyId) {
      addRecentlyViewedId(selectedPropertyId);
    }
  }, [currentView, selectedPropertyId]);

  // Fetch recent properties when on home view
  useEffect(() => {
    if (currentView !== 'home') return;
    const ids = getRecentlyViewedIds();

    if (ids.length === 0) {
      return;
    }

    Promise.all(
      ids.map((id) =>
        fetch(`/api/properties/${id}`)
          .then((res) => (res.ok ? res.json() : null))
          .catch(() => null)
      )
    ).then((results) => {
      const valid = results.filter(Boolean) as Property[];
      // Preserve order from localStorage
      const ordered = ids
        .map((id) => valid.find((p) => p.id === id))
        .filter(Boolean) as Property[];
      setRecentProperties(ordered);
    });
  }, [currentView]);

  const handleClick = (propertyId: string) => {
    setSelectedPropertyId(propertyId);
    setCurrentView('property-detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (currentView !== 'home' || recentProperties.length === 0) return null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Clock className="h-5 w-5 text-red-600" />
          <h2 className="text-xl font-bold">Recently Viewed</h2>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-thin">
          {recentProperties.map((property, index) => (
            <motion.div
              key={property.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              className="shrink-0 w-56 cursor-pointer group"
              onClick={() => handleClick(property.id)}
            >
              <div className="overflow-hidden rounded-lg border bg-card shadow-sm transition-shadow hover:shadow-md">
                {/* Image */}
                <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                  {property.images?.[0]?.url ? (
                    <Image
                      src={property.images[0].url}
                      alt={property.title}
                      fill
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-gradient-to-br from-red-100 to-red-50">
                      <MapPin className="h-8 w-8 text-red-300" />
                    </div>
                  )}

                  {/* Price */}
                  <div className="absolute left-2 bottom-2">
                    <Badge className="bg-red-600 text-white hover:bg-red-700 text-xs font-semibold px-2 py-0.5 shadow-md">
                      {formatUGX(property.price, property.listingType)}
                    </Badge>
                  </div>
                </div>

                {/* Content */}
                <div className="p-3 space-y-1.5">
                  <h3 className="font-medium text-sm line-clamp-1 group-hover:text-red-600 transition-colors">
                    {property.title}
                  </h3>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 text-red-500 shrink-0" />
                    <span className="line-clamp-1">{property.city}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
