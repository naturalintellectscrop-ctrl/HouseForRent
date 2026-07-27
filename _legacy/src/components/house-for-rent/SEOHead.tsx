'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';

const viewMetaMap: Record<string, { title: string; description: string }> = {
  home: {
    title: "House For Rent - Uganda's #1 Rental Platform",
    description:
      'Find your perfect rental home in Uganda. Discover thousands of rental properties across Uganda.',
  },
  'property-detail': {
    title: 'Property Details - House For Rent',
    description:
      'View property details, photos, amenities, and contact the landlord on House For Rent.',
  },
  favorites: {
    title: 'My Favorites - House For Rent',
    description:
      'View your saved favorite rental properties on House For Rent.',
  },
  inquiries: {
    title: 'Messages - House For Rent',
    description:
      'View and manage your property inquiries on House For Rent.',
  },
  messages: {
    title: 'Messages - House For Rent',
    description:
      'Chat with landlords and manage your messages on House For Rent.',
  },
  'my-listings': {
    title: 'My Listings - House For Rent',
    description:
      'Manage your rental property listings on House For Rent.',
  },
  'add-property': {
    title: 'Add Property - House For Rent',
    description:
      'List your rental property on House For Rent and reach thousands of potential tenants in Uganda.',
  },
  admin: {
    title: 'Admin Dashboard - House For Rent',
    description:
      'Manage properties, users, and platform settings on House For Rent.',
  },
  compare: {
    title: 'Compare Properties - House For Rent',
    description:
      'Compare rental properties side by side on House For Rent.',
  },
  analytics: {
    title: 'Analytics - House For Rent',
    description:
      'View property market analytics and insights on House For Rent.',
  },
  contact: {
    title: 'Contact Us - House For Rent',
    description:
      'Get in touch with House For Rent. We are here to help you find your perfect rental home in Uganda.',
  },
  profile: {
    title: 'My Profile - House For Rent',
    description:
      'Manage your profile and account settings on House For Rent.',
  },
};

export default function SEOHead() {
  const currentView = useAppStore((state) => state.currentView);

  useEffect(() => {
    const meta = viewMetaMap[currentView] || viewMetaMap.home;

    // Update title
    document.title = meta.title;

    // Update meta description
    const descriptionMeta = document.querySelector('meta[name="description"]');
    if (descriptionMeta) {
      descriptionMeta.setAttribute('content', meta.description);
    }

    // Update Open Graph tags
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) {
      ogTitle.setAttribute('content', meta.title);
    }

    const ogDescription = document.querySelector(
      'meta[property="og:description"]'
    );
    if (ogDescription) {
      ogDescription.setAttribute('content', meta.description);
    }

    // Update Twitter tags
    const twitterTitle = document.querySelector('meta[name="twitter:title"]');
    if (twitterTitle) {
      twitterTitle.setAttribute('content', meta.title);
    }

    const twitterDescription = document.querySelector(
      'meta[name="twitter:description"]'
    );
    if (twitterDescription) {
      twitterDescription.setAttribute('content', meta.description);
    }
  }, [currentView]);

  return null;
}
