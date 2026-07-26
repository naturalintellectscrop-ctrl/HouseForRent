import { create } from 'zustand';

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  avatar?: string | null;
  verified?: boolean;
  phone?: string | null;
  bio?: string | null;
}

export interface PropertyImage {
  id: string;
  url: string;
  caption?: string | null;
  isPrimary: boolean;
  order: number;
}

export interface Amenity {
  id: string;
  name: string;
  icon?: string | null;
  category?: string | null;
}

export interface PropertyAmenity {
  id: string;
  amenityId: string;
  amenity: Amenity;
}

export interface Property {
  id: string;
  title: string;
  description: string;
  price: number;
  location: string;
  address: string;
  city: string;
  bedrooms: number;
  bathrooms: number;
  propertyType: string;
  status: string;
  area: number;
  furnished: boolean;
  parking: boolean;
  petsAllowed: boolean;
  yearBuilt?: number | null;
  floor?: number | null;
  totalFloors?: number | null;
  listingStatus: string;
  views: number;
  featured: boolean;
  listingType: string;
  landTitleType?: string | null;
  paymentStatus?: string;
  paymentReference?: string | null;
  landlordId: string;
  createdAt: string;
  updatedAt: string;
  images: PropertyImage[];
  amenities: PropertyAmenity[];
  landlord: {
    id: string;
    name: string;
    avatar?: string | null;
    verified: boolean;
    phone?: string | null;
    bio?: string | null;
  };
  _count?: {
    favorites: number;
    inquiries: number;
  };
  isFavorited?: boolean;
}

export interface Inquiry {
  id: string;
  message: string;
  status: string;
  tenantId: string;
  propertyId: string;
  createdAt: string;
  updatedAt: string;
  tenant?: {
    id: string;
    name: string;
    avatar?: string | null;
    email?: string;
  };
  property?: Property & {
    images?: PropertyImage[];
    landlord?: { id: string; name: string; avatar?: string | null; verified: boolean };
  };
  messages?: Message[];
}

export interface Message {
  id: string;
  content: string;
  senderId: string;
  receiverId: string;
  inquiryId: string;
  read: boolean;
  createdAt: string;
  sender?: {
    id: string;
    name: string;
    avatar?: string | null;
  };
}

export type ViewMode = 'home' | 'property-detail' | 'favorites' | 'inquiries' | 'my-listings' | 'add-property' | 'admin' | 'messages' | 'contact' | 'compare' | 'analytics' | 'profile' | 'privacy' | 'terms';

interface AppState {
  // Auth
  user: User | null;
  setUser: (user: User | null) => void;

  // Navigation
  currentView: ViewMode;
  setCurrentView: (view: ViewMode) => void;
  selectedPropertyId: string | null;
  setSelectedPropertyId: (id: string | null) => void;
  selectedInquiryId: string | null;
  setSelectedInquiryId: (id: string | null) => void;

  // Quick View
  quickViewPropertyId: string | null;
  setQuickViewPropertyId: (id: string | null) => void;

  // Properties
  properties: Property[];
  setProperties: (properties: Property[]) => void;
  totalProperties: number;
  setTotalProperties: (total: number) => void;
  currentPage: number;
  setCurrentPage: (page: number) => void;
  totalPages: number;
  setTotalPages: (pages: number) => void;

  // Search & Filters
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filters: PropertyFilters;
  setFilters: (filters: PropertyFilters) => void;
  resetFilters: () => void;
  sortBy: string;
  setSortBy: (sort: string) => void;

  // Comparison
  comparisonList: string[];
  addToComparison: (id: string) => void;
  removeFromComparison: (id: string) => void;
  clearComparison: () => void;

  // Property View Mode
  propertyViewMode: 'grid' | 'map';
  setPropertyViewMode: (mode: 'grid' | 'map') => void;

  // UI State
  showAuthModal: boolean;
  setShowAuthModal: (show: boolean) => void;
  authMode: 'login' | 'register';
  setAuthMode: (mode: 'login' | 'register') => void;
  showFiltersPanel: boolean;
  setShowFiltersPanel: (show: boolean) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  showMobileMenu: boolean;
  setShowMobileMenu: (show: boolean) => void;
}

export interface PropertyFilters {
  city: string;
  propertyType: string;
  listingType: string;
  minPrice: string;
  maxPrice: string;
  bedrooms: string;
  minArea: string;
  maxArea: string;
  furnished: boolean | null;
  parking: boolean | null;
  petsAllowed: boolean | null;
}

const defaultFilters: PropertyFilters = {
  city: '',
  propertyType: '',
  listingType: '',
  minPrice: '',
  maxPrice: '',
  bedrooms: '',
  minArea: '',
  maxArea: '',
  furnished: null,
  parking: null,
  petsAllowed: null,
};

export const useAppStore = create<AppState>((set) => ({
  // Auth
  user: null,
  setUser: (user) => set({ user }),

  // Navigation
  currentView: 'home',
  setCurrentView: (currentView) => set({ currentView }),
  selectedPropertyId: null,
  setSelectedPropertyId: (selectedPropertyId) => set({ selectedPropertyId }),
  selectedInquiryId: null,
  setSelectedInquiryId: (selectedInquiryId) => set({ selectedInquiryId }),

  // Quick View
  quickViewPropertyId: null,
  setQuickViewPropertyId: (quickViewPropertyId) => set({ quickViewPropertyId }),

  // Properties
  properties: [],
  setProperties: (properties) => set({ properties }),
  totalProperties: 0,
  setTotalProperties: (totalProperties) => set({ totalProperties }),
  currentPage: 1,
  setCurrentPage: (currentPage) => set({ currentPage }),
  totalPages: 1,
  setTotalPages: (totalPages) => set({ totalPages }),

  // Search & Filters
  searchQuery: '',
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  filters: defaultFilters,
  setFilters: (filters) => set({ filters }),
  resetFilters: () => set({ filters: defaultFilters }),
  sortBy: 'newest',
  setSortBy: (sortBy) => set({ sortBy }),

  // Comparison
  comparisonList: [],
  addToComparison: (id) =>
    set((state) => {
      if (state.comparisonList.includes(id) || state.comparisonList.length >= 3) return state;
      return { comparisonList: [...state.comparisonList, id] };
    }),
  removeFromComparison: (id) =>
    set((state) => ({ comparisonList: state.comparisonList.filter((pid) => pid !== id) })),
  clearComparison: () => set({ comparisonList: [] }),

  // Property View Mode
  propertyViewMode: 'grid',
  setPropertyViewMode: (propertyViewMode) => set({ propertyViewMode }),

  // UI State
  showAuthModal: false,
  setShowAuthModal: (showAuthModal) => set({ showAuthModal }),
  authMode: 'login',
  setAuthMode: (authMode) => set({ authMode }),
  showFiltersPanel: false,
  setShowFiltersPanel: (showFiltersPanel) => set({ showFiltersPanel }),
  isLoading: false,
  setIsLoading: (isLoading) => set({ isLoading }),
  showMobileMenu: false,
  setShowMobileMenu: (showMobileMenu) => set({ showMobileMenu }),
}));
