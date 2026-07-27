'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { ArrowLeft, X, Check, MapPin, Bed, Bath, Maximize, Calendar, Sofa, Car, PawPrint, Building2, User, GitCompare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppStore, type Property } from '@/store/useAppStore';
import { formatUGX, propertyTypeLabels, listingTypeLabels, listingTypeColors } from './PropertyCard';
import { toast } from 'sonner';

export default function PropertyComparison() {
  const { comparisonList, removeFromComparison, setCurrentView } = useAppStore();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProperties = async () => {
      if (comparisonList.length === 0) {
        setProperties([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const results = await Promise.all(
          comparisonList.map(async (id) => {
            const res = await fetch(`/api/properties/${id}`);
            if (res.ok) {
              const data = await res.json();
              return data;
            }
            return null;
          })
        );
        setProperties(results.filter(Boolean) as Property[]);
      } catch {
        toast.error('Failed to load comparison data');
      } finally {
        setLoading(false);
      }
    };
    fetchProperties();
  }, [comparisonList]);

  const handleRemove = (id: string) => {
    removeFromComparison(id);
    if (comparisonList.length <= 2) {
      setCurrentView('home');
    }
  };

  const getPriceRange = (price: number) => {
    if (price <= 20000) return '0-20K';
    if (price <= 50000) return '20K-50K';
    if (price <= 100000) return '50K-100K';
    if (price <= 200000) return '100K-200K';
    return '200K+';
  };

  // Highlight best values
  const lowestPrice = properties.length > 0 ? Math.min(...properties.map((p) => p.price)) : 0;
  const mostBeds = properties.length > 0 ? Math.max(...properties.map((p) => p.bedrooms)) : 0;
  const mostBaths = properties.length > 0 ? Math.max(...properties.map((p) => p.bathrooms)) : 0;
  const largestArea = properties.length > 0 ? Math.max(...properties.map((p) => p.area)) : 0;

  const ComparisonRow = ({
    label,
    icon: Icon,
    values,
    highlightFn,
  }: {
    label: string;
    icon: React.ElementType;
    values: (string | number | boolean | null)[];
    highlightFn?: (val: string | number | boolean | null, idx: number) => boolean;
  }) => (
    <div className="grid border-b" style={{ gridTemplateColumns: `200px repeat(${properties.length}, 1fr)` }}>
      <div className="flex items-center gap-2 p-3 bg-muted/50 font-medium text-sm sticky left-0">
        <Icon className="h-4 w-4 text-red-600 shrink-0" />
        {label}
      </div>
      {values.map((val, idx) => {
        const isHighlighted = highlightFn ? highlightFn(val, idx) : false;
        return (
          <div
            key={idx}
            className={`flex items-center justify-center p-3 text-sm border-l ${
              isHighlighted ? 'bg-red-50 text-red-700 font-semibold dark:bg-red-950/30 dark:text-red-400' : ''
            }`}
          >
            {val === true ? (
              <Check className="h-5 w-5 text-red-600" />
            ) : val === false ? (
              <X className="h-5 w-5 text-red-400" />
            ) : val === null || val === undefined ? (
              <span className="text-muted-foreground">N/A</span>
            ) : (
              String(val)
            )}
          </div>
        );
      })}
    </div>
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (properties.length < 2) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/30 py-20 text-center"
        >
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/40">
            <GitCompare className="h-10 w-10 text-red-500" />
          </div>
          <h2 className="mt-5 text-xl font-semibold">Select Properties to Compare</h2>
          <p className="mt-2 text-muted-foreground text-center max-w-sm">
            Add up to 3 properties from the property cards to compare them side by side
          </p>
          <Button
            className="mt-6 bg-red-600 hover:bg-red-700 text-white"
            onClick={() => setCurrentView('home')}
          >
            Browse Properties
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setCurrentView('home')}
          className="shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Compare Properties</h1>
          <p className="text-sm text-muted-foreground">
            Comparing {properties.length} properties side by side
          </p>
        </div>
      </div>

      {/* Comparison Table */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {/* Images Row */}
            <div
              className="grid border-b"
              style={{ gridTemplateColumns: `200px repeat(${properties.length}, 1fr)` }}
            >
              <div className="flex items-center justify-center p-3 bg-muted/50 font-medium text-sm">
                Photo
              </div>
              {properties.map((property) => (
                <div key={property.id} className="relative border-l">
                  <div className="relative aspect-video overflow-hidden">
                    {property.images?.[0]?.url ? (
                      <Image
                        src={property.images[0].url}
                        alt={property.title}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-gradient-to-br from-red-100 to-red-50">
                        <Building2 className="h-12 w-12 text-red-300" />
                      </div>
                    )}
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="absolute top-2 right-2 h-7 w-7 p-0 rounded-full"
                    onClick={() => handleRemove(property.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Title Row */}
            <div
              className="grid border-b"
              style={{ gridTemplateColumns: `200px repeat(${properties.length}, 1fr)` }}
            >
              <div className="flex items-center p-3 bg-muted/50 font-medium text-sm">
                Title
              </div>
              {properties.map((property) => (
                <div key={property.id} className="flex items-center justify-center p-3 text-sm font-semibold border-l text-center">
                  {property.title}
                </div>
              ))}
            </div>

            {/* Comparison Rows */}
            <ComparisonRow
              label="Price"
              icon={MapPin}
              values={properties.map((p) => formatUGX(p.price, p.listingType))}
              highlightFn={(_, idx) => properties[idx]?.price === lowestPrice}
            />
            <ComparisonRow
              label="Location"
              icon={MapPin}
              values={properties.map((p) => `${p.city}, ${p.address}`)}
            />
            <ComparisonRow
              label="Bedrooms"
              icon={Bed}
              values={properties.map((p) => p.bedrooms)}
              highlightFn={(_, idx) => properties[idx]?.bedrooms === mostBeds}
            />
            <ComparisonRow
              label="Bathrooms"
              icon={Bath}
              values={properties.map((p) => p.bathrooms)}
              highlightFn={(_, idx) => properties[idx]?.bathrooms === mostBaths}
            />
            <ComparisonRow
              label="Area"
              icon={Maximize}
              values={properties.map((p) => `${p.area} sqm`)}
              highlightFn={(_, idx) => properties[idx]?.area === largestArea}
            />
            <ComparisonRow
              label="Property Type"
              icon={Building2}
              values={properties.map((p) => propertyTypeLabels[p.propertyType] || p.propertyType)}
            />
            <ComparisonRow
              label="Year Built"
              icon={Calendar}
              values={properties.map((p) => p.yearBuilt || null)}
            />
            <ComparisonRow
              label="Furnished"
              icon={Sofa}
              values={properties.map((p) => p.furnished)}
            />
            <ComparisonRow
              label="Parking"
              icon={Car}
              values={properties.map((p) => p.parking)}
            />
            <ComparisonRow
              label="Pets Allowed"
              icon={PawPrint}
              values={properties.map((p) => p.petsAllowed)}
            />
            <ComparisonRow
              label="Price Range"
              icon={MapPin}
              values={properties.map((p) => getPriceRange(p.price))}
            />
            <ComparisonRow
              label="Views"
              icon={MapPin}
              values={properties.map((p) => p.views)}
            />

            {/* Amenities Row */}
            <div
              className="grid border-b"
              style={{ gridTemplateColumns: `200px repeat(${properties.length}, 1fr)` }}
            >
              <div className="flex items-center gap-2 p-3 bg-muted/50 font-medium text-sm sticky left-0">
                <Check className="h-4 w-4 text-red-600 shrink-0" />
                Amenities
              </div>
              {properties.map((property) => (
                <div key={property.id} className="p-3 border-l">
                  <div className="flex flex-wrap gap-1">
                    {property.amenities && property.amenities.length > 0 ? (
                      property.amenities.map((a) => (
                        <Badge key={a.id} variant="outline" className="text-xs">
                          {a.amenity.name}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">None</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Landlord Row */}
            <div
              className="grid"
              style={{ gridTemplateColumns: `200px repeat(${properties.length}, 1fr)` }}
            >
              <div className="flex items-center gap-2 p-3 bg-muted/50 font-medium text-sm sticky left-0">
                <User className="h-4 w-4 text-red-600 shrink-0" />
                Landlord
              </div>
              {properties.map((property) => (
                <div key={property.id} className="p-3 border-l">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-red-100 text-red-700 text-xs">
                        {property.landlord?.name?.charAt(0) || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{property.landlord?.name}</p>
                      {property.landlord?.verified && (
                        <Badge className="bg-red-100 text-red-700 text-[10px] h-4 px-1">
                          Verified
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Price per sqm comparison */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <Card>
          <CardContent className="p-6">
            <h3 className="font-semibold mb-4">Price per Square Foot</h3>
            <div className="space-y-3">
              {properties.map((property) => {
                const pricePerSqft = Math.round(property.price / property.area);
                const lowestPricePerSqft = Math.min(
                  ...properties.map((p) => Math.round(p.price / p.area))
                );
                const isBest = pricePerSqft === lowestPricePerSqft;
                return (
                  <div key={property.id} className="flex items-center gap-3">
                    <div className="relative h-10 w-14 shrink-0 overflow-hidden rounded-md">
                      {property.images?.[0]?.url ? (
                        <Image
                          src={property.images[0].url}
                          alt={property.title}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-muted">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{property.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="h-2 rounded-full bg-muted overflow-hidden flex-1">
                          <div
                            className={`h-full rounded-full ${isBest ? 'bg-red-500' : 'bg-gray-400'}`}
                            style={{
                              width: `${(pricePerSqft / Math.max(...properties.map((p) => Math.round(p.price / p.area)))) * 100}%`,
                            }}
                          />
                        </div>
                        <span className={`text-sm font-semibold ${isBest ? 'text-red-600' : 'text-muted-foreground'}`}>
                          UGX {pricePerSqft.toLocaleString()}/sqm
                        </span>
                      </div>
                    </div>
                    {isBest && (
                      <Badge className="bg-red-100 text-red-700 shrink-0">Best Value</Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
