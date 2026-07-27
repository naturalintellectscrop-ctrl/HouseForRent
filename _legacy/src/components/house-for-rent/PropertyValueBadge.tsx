'use client';

import { useEffect, useState, useMemo } from 'react';
import { TrendingDown, Minus, TrendingUp, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';

interface PropertyValueBadgeProps {
  price: number;
  area: number;
  city: string;
  propertyType?: string;
  className?: string;
}

type Valuation = 'great-value' | 'fair-price' | 'premium';

const VALUATION_CONFIG: Record<Valuation, {
  label: string;
  icon: typeof TrendingDown;
  className: string;
  tooltipText: string;
}> = {
  'great-value': {
    label: 'Great Value',
    icon: TrendingDown,
    className: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/50 dark:text-red-300 dark:border-red-700',
    tooltipText: 'This property is priced below the city average per sqm — a great deal!',
  },
  'fair-price': {
    label: 'Fair Price',
    icon: Minus,
    className: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-700',
    tooltipText: 'This property is priced close to the city average per sqm.',
  },
  'premium': {
    label: 'Premium',
    icon: TrendingUp,
    className: 'bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/50 dark:text-purple-300 dark:border-purple-700',
    tooltipText: 'This property is priced above the city average per sqm — premium location or features.',
  },
};

// City-based average price per sqm in UGX (approximate Ugandan market rates)
const CITY_AVERAGES: Record<string, number> = {
  kampala: 3500,
  entebbe: 2800,
  jinja: 2200,
  mbarara: 1800,
  gulu: 1500,
  mbale: 1600,
  'fort portal': 1700,
  arua: 1400,
};

// Property type multipliers
const TYPE_MULTIPLIERS: Record<string, number> = {
  VILLA: 1.5,
  CONDO: 1.2,
  APARTMENT: 1.0,
  HOUSE: 1.1,
  TOWNHOUSE: 1.15,
  STUDIO: 0.85,
  BUNGALOW: 1.05,
  BEDSITTER: 0.75,
};

function determineValuation(pricePerSqm: number, avgPerSqm: number): Valuation {
  const ratio = pricePerSqm / avgPerSqm;
  if (ratio <= 0.85) return 'great-value';
  if (ratio <= 1.2) return 'fair-price';
  return 'premium';
}

export default function PropertyValueBadge({
  price,
  area,
  city,
  propertyType = 'APARTMENT',
  className = '',
}: PropertyValueBadgeProps) {
  const [cityAvgPrice, setCityAvgPrice] = useState<number | null>(null);

  useEffect(() => {
    // Fetch properties in same city to calculate average price per sqm
    const params = new URLSearchParams();
    if (city) params.set('city', city);
    params.set('limit', '50');

    fetch(`/api/properties?${params.toString()}`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.properties && data.properties.length > 0) {
          const totalPerSqm = data.properties.reduce(
            (sum: number, p: { price: number; area: number }) => sum + (p.area > 0 ? p.price / p.area : 0),
            0
          );
          setCityAvgPrice(totalPerSqm / data.properties.length);
        } else {
          // Fallback to predefined city averages
          const cityKey = city?.toLowerCase() || '';
          const avg = CITY_AVERAGES[cityKey] || 1000;
          const typeMultiplier = TYPE_MULTIPLIERS[propertyType] || 1.0;
          setCityAvgPrice(avg * typeMultiplier);
        }
      })
      .catch(() => {
        const cityKey = city?.toLowerCase() || '';
        const avg = CITY_AVERAGES[cityKey] || 1000;
        const typeMultiplier = TYPE_MULTIPLIERS[propertyType] || 1.0;
        setCityAvgPrice(avg * typeMultiplier);
      });
  }, [city, propertyType]);

  const valuation = useMemo<Valuation | null>(() => {
    if (!cityAvgPrice || area <= 0) return null;
    const pricePerSqm = price / area;
    return determineValuation(pricePerSqm, cityAvgPrice);
  }, [price, area, cityAvgPrice]);

  if (!valuation) return null;

  const config = VALUATION_CONFIG[valuation];
  const Icon = config.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={`gap-1 text-xs font-semibold cursor-help ${config.className} ${className}`}
        >
          <Icon className="h-3 w-3" />
          {config.label}
          <Info className="h-2.5 w-2.5 opacity-60" />
        </Badge>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="max-w-[220px] text-center bg-popover text-popover-foreground border shadow-lg"
      >
        <p className="text-xs">{config.tooltipText}</p>
        {cityAvgPrice && (
          <p className="text-xs text-muted-foreground mt-1">
            City avg: UGX {Math.round(cityAvgPrice).toLocaleString('en-UG')}/sqm
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
