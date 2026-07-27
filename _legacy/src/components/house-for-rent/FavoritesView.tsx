'use client';

import { useEffect, useState } from 'react';
import { Heart, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import PropertyCard from './PropertyCard';
import EmptyState from './EmptyState';
import { useAppStore, type Property } from '@/store/useAppStore';
import { toast } from 'sonner';

export default function FavoritesView() {
  const { user, setCurrentView, setShowAuthModal, setAuthMode } = useAppStore();
  const [favorites, setFavorites] = useState<(Property & { favoriteId?: string })[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFavorites = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch('/api/favorites');
      if (res.ok) {
        const data = await res.json();
        const mapped = data.map((fav: any) => ({
          ...fav.property,
          favoriteId: fav.id,
          isFavorited: true,
        }));
        setFavorites(mapped);
      }
    } catch {
      toast.error('Failed to load favorites');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFavorites();
  }, [user]);

  const handleRemove = async (propertyId: string) => {
    try {
      const res = await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId }),
      });
      if (res.ok) {
        setFavorites((prev) => prev.filter((p) => p.id !== propertyId));
        toast.success('Removed from favorites');
      }
    } catch {
      toast.error('Failed to remove favorite');
    }
  };

  if (!user) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <EmptyState
          icon={Heart}
          title="Login to View Favorites"
          description="Save properties you love for easy access later. Sign in to start building your wishlist."
          actionLabel="Login"
          onAction={() => { setAuthMode('login'); setShowAuthModal(true); }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold sm:text-3xl">My Favorites</h1>
        <p className="mt-2 text-muted-foreground">
          Properties you&apos;ve saved for later
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border bg-card shadow-sm">
              <Skeleton className="aspect-[4/3] w-full" />
              <div className="space-y-3 p-4">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : favorites.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="No Saved Properties"
          description="Properties you love will appear here. Start exploring and save your favorites!"
          actionLabel="Browse Properties"
          onAction={() => setCurrentView('home')}
        />
      ) : (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
          >
            {favorites.map((property) => (
              <div key={property.id} className="relative group">
                <PropertyCard property={property} />
                <Button
                  variant="destructive"
                  size="sm"
                  className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(property.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Remove
                </Button>
              </div>
            ))}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
