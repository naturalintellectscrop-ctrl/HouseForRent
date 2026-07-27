'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Home, TrendingUp, X } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';

interface CityProperty {
  id: string;
  title: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  area: number;
  propertyType: string;
  listingType: string;
  images: { url: string; caption: string | null; isPrimary: boolean }[];
  landlord: { id: string; name: string; avatar: string | null; verified: boolean };
  views: number;
  featured: boolean;
}

interface CityData {
  city: string;
  propertyCount: number;
  averagePrice: number;
  coordinates: { x: number; y: number };
  topProperties: CityProperty[];
}

interface TooltipData {
  city: string;
  propertyCount: number;
  averagePrice: number;
  x: number;
  y: number;
  topProperties: CityProperty[];
}

function formatPrice(price: number): string {
  if (price >= 100000) return `UGX ${(price / 100000).toFixed(1)}L`;
  if (price >= 1000) return `UGX ${(price / 1000).toFixed(0)}K`;
  return `UGX ${price}`;
}

function formatFullPrice(price: number): string {
  return new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', maximumFractionDigits: 0 }).format(price);
}

// Simplified Uganda outline SVG path - more accurate shape
const UGANDA_PATH = `M 32 15 L 38 12 L 44 13 L 50 15 L 55 14 L 60 16 L 65 14 L 70 16 L 74 20 L 76 25 L 74 30 L 72 34 L 70 38 L 72 42 L 74 46 L 72 50 L 68 54 L 65 58 L 62 62 L 58 65 L 54 67 L 50 68 L 46 67 L 42 65 L 38 63 L 35 60 L 32 57 L 30 53 L 28 49 L 26 45 L 24 41 L 22 37 L 20 33 L 20 28 L 22 24 L 25 20 L 28 17 Z`;

