'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAppStore, type Property } from '@/store/useAppStore';
import PropertyCard from './PropertyCard';

function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="aspect-[4/3] animate-pulse bg-muted" />
      <div className="p-4 space-y-3">
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
        <div className="flex gap-4">
          <div className="h-3 w-16 animate-pulse rounded bg-muted" />
          <div className="h-3 w-16 animate-pulse rounded bg-muted" />
          <div className="h-3 w-16 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}

export default function AIRecommendations() {
  const { user, currentView } = useAppStore();
  const [recommendations, setRecommendations] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [source, setSource] = useState<string>('');

  const fetchRecommendations = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/recommendations');
      if (res.ok) {
        const data = await res.json();
        setRecommendations(data.recommendations || []);
        setSource(data.source || '');
      }
    } catch {
      // Silently fail - component will show nothing
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/recommendations');
      if (res.ok) {
        const data = await res.json();
        setRecommendations(data.recommendations || []);
        setSource(data.source || '');
      }
    } catch {
      // Silently fail
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchRecommendations();
    } else {
      setLoading(false);
      setRecommendations([]);
    }
  }, [user, fetchRecommendations]);

  // Only show when user is logged in and on home view
  if (!user || currentView !== 'home') return null;

  // Show nothing on error (empty recommendations with no loading)
  if (!loading && recommendations.length === 0) return null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-cyan-600 shadow-lg shadow-red-500/25">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold">Recommended For You</h2>
                <Badge className="bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-900/40 text-xs font-medium gap-1 px-2 py-0.5">
                  <Sparkles className="h-3 w-3" />
                  AI-Powered
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {source === 'ai'
                  ? 'Personalized picks based on your preferences'
                  : source === 'popular'
                  ? 'Popular properties to get you started'
                  : 'Properties you might like'}
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="gap-2 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950 dark:hover:text-red-300"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Loading Skeleton */}
        {loading && (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {/* Recommendations Grid */}
        {!loading && recommendations.length > 0 && (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {recommendations.slice(0, 4).map((property, index) => (
              <motion.div
                key={property.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
              >
                <PropertyCard property={property} />
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
