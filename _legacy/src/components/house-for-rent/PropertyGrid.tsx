'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, SlidersHorizontal, ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import PropertyCard from './PropertyCard';
import { useAppStore, type Property } from '@/store/useAppStore';

function PropertyCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <Skeleton className="aspect-[4/3] w-full" />
      <div className="space-y-3 p-4">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-16" />
        </div>
      </div>
    </div>
  );
}

export default function PropertyGrid() {
  const {
    properties,
    setProperties,
    totalProperties,
    setTotalProperties,
    currentPage,
    setCurrentPage,
    totalPages,
    setTotalPages,
    searchQuery,
    filters,
    sortBy,
    setSortBy,
    setShowFiltersPanel,
    isLoading,
    setIsLoading,
  } = useAppStore();

  const [featuredProperties, setFeaturedProperties] = useState<Property[]>([]);

  const fetchProperties = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      if (filters.city) params.set('city', filters.city);
      if (filters.propertyType) params.set('propertyType', filters.propertyType);
      if (filters.listingType) params.set('listingType', filters.listingType);
      if (filters.minPrice) params.set('minPrice', filters.minPrice);
      if (filters.maxPrice) params.set('maxPrice', filters.maxPrice);
      if (filters.bedrooms) params.set('bedrooms', filters.bedrooms);
      if (filters.minArea) params.set('minArea', filters.minArea);
      if (filters.maxArea) params.set('maxArea', filters.maxArea);
      if (filters.furnished === true) params.set('furnished', 'true');
      if (filters.parking === true) params.set('parking', 'true');
      if (filters.petsAllowed === true) params.set('petsAllowed', 'true');

      const sortMap: Record<string, string> = {
        newest: 'newest',
        'price-asc': 'price_asc',
        'price-desc': 'price_desc',
        popular: 'popular',
        'area-desc': 'area_desc',
        'area-asc': 'area_asc',
      };
      params.set('sort', sortMap[sortBy] || 'newest');
      params.set('page', currentPage.toString());
      params.set('limit', '12');

      const res = await fetch(`/api/properties?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setProperties(data.properties);
        setTotalProperties(data.total);
        setTotalPages(data.totalPages);
      }
    } catch {
      // Silently fail
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, filters, sortBy, currentPage, setProperties, setTotalProperties, setTotalPages, setIsLoading]);

  const fetchFeatured = useCallback(async () => {
    try {
      const res = await fetch('/api/properties?featured=true&limit=4');
      if (res.ok) {
        const data = await res.json();
        setFeaturedProperties(data.properties);
      }
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  useEffect(() => {
    fetchFeatured();
  }, [fetchFeatured]);

  const hasActiveFilters = searchQuery || filters.city || filters.propertyType || filters.listingType ||
    filters.minPrice || filters.maxPrice || filters.bedrooms ||
    filters.minArea || filters.maxArea || filters.furnished || filters.parking || filters.petsAllowed;

  return (
    <div className="space-y-8">
      {/* Featured Properties (only on home without filters) */}
      {!hasActiveFilters && featuredProperties.length > 0 && currentPage === 1 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <span className="inline-block h-1.5 w-6 rounded-full bg-red-500" />
              Featured Properties
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {featuredProperties.map((property: any, i: number) => (
              <PropertyCard key={property.id} property={property} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="lg:hidden relative"
            onClick={() => setShowFiltersPanel(true)}
          >
            <SlidersHorizontal className="mr-1 h-4 w-4" />
            Filters
            {hasActiveFilters && (
              <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                {[
                  searchQuery, filters.city, filters.propertyType,
                  filters.minPrice, filters.maxPrice, filters.bedrooms,
                  filters.minArea, filters.maxArea, filters.furnished, filters.parking, filters.petsAllowed
                ].filter(Boolean).length}
              </span>
            )}
          </Button>
          <p className="text-sm text-muted-foreground">
            {isLoading ? (
              'Searching...'
            ) : (
              <>
                <span className="font-medium text-foreground">{totalProperties}</span>{' '}
                {totalProperties === 1 ? 'property' : 'properties'} found
              </>
            )}
          </p>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600"
              onClick={() => {
                useAppStore.getState().resetFilters();
                useAppStore.getState().setSearchQuery('');
                setCurrentPage(1);
              }}
            >
              Clear filters
            </Button>
          )}
        </div>

        <Select value={sortBy} onValueChange={(v) => { setSortBy(v); setCurrentPage(1); }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest First</SelectItem>
            <SelectItem value="price-asc">Price: Low to High</SelectItem>
            <SelectItem value="price-desc">Price: High to Low</SelectItem>
            <SelectItem value="popular">Most Popular</SelectItem>
            <SelectItem value="area-desc">Largest First</SelectItem>
            <SelectItem value="area-asc">Smallest First</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Property Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <PropertyCardSkeleton key={i} />
          ))}
        </div>
      ) : properties.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/30 py-16"
        >
          <Building2 className="h-16 w-16 text-muted-foreground/40" />
          <h3 className="mt-4 text-lg font-semibold">No properties found</h3>
          <p className="mt-2 text-sm text-muted-foreground text-center max-w-sm">
            Try adjusting your search or filter criteria to find more properties.
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => {
              useAppStore.getState().resetFilters();
              useAppStore.getState().setSearchQuery('');
              setCurrentPage(1);
            }}
          >
            Clear all filters
          </Button>
        </motion.div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={`${currentPage}-${sortBy}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
          >
            {properties.map((property, i) => (
              <PropertyCard key={property.id} property={property} index={i} />
            ))}
          </motion.div>
        </AnimatePresence>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage(currentPage - 1)}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Previous
          </Button>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const page = i + 1;
              return (
                <Button
                  key={page}
                  variant={currentPage === page ? 'default' : 'outline'}
                  size="sm"
                  className={currentPage === page ? 'bg-red-600 hover:bg-red-700' : ''}
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </Button>
              );
            })}
            {totalPages > 5 && <span className="px-2 text-muted-foreground">...</span>}
            {totalPages > 5 && (
              <Button
                variant={currentPage === totalPages ? 'default' : 'outline'}
                size="sm"
                className={currentPage === totalPages ? 'bg-red-600 hover:bg-red-700' : ''}
                onClick={() => setCurrentPage(totalPages)}
              >
                {totalPages}
              </Button>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage(currentPage + 1)}
          >
            Next
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
