'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import { GitCompare, X, ArrowRight, Building2, LayoutGrid, Map } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import Header from './Header';
import Footer from './Footer';
import AuthModal from './AuthModal';
import HeroSection from './HeroSection';
import HowItWorks from './HowItWorks';
import Testimonials from './Testimonials';
import RecentlyViewed from './RecentlyViewed';
import AIRecommendations from './AIRecommendations';
import SearchFilters from './SearchFilters';
import PropertyGrid from './PropertyGrid';
import PropertyDetail from './PropertyDetail';
import FavoritesView from './FavoritesView';
import InquiriesView from './InquiriesView';
import LandlordDashboard from './LandlordDashboard';
import AddPropertyForm from './AddPropertyForm';
import AdminDashboard from './AdminDashboard';
import ContactPage from './ContactPage';
import PropertyQuickView from './PropertyQuickView';
import PropertyComparison from './PropertyComparison';
import PropertyStats from './PropertyStats';
import Breadcrumbs from './Breadcrumbs';
import UserProfile from './UserProfile';
import MobileBottomNav from './MobileBottomNav';
import ChatView from './ChatView';
import PropertyMap from './PropertyMap';
import SafetyWarning from './SafetyWarning';
import PrivacyPolicy from './PrivacyPolicy';
import TermsOfService from './TermsOfService';
import InstallPrompt from './InstallPrompt';
import SEOHead from './SEOHead';
import { Button } from '@/components/ui/button';

function ComparisonBar() {
  const { comparisonList, removeFromComparison, setCurrentView, properties } = useAppStore();
  const [thumbnails, setThumbnails] = useState<{ id: string; url: string; title: string }[]>([]);

  useEffect(() => {
    const fetchThumbnails = async () => {
      if (comparisonList.length === 0) {
        setThumbnails([]);
        return;
      }
      const results = await Promise.all(
        comparisonList.map(async (id) => {
          // First check if the property is in the store
          const existing = properties.find((p) => p.id === id);
          if (existing) {
            return {
              id: existing.id,
              url: existing.images?.[0]?.url || '',
              title: existing.title,
            };
          }
          try {
            const res = await fetch(`/api/properties/${id}`);
            if (res.ok) {
              const data = await res.json();
              return {
                id: data.id,
                url: data.images?.[0]?.url || '',
                title: data.title,
              };
            }
          } catch {
            // ignore
          }
          return { id, url: '', title: 'Property' };
        })
      );
      setThumbnails(results.filter(Boolean) as { id: string; url: string; title: string }[]);
    };
    fetchThumbnails();
  }, [comparisonList, properties]);

  if (comparisonList.length < 2) return null;

  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      className="fixed bottom-0 left-0 right-0 z-50 border-t bg-white/95 backdrop-blur-md shadow-lg dark:bg-gray-900/95"
    >
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-1.5">
              <GitCompare className="h-5 w-5 text-red-600 shrink-0" />
              <span className="text-sm font-medium whitespace-nowrap">
                {comparisonList.length} selected
              </span>
            </div>
            <div className="flex items-center gap-2 min-w-0">
              {thumbnails.map((thumb) => (
                <div key={thumb.id} className="relative group/thumb shrink-0">
                  <div className="relative h-10 w-14 overflow-hidden rounded-md border">
                    {thumb.url ? (
                      <Image
                        src={thumb.url}
                        alt={thumb.title}
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
                  <button
                    onClick={() => removeFromComparison(thumb.id)}
                    className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <Button
            className="bg-red-600 hover:bg-red-700 text-white shrink-0"
            onClick={() => {
              setCurrentView('compare');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            Compare Now
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

export default function AppShell() {
  const { user, setUser, currentView, propertyViewMode, setPropertyViewMode } = useAppStore();

  // Fetch user on mount
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          setUser(data);
        }
      } catch {
        // Not authenticated - that's fine
      }
    };
    fetchUser();
  }, [setUser]);

  const renderView = () => {
    switch (currentView) {
      case 'home':
        return (
          <div>
            <HeroSection />
            <HowItWorks />
            <RecentlyViewed />
            <AIRecommendations />
            <div id="properties-section" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
              <div className="flex gap-8">
                <SearchFilters />
                <div className="min-w-0 flex-1">
                  {/* View Toggle */}
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {propertyViewMode === 'map' ? 'Properties Map' : 'Properties'}
                    </h2>
                    <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
                      <button
                        onClick={() => setPropertyViewMode('grid')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                          propertyViewMode === 'grid'
                            ? 'bg-white dark:bg-gray-700 text-red-700 dark:text-red-400 shadow-sm'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                        }`}
                      >
                        <LayoutGrid className="h-4 w-4" />
                        Grid
                      </button>
                      <button
                        onClick={() => setPropertyViewMode('map')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                          propertyViewMode === 'map'
                            ? 'bg-white dark:bg-gray-700 text-red-700 dark:text-red-400 shadow-sm'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                        }`}
                      >
                        <Map className="h-4 w-4" />
                        Map
                      </button>
                    </div>
                  </div>

                  {/* Map or Grid View */}
                  <AnimatePresence mode="wait">
                    {propertyViewMode === 'map' ? (
                      <motion.div
                        key="map"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                      >
                        <PropertyMap />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="grid"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                      >
                        <PropertyGrid />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
            <Testimonials />
          </div>
        );
      case 'property-detail':
        return <PropertyDetail />;
      case 'favorites':
        return <FavoritesView />;
      case 'inquiries':
        return <InquiriesView />;
      case 'my-listings':
        return <LandlordDashboard />;
      case 'add-property':
        return <AddPropertyForm />;
      case 'admin':
        return <AdminDashboard />;
      case 'contact':
        return <ContactPage />;
      case 'compare':
        return <PropertyComparison />;
      case 'analytics':
        return <PropertyStats />;
      case 'messages':
        return <ChatView />;
      case 'profile':
        return <UserProfile />;
      case 'privacy':
        return <PrivacyPolicy />;
      case 'terms':
        return <TermsOfService />;
      default:
        return null;
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <SafetyWarning />
      <main className="flex-1 pb-16 md:pb-0">
        <Breadcrumbs />
        <AnimatePresence mode="wait">
          <motion.div
            key={currentView}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {renderView()}
          </motion.div>
        </AnimatePresence>
      </main>
      <Footer />
      <AuthModal />
      <ComparisonBar />
      <PropertyQuickView />
      <MobileBottomNav />
      <InstallPrompt />
      <SEOHead />
    </div>
  );
}
