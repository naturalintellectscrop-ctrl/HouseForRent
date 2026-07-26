'use client';

import { Home, Heart, Building2, MessageSquare, User, Plus } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';

export default function MobileBottomNav() {
  const { user, currentView, setCurrentView } = useAppStore();

  const navItems = [
    { label: 'Home', view: 'home' as const, icon: Home, show: true },
    { label: 'Favorites', view: 'favorites' as const, icon: Heart, show: !!user },
    { label: 'List', view: 'add-property' as const, icon: Plus, show: user?.role === 'LANDLORD' || user?.role === 'ADMIN', isSpecial: true },
    { label: 'Messages', view: 'messages' as const, icon: MessageSquare, show: !!user },
    { label: 'Profile', view: 'profile' as const, icon: User, show: !!user },
  ].filter((n) => n.show);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur-lg md:hidden safe-area-bottom">
      <div className="flex items-center justify-around px-2 py-1">
        {navItems.map((item) => {
          const isActive = currentView === item.view;
          const Icon = item.icon;

          if (item.isSpecial) {
            return (
              <button
                key={item.view}
                onClick={() => {
                  setCurrentView(item.view);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="flex flex-col items-center justify-center -mt-5"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 shadow-lg shadow-red-600/30 text-white">
                  <Icon className="h-6 w-6" />
                </div>
                <span className="mt-1 text-[10px] font-medium text-red-600">Add</span>
              </button>
            );
          }

          return (
            <button
              key={item.view}
              onClick={() => {
                setCurrentView(item.view);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="flex flex-col items-center justify-center py-2 px-3 min-w-0"
            >
              <Icon
                className={`h-5 w-5 transition-colors ${
                  isActive ? 'text-red-600' : 'text-muted-foreground'
                }`}
              />
              <span
                className={`mt-1 text-[10px] font-medium transition-colors ${
                  isActive ? 'text-red-600' : 'text-muted-foreground'
                }`}
              >
                {item.label}
              </span>
              {isActive && (
                <span className="absolute bottom-0 h-0.5 w-8 rounded-full bg-red-600" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
