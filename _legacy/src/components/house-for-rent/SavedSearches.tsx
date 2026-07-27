'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bookmark, Trash2, Search, MapPin, Home, Banknote, Bed, Sofa, Car, PawPrint, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { useAppStore, type PropertyFilters } from '@/store/useAppStore';
import { toast } from 'sonner';

interface SavedSearch {
  id: string;
  userId: string;
  name: string;
  searchQuery: string | null;
  city: string | null;
  propertyType: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  bedrooms: number | null;
  furnished: boolean;
  parking: boolean;
  petsAllowed: boolean;
  active: boolean;
  matchCount: number;
  createdAt: string;
}

const propertyTypeLabels: Record<string, string> = {
  APARTMENT: 'Apartment',
  HOUSE: 'House',
  VILLA: 'Villa',
  STUDIO: 'Studio',
  BUNGALOW: 'Bungalow',
  TOWNHOUSE: 'Townhouse',
  BEDSITTER: 'Bedsitter',
  CONDO: 'Condo',
};

export default function SavedSearches() {
  const { user, filters, searchQuery, setFilters, setSearchQuery, setCurrentPage } = useAppStore();
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  const fetchSavedSearches = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await fetch('/api/saved-searches');
      if (res.ok) {
        const data = await res.json();
        setSavedSearches(data);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchSavedSearches();
  }, [fetchSavedSearches]);

  const handleSaveSearch = async () => {
    if (!saveName.trim()) {
      toast.error('Please enter a name for your search');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/saved-searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: saveName.trim(),
          searchQuery,
          city: filters.city || null,
          propertyType: filters.propertyType || null,
          minPrice: filters.minPrice || null,
          maxPrice: filters.maxPrice || null,
          bedrooms: filters.bedrooms || null,
          furnished: filters.furnished || false,
          parking: filters.parking || false,
          petsAllowed: filters.petsAllowed || false,
        }),
      });
      if (res.ok) {
        toast.success('Search saved successfully!');
        setShowSaveDialog(false);
        setSaveName('');
        fetchSavedSearches();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to save search');
      }
    } catch {
      toast.error('Failed to save search');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSearch = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/saved-searches?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Saved search deleted');
        setSavedSearches((prev) => prev.filter((s) => s.id !== id));
      } else {
        toast.error('Failed to delete saved search');
      }
    } catch {
      toast.error('Failed to delete saved search');
    } finally {
      setDeletingId(null);
    }
  };

  const handleApplySearch = (search: SavedSearch) => {
    const newFilters: PropertyFilters = {
      city: search.city || '',
      propertyType: search.propertyType || '',
      minPrice: search.minPrice !== null ? String(search.minPrice) : '',
      maxPrice: search.maxPrice !== null ? String(search.maxPrice) : '',
      bedrooms: search.bedrooms !== null ? String(search.bedrooms) : '',
      minArea: '',
      maxArea: '',
      furnished: search.furnished || null,
      parking: search.parking || null,
      petsAllowed: search.petsAllowed || null,
    };
    setFilters(newFilters);
    if (search.searchQuery) {
      setSearchQuery(search.searchQuery);
    }
    setCurrentPage(1);
    toast.success(`Applied "${search.name}" filters`);
  };

  const getSearchCriteriaBadges = (search: SavedSearch) => {
    const badges: { icon: React.ReactNode; label: string }[] = [];
    if (search.searchQuery) badges.push({ icon: <Search className="h-3 w-3" />, label: search.searchQuery });
    if (search.city) badges.push({ icon: <MapPin className="h-3 w-3" />, label: search.city });
    if (search.propertyType) badges.push({ icon: <Home className="h-3 w-3" />, label: propertyTypeLabels[search.propertyType] || search.propertyType });
    if (search.minPrice !== null) badges.push({ icon: <Banknote className="h-3 w-3" />, label: `Min UGX ${search.minPrice.toLocaleString()}` });
    if (search.maxPrice !== null) badges.push({ icon: <Banknote className="h-3 w-3" />, label: `Max UGX ${search.maxPrice.toLocaleString()}` });
    if (search.bedrooms !== null) badges.push({ icon: <Bed className="h-3 w-3" />, label: `${search.bedrooms}+ Bed` });
    if (search.furnished) badges.push({ icon: <Sofa className="h-3 w-3" />, label: 'Furnished' });
    if (search.parking) badges.push({ icon: <Car className="h-3 w-3" />, label: 'Parking' });
    if (search.petsAllowed) badges.push({ icon: <PawPrint className="h-3 w-3" />, label: 'Pets' });
    return badges;
  };

  if (!user) return null;

  return (
    <>
      <div className="mt-6 pt-4 border-t">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-between w-full mb-3"
        >
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <Bookmark className="h-4 w-4 text-red-600" />
            Saved Searches
          </h4>
          <motion.span
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-muted-foreground"
          >
            ▾
          </motion.span>
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              {/* Save Current Search Button */}
              <Button
                variant="outline"
                size="sm"
                className="w-full mb-3 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                onClick={() => setShowSaveDialog(true)}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Save Current Search
              </Button>

              {/* Saved Searches List */}
              {loading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-red-600" />
                </div>
              ) : savedSearches.length === 0 ? (
                <div className="text-center py-6">
                  <Bookmark className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">No saved searches yet</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Save your filters to quickly apply them later</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                  {savedSearches.map((search, index) => (
                    <motion.div
                      key={search.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="group rounded-lg border bg-card p-3 hover:border-red-200 dark:hover:border-red-800 transition-colors cursor-pointer"
                      onClick={() => handleApplySearch(search)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{search.name}</span>
                            {search.matchCount > 0 && (
                              <Badge className="shrink-0 bg-red-100 text-red-700 hover:bg-red-100 text-[10px] px-1.5 py-0 dark:bg-red-900 dark:text-red-300">
                                {search.matchCount} match{search.matchCount !== 1 ? 'es' : ''}
                              </Badge>
                            )}
                          </div>
                          {/* Criteria badges */}
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {getSearchCriteriaBadges(search).slice(0, 4).map((badge, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground bg-muted/50 rounded px-1 py-0.5"
                              >
                                {badge.icon}
                                {badge.label}
                              </span>
                            ))}
                            {getSearchCriteriaBadges(search).length > 4 && (
                              <span className="text-[10px] text-muted-foreground">
                                +{getSearchCriteriaBadges(search).length - 4} more
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground/60 mt-1">
                            Saved {new Date(search.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-500"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSearch(search.id);
                          }}
                          disabled={deletingId === search.id}
                        >
                          {deletingId === search.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Save Search Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bookmark className="h-5 w-5 text-red-600" />
              Save Search
            </DialogTitle>
            <DialogDescription>
              Give your search a name so you can easily apply it later.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Search Name</label>
              <Input
                placeholder="e.g., 2-Bed Apartments in Kampala"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveSearch();
                }}
                autoFocus
              />
            </div>

            {/* Preview of criteria being saved */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Criteria to Save</label>
              <div className="flex flex-wrap gap-1.5">
                {searchQuery && (
                  <Badge variant="secondary" className="text-xs gap-1 bg-red-50 text-red-700 border-red-200 dark:bg-red-900 dark:text-red-300 dark:border-red-800">
                    <Search className="h-3 w-3" />
                    &quot;{searchQuery}&quot;
                  </Badge>
                )}
                {filters.city && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <MapPin className="h-3 w-3" />
                    {filters.city}
                  </Badge>
                )}
                {filters.propertyType && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <Home className="h-3 w-3" />
                    {propertyTypeLabels[filters.propertyType] || filters.propertyType}
                  </Badge>
                )}
                {filters.minPrice && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <Banknote className="h-3 w-3" />
                    Min UGX {Number(filters.minPrice).toLocaleString()}
                  </Badge>
                )}
                {filters.maxPrice && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <Banknote className="h-3 w-3" />
                    Max UGX {Number(filters.maxPrice).toLocaleString()}
                  </Badge>
                )}
                {filters.bedrooms && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <Bed className="h-3 w-3" />
                    {filters.bedrooms}+ Bed
                  </Badge>
                )}
                {filters.furnished && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <Sofa className="h-3 w-3" /> Furnished
                  </Badge>
                )}
                {filters.parking && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <Car className="h-3 w-3" /> Parking
                  </Badge>
                )}
                {filters.petsAllowed && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <PawPrint className="h-3 w-3" /> Pets
                  </Badge>
                )}
                {!searchQuery && !filters.city && !filters.propertyType && !filters.minPrice && !filters.maxPrice && !filters.bedrooms && !filters.furnished && !filters.parking && !filters.petsAllowed && (
                  <span className="text-xs text-muted-foreground">No active filters to save</span>
                )}
              </div>
            </div>
          </div>

          <Separator />

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              Cancel
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleSaveSearch}
              disabled={saving || !saveName.trim()}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Bookmark className="mr-2 h-4 w-4" />
                  Save Search
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
