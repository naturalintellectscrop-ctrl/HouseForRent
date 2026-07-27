'use client';

import { Flame } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface PriceDropBadgeProps {
  price: number;
  area: number;
  featured?: boolean;
}

// Calculate if this is a "Hot Deal" based on price per sqm being in the bottom 25%
// Average Ugandan rental price per sqm ranges from ~500 UGX (cheap) to ~2000+ UGX (premium)
// We consider anything under 700 UGX/sqm as a hot deal
const HOT_DEAL_THRESHOLD = 700;

export default function PriceDropBadge({ price, area, featured }: PriceDropBadgeProps) {
  const pricePerSqm = area > 0 ? price / area : 0;
  const isHotDeal = pricePerSqm > 0 && pricePerSqm <= HOT_DEAL_THRESHOLD;

  // Also show for featured properties that are good value
  const showBadge = isHotDeal || (featured && pricePerSqm <= HOT_DEAL_THRESHOLD * 1.2);

  if (!showBadge) return null;

  return (
    <Badge className="bg-gradient-to-r from-red-500 to-cyan-500 text-white hover:from-red-600 hover:to-cyan-600 text-[10px] font-bold px-2 py-0.5 shadow-md border-0 gap-1">
      <Flame className="h-3 w-3" />
      Hot Deal
    </Badge>
  );
}