export default function PropertyMap() {
  const { setSearchQuery, setCurrentView, setFilters } = useAppStore();
  const [citiesData, setCitiesData] = useState<CityData[]>([]);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);

  const fetchCities = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/properties/by-city');
      if (res.ok) {
        const data = await res.json();
        setCitiesData(data.cities);
      }
    } catch {
      // silently fail
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCities();
  }, [fetchCities]);

  const handleCityClick = (city: string) => {
    setSelectedCity(city);
    setSearchQuery(city);
    setFilters({ ...useAppStore.getState().filters, city });
    setCurrentView('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getMarkerSize = (count: number) => {
    if (count >= 8) return 10;
    if (count >= 5) return 8;
    if (count >= 3) return 7;
    return 6;
  };

  const totalProperties = citiesData.reduce((sum, c) => sum + c.propertyCount, 0);

  return (
    <div className="w-full">
      {/* Map Card */}
      <div className="relative overflow-hidden rounded-2xl border border-red-200 dark:border-red-900 bg-gradient-to-br from-red-50 via-cyan-50 to-cyan-50 dark:from-red-950/50 dark:via-cyan-950/40 dark:to-cyan-950/30 shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-red-200/50 dark:border-red-800/50">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-600 text-white">
              <MapPin className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-red-900 dark:text-red-100">
                Properties Across Uganda
              </h3>
              <p className="text-xs text-red-700/70 dark:text-red-300/60">
                {totalProperties} properties in {citiesData.length} cities
              </p>
            </div>
          </div>
          {selectedCity && (
            <button
              onClick={() => {
                setSelectedCity(null);
                setSearchQuery('');
                setFilters({ ...useAppStore.getState().filters, city: '' });
              }}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/50 dark:text-red-300 dark:hover:bg-red-800/50 transition-colors"
            >
              <X className="h-3 w-3" />
              Clear filter
            </button>
          )}
        </div>

        {/* SVG Map */}
        <div className="relative w-full h-[250px] sm:h-[320px] md:h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-3 border-red-200 border-t-red-600 rounded-full animate-spin" />
                <p className="text-sm text-red-600 dark:text-red-400">Loading map...</p>
              </div>
            </div>
          ) : (
            <svg
              viewBox="0 0 100 100"
              className="w-full h-full"
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                {/* Uganda fill gradient */}
                <linearGradient id="uganda-fill" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#fee2e2" />
                  <stop offset="50%" stopColor="#fecaca" />
                  <stop offset="100%" stopColor="#fca5a5" />
                </linearGradient>
                <linearGradient id="uganda-fill-dark" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#450a0a" />
                  <stop offset="50%" stopColor="#991b1b" />
                  <stop offset="100%" stopColor="#b91c1c" />
                </linearGradient>
                {/* Border gradient */}
                <linearGradient id="uganda-stroke" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#dc2626" />
                  <stop offset="100%" stopColor="#0891b2" />
                </linearGradient>
                {/* Pulse glow */}
                <radialGradient id="pulse-glow">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
                </radialGradient>
                {/* Shadow filter */}
                <filter id="map-shadow" x="-5%" y="-5%" width="110%" height="110%">
                  <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#000" floodOpacity="0.1" />
                </filter>
                {/* Lake gradient */}
                <radialGradient id="lake-gradient" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.15" />
                </radialGradient>
              </defs>

              {/* Background pattern */}
              <pattern id="grid-pattern" width="5" height="5" patternUnits="userSpaceOnUse">
                <path d="M 5 0 L 0 0 0 5" fill="none" stroke="#fee2e2" strokeWidth="0.15" opacity="0.5" />
              </pattern>
              <rect width="100" height="100" fill="url(#grid-pattern)" />

              {/* Uganda shape */}
              <path
                d={UGANDA_PATH}
                className="fill-red-100 dark:fill-red-900/60"
                stroke="url(#uganda-stroke)"
                strokeWidth="0.8"
                filter="url(#map-shadow)"
              />
              <path
                d={UGANDA_PATH}
                className="fill-red-200/30 dark:fill-red-800/20"
                stroke="none"
              />

              {/* Lake Victoria (south-east side of Uganda) */}
              <ellipse cx="72" cy="68" rx="18" ry="12" fill="url(#lake-gradient)" transform="rotate(-20 72 68)" />
              <ellipse cx="72" cy="68" rx="12" ry="7" fill="#22d3ee" opacity="0.15" transform="rotate(-20 72 68)" />
              {/* Lake Victoria label */}
              <text
                x="72"
                y="72"
                textAnchor="middle"
                className="fill-cyan-500/50 dark:fill-cyan-400/40"
                fontSize="2.8"
                fontStyle="italic"
                style={{ pointerEvents: 'none' }}
              >
                Lake Victoria
              </text>

              {/* Lake Albert (west side) */}
              <ellipse cx="18" cy="50" rx="4" ry="8" fill="url(#lake-gradient)" transform="rotate(-10 18 50)" opacity="0.6" />

              {/* Lake Edward (south-west) */}
              <ellipse cx="22" cy="62" rx="3" ry="4" fill="url(#lake-gradient)" opacity="0.5" />

              {/* City markers */}
              {citiesData.map((city) => {
                const { x, y } = city.coordinates;
                const markerSize = getMarkerSize(city.propertyCount);
                const isSelected = selectedCity === city.city;

                return (
                  <g
                    key={city.city}
                    onClick={() => handleCityClick(city.city)}
                    onMouseEnter={() =>
                      setTooltip({
                        city: city.city,
                        propertyCount: city.propertyCount,
                        averagePrice: city.averagePrice,
                        x,
                        y,
                        topProperties: city.topProperties,
                      })
                    }
                    onMouseLeave={() => setTooltip(null)}
                    className="cursor-pointer"
                  >
                    {/* Pulse ring animation */}
                    <motion.circle
                      cx={x}
                      cy={y}
                      r={markerSize + 4}
                      fill="url(#pulse-glow)"
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{
                        scale: [0.8, 1.4, 0.8],
                        opacity: [0, 0.6, 0],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                    />

                    {/* Second pulse ring (offset) */}
                    <motion.circle
                      cx={x}
                      cy={y}
                      r={markerSize + 3}
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth="0.3"
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{
                        scale: [0.5, 1.8],
                        opacity: [0.5, 0],
                      }}
                      transition={{
                        duration: 2.5,
                        repeat: Infinity,
                        ease: 'easeOut',
                        delay: 0.5,
                      }}
                    />

                    {/* Main marker dot */}
                    <motion.circle
                      cx={x}
                      cy={y}
                      r={markerSize}
                      fill={isSelected ? '#f59e0b' : '#ef4444'}
                      stroke="#fff"
                      strokeWidth="1"
                      whileHover={{ scale: 1.3 }}
                      whileTap={{ scale: 0.95 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                    />

                    {/* Inner dot */}
                    <circle
                      cx={x}
                      cy={y}
                      r={markerSize * 0.4}
                      fill="#fff"
                      opacity="0.9"
                    />

                    {/* City name label */}
                    <text
                      x={x}
                      y={y - markerSize - 2}
                      textAnchor="middle"
                      className="fill-red-900 dark:fill-red-100"
                      fontSize="3.5"
                      fontWeight="600"
                      style={{ pointerEvents: 'none' }}
                    >
                      {city.city}
                    </text>

                    {/* Property count badge */}
                    <g>
                      <rect
                        x={x + markerSize + 1}
                        y={y - 3}
                        width={city.propertyCount >= 10 ? 8 : 6}
                        height="6"
                        rx="3"
                        fill="#dc2626"
                        stroke="#fff"
                        strokeWidth="0.4"
                      />
                      <text
                        x={x + markerSize + (city.propertyCount >= 10 ? 5 : 4)}
                        y={y + 0.5}
                        textAnchor="middle"
                        fill="#fff"
                        fontSize="3"
                        fontWeight="700"
                        style={{ pointerEvents: 'none' }}
                      >
                        {city.propertyCount}
                      </text>
                    </g>
                  </g>
                );
              })}

              {/* Empty state if no data */}
              {citiesData.length === 0 && !isLoading && (
                <text
                  x="50"
                  y="50"
                  textAnchor="middle"
                  className="fill-red-600 dark:text-red-400"
                  fontSize="4"
                >
                  No properties found
                </text>
              )}
            </svg>
          )}

          {/* Tooltip */}
          <AnimatePresence>
            {tooltip && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 5 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 5 }}
                transition={{ duration: 0.15 }}
                className="absolute z-20 w-72 bg-white dark:bg-gray-900 rounded-xl border border-red-200 dark:border-red-800 shadow-xl overflow-hidden"
                style={{
                  left: `${Math.min(tooltip.x, 65)}%`,
                  top: `${Math.min(tooltip.y + 10, 55)}%`,
                }}
              >
                {/* Tooltip Header */}
                <div className="bg-gradient-to-r from-red-600 to-cyan-600 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-white" />
                    <h4 className="text-sm font-semibold text-white">{tooltip.city}</h4>
                  </div>
                </div>

                {/* Tooltip Body */}
                <div className="px-3 py-2 space-y-2">
                  {/* Stats row */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <Home className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        {tooltip.propertyCount} {tooltip.propertyCount === 1 ? 'property' : 'properties'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        Avg: {formatFullPrice(tooltip.averagePrice)}
                      </span>
                    </div>
                  </div>

                  {/* Top properties preview */}
                  {tooltip.topProperties.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold">
                        Top Properties
                      </p>
                      {tooltip.topProperties.slice(0, 3).map((prop) => (
                        <div
                          key={prop.id}
                          className="flex items-center gap-2 p-1.5 rounded-lg bg-red-50/50 dark:bg-red-900/20"
                        >
                          <div className="w-8 h-8 rounded-md overflow-hidden bg-red-100 dark:bg-red-900/40 shrink-0">
                            {prop.images?.[0]?.url ? (
                              <img
                                src={prop.images[0].url}
                                alt={prop.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Home className="h-3 w-3 text-red-400" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-medium text-gray-800 dark:text-gray-200 truncate">
                              {prop.title}
                            </p>
                            <p className="text-[10px] text-red-600 dark:text-red-400 font-semibold">
                              {formatPrice(prop.price)}
                              {(prop.listingType === 'RENT' || prop.listingType === 'BOTH') ? '/mo' : ''}
                            </p>
                          </div>
                          <span className="text-[9px] text-gray-400 dark:text-gray-500 shrink-0">
                            {prop.bedrooms}bd
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <p className="text-[10px] text-center text-red-600 dark:text-red-400 font-medium pt-1 border-t border-red-100 dark:border-red-800/50">
                    Click to view properties in {tooltip.city}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Legend */}
        <div className="px-4 py-2.5 border-t border-red-200/50 dark:border-red-800/50 bg-white/50 dark:bg-gray-900/50">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold">
                Legend
              </p>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500 border border-white shadow-sm" />
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">&lt;3</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500 border border-white shadow-sm" />
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">3-5</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3.5 h-3.5 rounded-full bg-red-500 border border-white shadow-sm" />
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">5-8</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded-full bg-red-500 border border-white shadow-sm" />
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">8+</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-cyan-400/40 border border-cyan-300" />
                <span className="text-[11px] text-gray-500 dark:text-gray-400">Lake</span>
              </div>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">
                Marker size = property count
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
