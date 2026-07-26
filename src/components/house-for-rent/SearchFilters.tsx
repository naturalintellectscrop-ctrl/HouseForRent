'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore, type PropertyFilters } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, SlidersHorizontal, RotateCcw, X, Banknote, Home, DollarSign, BarChart3 } from 'lucide-react';

const PROPERTY_TYPES = ['APARTMENT', 'HOUSE', 'VILLA', 'STUDIO', 'CONDO', 'BUNGALOW', 'TOWNHOUSE', 'BEDSITTER', 'LAND'];
const CITIES = ['Kampala', 'Entebbe', 'Jinja', 'Mbarara', 'Gulu', 'Mbale', 'Fort Portal', 'Arua'];

const LISTING_TYPES = [
  { value: '', label: 'All', icon: Home },
  { value: 'RENT', label: 'For Rent', icon: Home },
  { value: 'SALE', label: 'For Sale', icon: DollarSign },
  { value: 'BOTH', label: 'Rent & Sale', icon: BarChart3 },
];

const QUICK_FILTERS = [
  { value: 'RENT', label: '🏠 For Rent', color: 'from-red-500 to-red-600' },
  { value: 'SALE', label: '💰 For Sale', color: 'from-cyan-500 to-cyan-600' },
  { value: 'BOTH', label: '📊 Both', color: 'from-green-500 to-green-600' },
];

const PRICE_PRESETS = [
  { label: 'Under 500K', min: '0', max: '500000' },
  { label: '500K-1M', min: '500000', max: '1000000' },
  { label: '1M-2M', min: '1000000', max: '2000000' },
  { label: '2M-3M', min: '2000000', max: '3000000' },
  { label: '3M+', min: '3000000', max: '' },
];

const propertyTypeLabels: Record<string, string> = {
  APARTMENT: 'Apartment',
  HOUSE: 'House',
  VILLA: 'Villa',
  STUDIO: 'Studio',
  BUNGALOW: 'Bungalow',
  TOWNHOUSE: 'Townhouse',
  BEDSITTER: 'Bedsitter',
  LAND: 'Land',
};

const listingTypeColorMap: Record<string, string> = {
  '': 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700',
  RENT: 'bg-red-600 text-white border-red-600 shadow-red-500/25 shadow-md',
  SALE: 'bg-cyan-600 text-white border-cyan-600 shadow-cyan-500/25 shadow-md',
  BOTH: 'bg-green-600 text-white border-green-600 shadow-green-500/25 shadow-md',
};

const quickFilterColorMap: Record<string, { active: string; inactive: string }> = {
  RENT: {
    active: 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-md shadow-red-500/30 border-red-500',
    inactive: 'bg-white dark:bg-gray-800 text-red-600 border-red-200 dark:border-red-800 hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-900/30',
  },
  SALE: {
    active: 'bg-gradient-to-r from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/30 border-cyan-500',
    inactive: 'bg-white dark:bg-gray-800 text-cyan-600 border-cyan-200 dark:border-cyan-800 hover:border-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/30',
  },
  BOTH: {
    active: 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-md shadow-green-500/30 border-green-500',
    inactive: 'bg-white dark:bg-gray-800 text-green-600 border-green-200 dark:border-green-800 hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900/30',
  },
};

function getActiveFilters(filters: PropertyFilters, searchQuery: string): { key: string; label: string }[] {
  const active: { key: string; label: string }[] = [];
  if (searchQuery) active.push({ key: 'search', label: `Search: "${searchQuery}"` });
  if (filters.city) active.push({ key: 'city', label: filters.city });
  if (filters.propertyType) active.push({ key: 'propertyType', label: propertyTypeLabels[filters.propertyType] || filters.propertyType });
  if (filters.listingType) {
    const lt = LISTING_TYPES.find(t => t.value === filters.listingType);
    active.push({ key: 'listingType', label: lt?.label || filters.listingType });
  }
  if (filters.minPrice) active.push({ key: 'minPrice', label: `Min: UGX ${Number(filters.minPrice).toLocaleString()}` });
  if (filters.maxPrice) active.push({ key: 'maxPrice', label: `Max: UGX ${Number(filters.maxPrice).toLocaleString()}` });
  if (filters.bedrooms) active.push({ key: 'bedrooms', label: `${filters.bedrooms} Bed` });
  if (filters.minArea) active.push({ key: 'minArea', label: `Min: ${filters.minArea} sqm` });
  if (filters.maxArea) active.push({ key: 'maxArea', label: `Max: ${filters.maxArea} sqm` });
  if (filters.furnished) active.push({ key: 'furnished', label: 'Furnished' });
  if (filters.parking) active.push({ key: 'parking', label: 'Parking' });
  if (filters.petsAllowed) active.push({ key: 'petsAllowed', label: 'Pets OK' });
  return active;
}

