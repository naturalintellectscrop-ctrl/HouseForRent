'use client';

import { ChevronRight, Home } from 'lucide-react';
import { useAppStore, type ViewMode } from '@/store/useAppStore';

interface BreadcrumbItem {
  label: string;
  view: ViewMode;
}

const breadcrumbMap: Record<string, BreadcrumbItem[]> = {
  home: [{ label: 'Home', view: 'home' }],
  'property-detail': [
    { label: 'Home', view: 'home' },
    { label: 'Property Details', view: 'property-detail' },
  ],
  favorites: [
    { label: 'Home', view: 'home' },
    { label: 'My Favorites', view: 'favorites' },
  ],
  inquiries: [
    { label: 'Home', view: 'home' },
    { label: 'Messages', view: 'inquiries' },
  ],
  'my-listings': [
    { label: 'Home', view: 'home' },
    { label: 'My Listings', view: 'my-listings' },
  ],
  'add-property': [
    { label: 'Home', view: 'home' },
    { label: 'Add Property', view: 'add-property' },
  ],
  admin: [
    { label: 'Home', view: 'home' },
    { label: 'Admin Dashboard', view: 'admin' },
  ],
  analytics: [
    { label: 'Home', view: 'home' },
    { label: 'Analytics', view: 'analytics' },
  ],
  compare: [
    { label: 'Home', view: 'home' },
    { label: 'Compare Properties', view: 'compare' },
  ],
  messages: [
    { label: 'Home', view: 'home' },
    { label: 'Messages', view: 'messages' },
  ],
  contact: [
    { label: 'Home', view: 'home' },
    { label: 'Contact', view: 'contact' },
  ],
};

export default function Breadcrumbs() {
  const { currentView, setCurrentView } = useAppStore();

  const items = breadcrumbMap[currentView] || [{ label: 'Home', view: 'home' as ViewMode }];

  // Don't show breadcrumbs on home
  if (currentView === 'home') return null;

  return (
    <nav aria-label="Breadcrumb" className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
      <ol className="flex items-center gap-1 text-sm">
        {items.map((item, index) => {
          const isActive = index === items.length - 1;
          return (
            <li key={item.view + index} className="flex items-center gap-1">
              {index > 0 && (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
              )}
              {item.view === 'home' ? (
                <button
                  onClick={() => setCurrentView('home')}
                  className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors hover:bg-muted ${
                    isActive
                      ? 'font-medium text-red-600 dark:text-red-400'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Home className="h-3.5 w-3.5" />
                  <span>{item.label}</span>
                </button>
              ) : isActive ? (
                <span
                  className="px-1.5 py-0.5 font-medium text-red-600 dark:text-red-400"
                  aria-current="page"
                >
                  {item.label}
                </span>
              ) : (
                <button
                  onClick={() => setCurrentView(item.view)}
                  className="rounded-md px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {item.label}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
