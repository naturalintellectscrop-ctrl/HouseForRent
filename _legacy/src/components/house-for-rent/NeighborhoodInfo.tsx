'use client';

import { motion } from 'framer-motion';
import {
  MapPin, GraduationCap, Heart, ShoppingCart, Train, TreePine,
  UtensilsCrossed, Compass
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface NearbyPlace {
  name: string;
  distance: string;
  time: string;
}

interface CategoryData {
  icon: React.ElementType;
  label: string;
  places: NearbyPlace[];
}

const cityNeighborhoodData: Record<string, CategoryData[]> = {
  kampala: [
    {
      icon: GraduationCap,
      label: 'Schools',
      places: [
        { name: 'Makerere University', distance: '1.2 km', time: '15 min walk' },
        { name: 'Uganda Martyrs HS', distance: '2.0 km', time: '8 min drive' },
      ],
    },
    {
      icon: Heart,
      label: 'Hospitals',
      places: [
        { name: 'Mulago Hospital', distance: '1.5 km', time: '6 min drive' },
        { name: 'International Hospital', distance: '2.8 km', time: '10 min drive' },
      ],
    },
    {
      icon: ShoppingCart,
      label: 'Shopping',
      places: [
        { name: 'Garden City Mall', distance: '0.8 km', time: '10 min walk' },
        { name: 'Acacia Mall', distance: '3.2 km', time: '12 min drive' },
      ],
    },
    {
      icon: Train,
      label: 'Transport',
      places: [
        { name: 'Old Taxi Park', distance: '0.5 km', time: '6 min walk' },
        { name: 'Kampala Railway Stn', distance: '4.0 km', time: '15 min drive' },
      ],
    },
    {
      icon: TreePine,
      label: 'Parks',
      places: [
        { name: 'Constitutional Sq', distance: '1.8 km', time: '7 min drive' },
        { name: 'Centenary Park', distance: '3.5 km', time: '12 min drive' },
      ],
    },
    {
      icon: UtensilsCrossed,
      label: 'Restaurants',
      places: [
        { name: 'Cafe Javas', distance: '2.5 km', time: '9 min drive' },
        { name: 'The Pearl Restaurant', distance: '1.0 km', time: '12 min walk' },
      ],
    },
  ],
  entebbe: [
    {
      icon: GraduationCap,
      label: 'Schools',
      places: [
        { name: 'Entebbe Int\'l School', distance: '1.5 km', time: '18 min walk' },
        { name: 'Victoria University', distance: '3.0 km', time: '10 min drive' },
      ],
    },
    {
      icon: Heart,
      label: 'Hospitals',
      places: [
        { name: 'Entebbe Hospital', distance: '1.0 km', time: '5 min drive' },
        { name: 'Victoria Hospital', distance: '2.5 km', time: '9 min drive' },
      ],
    },
    {
      icon: ShoppingCart,
      label: 'Shopping',
      places: [
        { name: 'Victoria Mall', distance: '0.6 km', time: '8 min walk' },
        { name: 'Imperial Mall', distance: '1.8 km', time: '7 min drive' },
      ],
    },
    {
      icon: Train,
      label: 'Transport',
      places: [
        { name: 'Entebbe Airport', distance: '3.5 km', time: '10 min drive' },
        { name: 'Entebbe Taxi Park', distance: '0.5 km', time: '6 min walk' },
      ],
    },
    {
      icon: TreePine,
      label: 'Parks',
      places: [
        { name: 'Botanical Gardens', distance: '2.0 km', time: '8 min drive' },
        { name: 'Lake Victoria Beach', distance: '0.8 km', time: '10 min walk' },
      ],
    },
    {
      icon: UtensilsCrossed,
      label: 'Restaurants',
      places: [
        { name: 'Aero Beach Club', distance: '1.5 km', time: '6 min drive' },
        { name: 'Owl Restaurant', distance: '0.9 km', time: '11 min walk' },
      ],
    },
  ],
  jinja: [
    {
      icon: GraduationCap,
      label: 'Schools',
      places: [
        { name: 'Busoga University', distance: '5 km', time: '12 min drive' },
        { name: 'Jinja College', distance: '1.8 km', time: '7 min drive' },
      ],
    },
    {
      icon: Heart,
      label: 'Hospitals',
      places: [
        { name: 'Jinja Hospital', distance: '1.2 km', time: '5 min drive' },
        { name: 'Jinja Medical Centre', distance: '2.0 km', time: '8 min drive' },
      ],
    },
    {
      icon: ShoppingCart,
      label: 'Shopping',
      places: [
        { name: 'Jinja Main Market', distance: '0.7 km', time: '9 min walk' },
        { name: 'Source Mall', distance: '1.5 km', time: '6 min drive' },
      ],
    },
    {
      icon: Train,
      label: 'Transport',
      places: [
        { name: 'Jinja Taxi Park', distance: '0.5 km', time: '6 min walk' },
        { name: 'Jinja Bus Terminal', distance: '1.0 km', time: '12 min walk' },
      ],
    },
    {
      icon: TreePine,
      label: 'Parks',
      places: [
        { name: 'Source of the Nile', distance: '2.5 km', time: '9 min drive' },
        { name: 'Nile River Banks', distance: '1.0 km', time: '12 min walk' },
      ],
    },
    {
      icon: UtensilsCrossed,
      label: 'Restaurants',
      places: [
        { name: 'Nile Safari Lodge', distance: '1.8 km', time: '7 min drive' },
        { name: 'Source Cafe', distance: '0.8 km', time: '10 min walk' },
      ],
    },
  ],
  mbarara: [
    {
      icon: GraduationCap,
      label: 'Schools',
      places: [
        { name: 'Mbarara University', distance: '3 km', time: '10 min drive' },
        { name: 'Mbarara High School', distance: '1.5 km', time: '6 min drive' },
      ],
    },
    {
      icon: Heart,
      label: 'Hospitals',
      places: [
        { name: 'Mbarara Hospital', distance: '1.5 km', time: '6 min drive' },
        { name: 'Mayanja Memorial', distance: '2.0 km', time: '8 min drive' },
      ],
    },
    {
      icon: ShoppingCart,
      label: 'Shopping',
      places: [
        { name: 'Mbarara Market', distance: '0.5 km', time: '6 min walk' },
        { name: 'Lake View Mall', distance: '1.2 km', time: '5 min drive' },
      ],
    },
    {
      icon: Train,
      label: 'Transport',
      places: [
        { name: 'Mbarara Taxi Park', distance: '0.8 km', time: '10 min walk' },
        { name: 'Bus Terminal', distance: '1.0 km', time: '12 min walk' },
      ],
    },
    {
      icon: TreePine,
      label: 'Parks',
      places: [
        { name: 'Lake Mburo NP', distance: '50 km', time: '1 hr drive' },
        { name: 'Mbarara Golf Club', distance: '2.0 km', time: '8 min drive' },
      ],
    },
    {
      icon: UtensilsCrossed,
      label: 'Restaurants',
      places: [
        { name: 'Hotel Triangle', distance: '1.0 km', time: '12 min walk' },
        { name: 'Agip Motel', distance: '1.5 km', time: '6 min drive' },
      ],
    },
  ],
  gulu: [
    {
      icon: GraduationCap,
      label: 'Schools',
      places: [
        { name: 'Gulu University', distance: '5 km', time: '12 min drive' },
        { name: 'Gulu Central HS', distance: '1.5 km', time: '6 min drive' },
      ],
    },
    {
      icon: Heart,
      label: 'Hospitals',
      places: [
        { name: 'Gulu Hospital', distance: '1.0 km', time: '5 min drive' },
        { name: 'St. Mary\'s Hospital', distance: '2.5 km', time: '9 min drive' },
      ],
    },
    {
      icon: ShoppingCart,
      label: 'Shopping',
      places: [
        { name: 'Gulu Main Market', distance: '0.5 km', time: '6 min walk' },
        { name: 'Pece Mall', distance: '1.2 km', time: '5 min drive' },
      ],
    },
    {
      icon: Train,
      label: 'Transport',
      places: [
        { name: 'Gulu Taxi Park', distance: '0.5 km', time: '6 min walk' },
        { name: 'Gulu Airstrip', distance: '4.0 km', time: '12 min drive' },
      ],
    },
    {
      icon: TreePine,
      label: 'Parks',
      places: [
        { name: 'Murchison Falls NP', distance: '80 km', time: '2 hr drive' },
        { name: 'Gulu Pece Stadium', distance: '1.5 km', time: '6 min drive' },
      ],
    },
    {
      icon: UtensilsCrossed,
      label: 'Restaurants',
      places: [
        { name: 'Boma Hotel', distance: '1.0 km', time: '12 min walk' },
        { name: 'Taks Garden', distance: '0.8 km', time: '10 min walk' },
      ],
    },
  ],
  mbale: [
    {
      icon: GraduationCap,
      label: 'Schools',
      places: [
        { name: 'Islamic University', distance: '3 km', time: '10 min drive' },
        { name: 'Mbale Secondary', distance: '1.5 km', time: '6 min drive' },
      ],
    },
    {
      icon: Heart,
      label: 'Hospitals',
      places: [
        { name: 'Mbale Hospital', distance: '1.0 km', time: '5 min drive' },
        { name: 'Cure Hospital', distance: '2.0 km', time: '8 min drive' },
      ],
    },
    {
      icon: ShoppingCart,
      label: 'Shopping',
      places: [
        { name: 'Mbale Central Market', distance: '0.4 km', time: '5 min walk' },
        { name: 'Bugisu Cooperative', distance: '1.2 km', time: '5 min drive' },
      ],
    },
    {
      icon: Train,
      label: 'Transport',
      places: [
        { name: 'Mbale Taxi Park', distance: '0.3 km', time: '4 min walk' },
        { name: 'Mbale Road (Kampala)', distance: '220 km', time: '4 hr drive' },
      ],
    },
    {
      icon: TreePine,
      label: 'Parks',
      places: [
        { name: 'Mt. Elgon NP', distance: '15 km', time: '25 min drive' },
        { name: 'Sipi Falls', distance: '50 km', time: '1 hr drive' },
      ],
    },
    {
      icon: UtensilsCrossed,
      label: 'Restaurants',
      places: [
        { name: 'Mount Elgon Hotel', distance: '2.5 km', time: '9 min drive' },
        { name: 'Mbale Resort', distance: '1.0 km', time: '12 min walk' },
      ],
    },
  ],
  'fort portal': [
    {
      icon: GraduationCap,
      label: 'Schools',
      places: [
        { name: 'Mountains of the Moon Univ', distance: '3 km', time: '10 min drive' },
        { name: 'Fort Portal SS', distance: '1.5 km', time: '6 min drive' },
      ],
    },
    {
      icon: Heart,
      label: 'Hospitals',
      places: [
        { name: 'Fort Portal Hospital', distance: '0.8 km', time: '5 min drive' },
        { name: 'Virika Hospital', distance: '1.5 km', time: '6 min drive' },
      ],
    },
    {
      icon: ShoppingCart,
      label: 'Shopping',
      places: [
        { name: 'Fort Portal Market', distance: '0.5 km', time: '6 min walk' },
        { name: 'Mpanga Market', distance: '1.0 km', time: '12 min walk' },
      ],
    },
    {
      icon: Train,
      label: 'Transport',
      places: [
        { name: 'Fort Portal Taxi Park', distance: '0.5 km', time: '6 min walk' },
        { name: 'Bus Terminal', distance: '0.8 km', time: '10 min walk' },
      ],
    },
    {
      icon: TreePine,
      label: 'Parks',
      places: [
        { name: 'Rwenzori Mountains NP', distance: '20 km', time: '35 min drive' },
        { name: 'Kibale NP', distance: '30 km', time: '45 min drive' },
      ],
    },
    {
      icon: UtensilsCrossed,
      label: 'Restaurants',
      places: [
        { name: 'Mountains of the Moon Hotel', distance: '2.0 km', time: '8 min drive' },
        { name: 'Gardens Restaurant', distance: '0.6 km', time: '8 min walk' },
      ],
    },
  ],
  arua: [
    {
      icon: GraduationCap,
      label: 'Schools',
      places: [
        { name: 'Muni University', distance: '5 km', time: '12 min drive' },
        { name: 'Arua Public School', distance: '1.5 km', time: '6 min drive' },
      ],
    },
    {
      icon: Heart,
      label: 'Hospitals',
      places: [
        { name: 'Arua Hospital', distance: '1.0 km', time: '5 min drive' },
        { name: 'Ediofe Hospital', distance: '2.0 km', time: '8 min drive' },
      ],
    },
    {
      icon: ShoppingCart,
      label: 'Shopping',
      places: [
        { name: 'Arua Main Market', distance: '0.5 km', time: '6 min walk' },
        { name: 'West Nile Mall', distance: '1.0 km', time: '12 min walk' },
      ],
    },
    {
      icon: Train,
      label: 'Transport',
      places: [
        { name: 'Arua Taxi Park', distance: '0.4 km', time: '5 min walk' },
        { name: 'Arua Airport', distance: '8.0 km', time: '18 min drive' },
      ],
    },
    {
      icon: TreePine,
      label: 'Parks',
      places: [
        { name: 'Murchison Falls NP', distance: '120 km', time: '3 hr drive' },
        { name: 'Arua Hill Viewpoint', distance: '2.0 km', time: '8 min drive' },
      ],
    },
    {
      icon: UtensilsCrossed,
      label: 'Restaurants',
      places: [
        { name: 'Arua Resort Hotel', distance: '1.0 km', time: '12 min walk' },
        { name: 'Delight Restaurant', distance: '0.8 km', time: '10 min walk' },
      ],
    },
  ],
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

interface NeighborhoodInfoProps {
  city: string;
}

export default function NeighborhoodInfo({ city }: NeighborhoodInfoProps) {
  const normalizedCity = city.toLowerCase().trim();
  const data = cityNeighborhoodData[normalizedCity];

  if (!data) {
    return (
      <Card className="border-red-200/50 dark:border-red-800/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/50">
              <MapPin className="h-4 w-4 text-red-600" />
            </div>
            What&apos;s Nearby
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/30">
              <Compass className="h-6 w-6 text-red-500" />
            </div>
            <p className="text-sm text-muted-foreground">
              Explore the neighborhood in {city}
            </p>
            <p className="text-xs text-muted-foreground/70">
              Discover nearby schools, hospitals, shopping, and more
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-red-200/50 dark:border-red-800/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/50">
            <MapPin className="h-4 w-4 text-red-600" />
          </div>
          What&apos;s Nearby
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-2 gap-3"
        >
          {data.map((category) => {
            const Icon = category.icon;
            return (
              <motion.div
                key={category.label}
                variants={itemVariants}
                className="rounded-lg border border-red-100 dark:border-red-900/50 bg-white dark:bg-gray-900/50 p-3 hover:border-red-300 dark:hover:border-red-700 transition-colors"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/50">
                    <Icon className="h-3.5 w-3.5 text-red-600" />
                  </div>
                  <span className="text-xs font-semibold text-red-700 dark:text-red-400">
                    {category.label}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {category.places.map((place) => (
                    <div key={place.name} className="space-y-0.5">
                      <p className="text-xs font-medium leading-tight truncate">
                        {place.name}
                      </p>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span className="font-medium text-red-600 dark:text-red-400">
                          {place.distance}
                        </span>
                        <span>·</span>
                        <span>{place.time}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </CardContent>
    </Card>
  );
}