interface FilterContentProps {
  filters: PropertyFilters;
  searchQuery: string;
  updateFilter: <K extends keyof PropertyFilters>(key: K, value: PropertyFilters[K]) => void;
  setSearchQuery: (query: string) => void;
  removeFilter: (key: string) => void;
  shaking: boolean;
}

function FilterContent({ filters, searchQuery, updateFilter, setSearchQuery, removeFilter, shaking }: FilterContentProps) {
  // Determine active price preset
  const activePreset = PRICE_PRESETS.findIndex((p) => {
    const minMatch = p.min === (filters.minPrice || '0') || (p.min === '0' && !filters.minPrice);
    const maxMatch = p.max === (filters.maxPrice || '') || (p.max === '' && !filters.maxPrice);
    return minMatch && maxMatch;
  });

  // Slider value from min/max price (default 0-5000000 for UGX)
  const sliderMin = filters.minPrice ? Number(filters.minPrice) : 0;
  const sliderMax = filters.maxPrice ? Number(filters.maxPrice) : 5000000;
  const sliderValue: [number, number] = [Math.min(sliderMin, 5000000), Math.min(sliderMax, 5000000)];

  const handlePresetClick = (preset: typeof PRICE_PRESETS[0]) => {
    updateFilter('minPrice', preset.min === '0' ? '' : preset.min);
    updateFilter('maxPrice', preset.max);
  };

  const handleSliderChange = (values: number[]) => {
    updateFilter('minPrice', values[0] === 0 ? '' : String(values[0]));
    updateFilter('maxPrice', values[1] >= 5000000 ? '' : String(values[1]));
  };

  return (
    <div className={`space-y-6 ${shaking ? 'animate-shake' : ''}`}>
      {/* Active Filters Badges */}
      <AnimatePresence>
        {getActiveFilters(filters, searchQuery).length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2 overflow-hidden"
          >
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Active Filters</Label>
            <div className="flex flex-wrap gap-1.5">
              {getActiveFilters(filters, searchQuery).map(({ key, label }) => (
                <Badge
                  key={key}
                  variant="secondary"
                  className="gap-1 pr-1 bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                >
                  {label}
                  <button
                    onClick={() => removeFilter(key)}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-red-200 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <Separator />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick Filter Buttons */}
      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Quick Filters</Label>
        <div className="flex flex-wrap gap-2">
          {QUICK_FILTERS.map((qf) => {
            const isActive = filters.listingType === qf.value;
            const colors = quickFilterColorMap[qf.value];
            return (
              <Button
                key={qf.value}
                variant="outline"
                size="sm"
                className={`text-sm h-9 px-4 font-medium transition-all duration-200 border rounded-full ${
                  isActive ? colors.active : colors.inactive
                }`}
                onClick={() => updateFilter('listingType', isActive ? '' : (qf.value as PropertyFilters['listingType']))}
              >
                {qf.label}
              </Button>
            );
          })}
        </div>
      </div>

      <Separator />

      {/* Listing Type Filter */}
      <div className="space-y-2">
        <Label>Listing Type</Label>
        <div className="flex flex-wrap gap-1.5">
          {LISTING_TYPES.map((lt) => (
            <button
              key={lt.value}
              onClick={() => updateFilter('listingType', lt.value as PropertyFilters['listingType'])}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all duration-200 ${
                filters.listingType === lt.value
                  ? listingTypeColorMap[lt.value]
                  : 'bg-white dark:bg-gray-800 text-muted-foreground border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
              }`}
            >
              {lt.label}
            </button>
          ))}
        </div>
      </div>

      <Separator />

      {/* Search */}
      <div className="space-y-2">
        <Label htmlFor="search-filter">Search</Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="search-filter"
            placeholder="Search by title, address..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <Separator />

      {/* City */}
      <div className="space-y-2">
        <Label>City / Location</Label>
        <Select value={filters.city} onValueChange={(v) => updateFilter('city', v === '_all' ? '' : v)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="All Cities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All Cities</SelectItem>
            {CITIES.map((city) => (
              <SelectItem key={city} value={city}>{city}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Property Type */}
      <div className="space-y-2">
        <Label>Property Type</Label>
        <Select value={filters.propertyType} onValueChange={(v) => updateFilter('propertyType', v === '_all' ? '' : v)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All Types</SelectItem>
            {PROPERTY_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {propertyTypeLabels[type] || type.charAt(0) + type.slice(1).toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Price Range with gradient track slider */}
      <div className="space-y-3">
        <Label className="flex items-center gap-1.5">
          <Banknote className="h-4 w-4 text-red-600" />
          Price Range (UGX)
        </Label>
        {/* Visual Range Slider with gradient track */}
        <div className="space-y-2">
          <div className="relative">
            {/* Gradient track background */}
            <div className="absolute top-1/2 left-0 right-0 h-2 -translate-y-1/2 rounded-full bg-gradient-to-r from-red-200 via-red-400 to-cyan-500 opacity-30 pointer-events-none" />
            <Slider
              min={0}
              max={5000000}
              step={5000}
              value={sliderValue}
              onValueChange={handleSliderChange}
              className="[&_[data-slot=slider-range]]:bg-gradient-to-r [&_[data-slot=slider-range]]:from-red-500 [&_[data-slot=slider-range]]:to-cyan-500 [&_[data-slot=slider-thumb]]:border-red-500 [&_[data-slot=slider-thumb]]:shadow-md [&_[data-slot=slider-thumb]]:shadow-red-500/20"
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{sliderValue[0] === 0 ? 'No min' : `UGX ${sliderValue[0].toLocaleString()}`}</span>
            <span>{sliderValue[1] >= 5000000 ? 'No max' : `UGX ${sliderValue[1].toLocaleString()}`}</span>
          </div>
        </div>
        {/* Min/Max Inputs */}
        <div className="flex items-center gap-2">
          <Input
            type="number"
            placeholder="Min"
            value={filters.minPrice}
            onChange={(e) => updateFilter('minPrice', e.target.value)}
          />
          <span className="text-muted-foreground">-</span>
          <Input
            type="number"
            placeholder="Max"
            value={filters.maxPrice}
            onChange={(e) => updateFilter('maxPrice', e.target.value)}
          />
        </div>
        {/* Preset Buttons */}
        <div className="flex flex-wrap gap-1.5">
          {PRICE_PRESETS.map((preset, index) => (
            <Button
              key={preset.label}
              variant="outline"
              size="sm"
              className={`text-xs h-7 transition-all duration-200 ${
                activePreset === index
                  ? 'bg-red-600 text-white border-red-600 hover:bg-red-700 hover:text-white'
                  : 'hover:border-red-300 hover:text-red-600'
              }`}
              onClick={() => handlePresetClick(preset)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Bedrooms */}
      <div className="space-y-2">
        <Label>Bedrooms</Label>
        <Select value={filters.bedrooms} onValueChange={(v) => updateFilter('bedrooms', v === '_all' ? '' : v)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Any" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Any</SelectItem>
            <SelectItem value="1">1 Bedroom</SelectItem>
            <SelectItem value="2">2 Bedrooms</SelectItem>
            <SelectItem value="3">3 Bedrooms</SelectItem>
            <SelectItem value="4">4 Bedrooms</SelectItem>
            <SelectItem value="5">5+ Bedrooms</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Area Range */}
      <div className="space-y-2">
        <Label>Area (sqm)</Label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            placeholder="Min"
            value={filters.minArea}
            onChange={(e) => updateFilter('minArea', e.target.value)}
          />
          <span className="text-muted-foreground">-</span>
          <Input
            type="number"
            placeholder="Max"
            value={filters.maxArea}
            onChange={(e) => updateFilter('maxArea', e.target.value)}
          />
        </div>
      </div>

      <Separator />

      {/* Toggles with smooth color transitions */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="furnished-filter" className="cursor-pointer">Furnished</Label>
          <Switch
            id="furnished-filter"
            checked={filters.furnished === true}
            onCheckedChange={(checked) => updateFilter('furnished', checked ? true : null)}
            className="data-[state=checked]:bg-red-600 transition-colors duration-300"
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="parking-filter" className="cursor-pointer">Parking Available</Label>
          <Switch
            id="parking-filter"
            checked={filters.parking === true}
            onCheckedChange={(checked) => updateFilter('parking', checked ? true : null)}
            className="data-[state=checked]:bg-red-600 transition-colors duration-300"
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="pets-filter" className="cursor-pointer">Pets Allowed</Label>
          <Switch
            id="pets-filter"
            checked={filters.petsAllowed === true}
            onCheckedChange={(checked) => updateFilter('petsAllowed', checked ? true : null)}
            className="data-[state=checked]:bg-red-600 transition-colors duration-300"
          />
        </div>
      </div>
    </div>
  );
}

export default function SearchFilters() {
  const {
    filters,
    setFilters,
    resetFilters,
    showFiltersPanel,
    setShowFiltersPanel,
    searchQuery,
    setSearchQuery,
    setCurrentPage,
  } = useAppStore();

  const [shaking, setShaking] = useState(false);

  const updateFilter = <K extends keyof PropertyFilters>(key: K, value: PropertyFilters[K]) => {
    setFilters({ ...filters, [key]: value });
  };

  const removeFilter = (key: string) => {
    const updated = { ...filters };
    if (key === 'search') {
      setSearchQuery('');
    } else if (key in updated) {
      (updated as Record<string, unknown>)[key] = key === 'furnished' || key === 'parking' || key === 'petsAllowed' ? null : '';
    }
    setFilters(updated);
  };

  const hasActiveFilters = getActiveFilters(filters, searchQuery).length > 0;

  const handleApply = () => {
    if (!hasActiveFilters) {
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
    }
    setCurrentPage(1);
    setShowFiltersPanel(false);
  };

  const handleReset = () => {
    resetFilters();
    setSearchQuery('');
    setCurrentPage(1);
  };

  return (
    <>
      {/* Desktop Sidebar with smooth expand/collapse */}
      <aside className="hidden lg:block w-72 shrink-0">
        <div className="sticky top-20 rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="flex items-center gap-2 font-semibold">
              <SlidersHorizontal className="h-4 w-4 text-red-600" />
              Filters
            </h3>
            <Button variant="ghost" size="sm" onClick={handleReset} className="text-muted-foreground">
              <RotateCcw className="mr-1 h-3 w-3" />
              Reset
            </Button>
          </div>
          <FilterContent
            filters={filters}
            searchQuery={searchQuery}
            updateFilter={updateFilter}
            setSearchQuery={setSearchQuery}
            removeFilter={removeFilter}
            shaking={shaking}
          />
          <Button
            className={`mt-6 w-full bg-red-600 hover:bg-red-700 text-white transition-all duration-200 ${
              shaking ? 'animate-shake' : ''
            }`}
            onClick={handleApply}
          >
            Apply Filters
          </Button>
        </div>
      </aside>

      {/* Mobile Sheet with smooth expand/collapse */}
      <Sheet open={showFiltersPanel} onOpenChange={setShowFiltersPanel}>
        <SheetContent side="left" className="w-80 sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5 text-red-600" />
              Filters
            </SheetTitle>
            <SheetDescription>Refine your property search</SheetDescription>
          </SheetHeader>
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="py-4">
              <FilterContent
                filters={filters}
                searchQuery={searchQuery}
                updateFilter={updateFilter}
                setSearchQuery={setSearchQuery}
                removeFilter={removeFilter}
                shaking={shaking}
              />
            </div>
          </ScrollArea>
          <SheetFooter className="flex-row gap-2 pt-4 border-t">
            <Button variant="outline" className="flex-1" onClick={handleReset}>
              <RotateCcw className="mr-1 h-3 w-3" />
              Reset
            </Button>
            <Button
              className={`flex-1 bg-red-600 hover:bg-red-700 text-white transition-all duration-200 ${
                shaking ? 'animate-shake' : ''
              }`}
              onClick={handleApply}
            >
              Apply
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
