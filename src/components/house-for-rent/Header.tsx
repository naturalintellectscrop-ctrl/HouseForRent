'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import {
  Home, Search, Heart, Building2, MessageSquare, Shield,
  Menu, LogOut, ChevronDown, Plus, Bell, User
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAppStore } from '@/store/useAppStore';
import { toast } from 'sonner';
import ThemeToggle from './ThemeToggle';
import NotificationCenter from './NotificationCenter';

export default function Header() {
  const {
    user,
    setUser,
    currentView,
    setCurrentView,
    searchQuery,
    setSearchQuery,
    setCurrentPage,
    setShowAuthModal,
    setAuthMode,
    showMobileMenu,
    setShowMobileMenu,
  } = useAppStore();

  const [mobileSearch, setMobileSearch] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [notificationBounce, setNotificationBounce] = useState(false);
  const prevUnreadCountRef = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const fetchUnreadCount = useCallback(async () => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    try {
      const res = await fetch('/api/inquiries');
      if (res.ok) {
        const inquiries = await res.json();
        let count = 0;
        for (const inquiry of inquiries) {
          if (inquiry.messages) {
            for (const msg of inquiry.messages) {
              if (!msg.read && msg.senderId !== user.id) {
                count++;
              }
            }
          }
        }
        // Trigger bounce animation if count increased
        if (count > prevUnreadCountRef.current && prevUnreadCountRef.current >= 0) {
          setNotificationBounce(true);
          setTimeout(() => setNotificationBounce(false), 600);
        }
        prevUnreadCountRef.current = count;
        setUnreadCount(count);
      }
    } catch {
      // silently fail
    }
  }, [user]);

  useEffect(() => {
    const timeout = setTimeout(fetchUnreadCount, 0);
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => { clearTimeout(timeout); clearInterval(interval); };
  }, [fetchUnreadCount]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/me', { method: 'DELETE' });
      setUser(null);
      setCurrentView('home');
      toast.success('Logged out successfully');
    } catch {
      toast.error('Failed to logout');
    }
  };

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
    if (currentView !== 'home') setCurrentView('home');
  };

  const navItems = [
    { label: 'Home', view: 'home' as const, icon: Home, show: true },
    { label: 'Favorites', view: 'favorites' as const, icon: Heart, show: !!user },
    { label: 'My Listings', view: 'my-listings' as const, icon: Building2, show: user?.role === 'LANDLORD' || user?.role === 'ADMIN' },
    { label: 'Messages', view: 'messages' as const, icon: MessageSquare, show: !!user },
    { label: 'Admin', view: 'admin' as const, icon: Shield, show: user?.role === 'ADMIN' },
  ];

  return (
    <header
      className={`sticky top-0 z-40 w-full border-b transition-all duration-300 ${
        scrolled
          ? 'bg-background/95 backdrop-blur-xl shadow-[0_1px_0_0_rgba(239,68,68,0.2)]'
          : 'bg-background/80 backdrop-blur-lg'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Logo with hover bounce animation */}
        <motion.button
          onClick={() => setCurrentView('home')}
          className="flex shrink-0 items-center gap-2"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.98 }}
        >
          <motion.div
            className="flex items-center justify-center"
            whileHover={{ y: -2 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          >
            <Image
              src="/logo.png"
              alt="House For Rent Logo"
              width={36}
              height={36}
              className="rounded-lg"
              unoptimized
            />
          </motion.div>
          <span className="hidden font-bold text-lg sm:block">
            House<span className="text-red-600">ForRent</span>
          </span>
        </motion.button>

        {/* Desktop Search with prominent red glow on focus */}
        <div className="hidden md:flex flex-1 max-w-md mx-4">
          <div className={`relative w-full transition-all duration-300 ${searchFocused ? 'max-w-lg' : 'max-w-md'}`}>
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search properties..."
              className={`pl-9 pr-4 transition-all duration-300 ${
                searchFocused
                  ? 'ring-2 ring-red-400 border-red-400 dark:border-red-600 shadow-[0_0_15px_rgba(239,68,68,0.15)]'
                  : ''
              }`}
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
            />
          </div>
        </div>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navItems.filter((n) => n.show).map((item) => (
            <Button
              key={item.view}
              variant={currentView === item.view ? 'secondary' : 'ghost'}
              size="sm"
              className={`gap-1.5 relative ${currentView === item.view ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400' : ''}`}
              onClick={() => setCurrentView(item.view)}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
              {/* Active nav indicator: red underline */}
              {currentView === item.view && (
                <motion.div
                  layoutId="activeNavIndicator"
                  className="absolute -bottom-[9px] left-2 right-2 h-0.5 bg-red-500 rounded-full"
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              )}
              {/* Notification badge for Messages */}
              {item.view === 'messages' && unreadCount > 0 && (
                <motion.span
                  className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white"
                  animate={notificationBounce ? {
                    scale: [1, 1.4, 1],
                    y: [0, -3, 0],
                  } : {}}
                  transition={notificationBounce ? { duration: 0.5, ease: 'easeInOut' } : {}}
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </motion.span>
              )}
            </Button>
          ))}
        </nav>

        {/* Notification Center & Theme Toggle */}
        <div className="hidden md:flex items-center gap-1">
          {user && <NotificationCenter />}
          <ThemeToggle />
        </div>

        {/* User Actions */}
        <div className="flex items-center gap-2">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 pl-2 pr-1">
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={user.avatar || undefined} alt={user.name} />
                    <AvatarFallback className="bg-red-100 text-red-700 text-xs">
                      {user.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:block text-sm">{user.name}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span>{user.name}</span>
                    <span className="text-xs text-muted-foreground font-normal">{user.email}</span>
                    <Badge className="mt-1 w-fit text-xs" variant="outline">
                      {user.role}
                    </Badge>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setCurrentView('profile')}>
                  <User className="mr-2 h-4 w-4" />
                  My Profile
                </DropdownMenuItem>
                {(user.role === 'LANDLORD' || user.role === 'ADMIN') && (
                  <DropdownMenuItem onClick={() => setCurrentView('add-property')}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Property
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setCurrentView('favorites')}>
                  <Heart className="mr-2 h-4 w-4" />
                  My Favorites
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCurrentView('messages')}>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Messages
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setAuthMode('login'); setShowAuthModal(true); }}
              >
                Login
              </Button>
              <Button
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={() => { setAuthMode('register'); setShowAuthModal(true); }}
              >
                Sign Up
              </Button>
            </div>
          )}

          {/* Mobile: Notifications & Theme */}
          <div className="md:hidden flex items-center gap-1">
            {user && <NotificationCenter />}
            <ThemeToggle />
          </div>
          <Sheet open={showMobileMenu} onOpenChange={setShowMobileMenu}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Image
                    src="/logo.png"
                    alt="House For Rent Logo"
                    width={28}
                    height={28}
                    className="rounded-lg"
                    unoptimized
                  />
                  HouseForRent
                </SheetTitle>
              </SheetHeader>

              {/* Mobile Search */}
              <div className="mt-4 relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  className="pl-9"
                  value={mobileSearch}
                  onChange={(e) => setMobileSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSearch(mobileSearch);
                      setShowMobileMenu(false);
                    }
                  }}
                />
              </div>

              <nav className="mt-6 space-y-1">
                {navItems.filter((n) => n.show).map((item) => (
                  <Button
                    key={item.view}
                    variant={currentView === item.view ? 'secondary' : 'ghost'}
                    className={`w-full justify-start gap-3 relative ${
                      currentView === item.view ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400' : ''
                    }`}
                    onClick={() => {
                      setCurrentView(item.view);
                      setShowMobileMenu(false);
                    }}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                    {item.view === 'messages' && unreadCount > 0 && (
                      <motion.span
                        className="absolute right-3 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white"
                        animate={notificationBounce ? {
                          scale: [1, 1.4, 1],
                          y: [0, -3, 0],
                        } : {}}
                        transition={notificationBounce ? { duration: 0.5, ease: 'easeInOut' } : {}}
                      >
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </motion.span>
                    )}
                  </Button>
                ))}
              </nav>

              {user ? (
                <div className="mt-6 pt-4 border-t space-y-3">
                  <div className="flex items-center gap-3 px-2">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={user.avatar || undefined} alt={user.name} />
                      <AvatarFallback className="bg-red-100 text-red-700">
                        {user.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-sm">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => { handleLogout(); setShowMobileMenu(false); }}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                  </Button>
                </div>
              ) : (
                <div className="mt-6 pt-4 border-t space-y-2">
                  <Button
                    className="w-full bg-red-600 hover:bg-red-700 text-white"
                    onClick={() => { setAuthMode('register'); setShowAuthModal(true); setShowMobileMenu(false); }}
                  >
                    Sign Up
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => { setAuthMode('login'); setShowAuthModal(true); setShowMobileMenu(false); }}
                  >
                    Login
                  </Button>
                </div>
              )}
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
