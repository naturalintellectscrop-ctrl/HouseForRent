'use client';

import { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, BarChart3 } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppStore, type Property } from '@/store/useAppStore';
import { propertyTypeLabels } from './PropertyCard';

const CHART_COLORS = ['#ef4444', '#06b6d4', '#f59e0b', '#f43f5e', '#0ea5e9'];

interface PriceRange {
  range: string;
  count: number;
}

interface TypeCount {
  name: string;
  value: number;
}

interface CityCount {
  city: string;
  count: number;
}

interface MonthData {
  month: string;
  inquiries: number;
  views: number;
}

const CUSTOM_TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  padding: '8px 12px',
  fontSize: '13px',
  color: 'hsl(var(--card-foreground))',
};

export default function PropertyStats() {
  const { user, setCurrentView } = useAppStore();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = user?.role === 'ADMIN';

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        if (isAdmin) {
          // Admin: fetch all properties
          const res = await fetch('/api/properties?limit=100');
          if (res.ok) {
            const data = await res.json();
            setProperties(data.properties || data || []);
          }
        } else {
          // Landlord: fetch own properties
          const res = await fetch('/api/users');
          if (res.ok) {
            const data = await res.json();
            setProperties(data.properties || []);
          }
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    };
    if (user) fetchData();
  }, [user, isAdmin]);

  // Price Distribution
  const priceDistribution: PriceRange[] = useMemo(() => {
    const ranges = [
      { range: '0-20K', min: 0, max: 20000 },
      { range: '20K-50K', min: 20000, max: 50000 },
      { range: '50K-100K', min: 50000, max: 100000 },
      { range: '100K-200K', min: 100000, max: 200000 },
      { range: '200K+', min: 200000, max: Infinity },
    ];
    return ranges.map((r) => ({
      range: r.range,
      count: properties.filter((p) => p.price >= r.min && p.price < r.max).length,
    }));
  }, [properties]);

  // Properties by Type
  const propertiesByType: TypeCount[] = useMemo(() => {
    const typeMap: Record<string, number> = {};
    properties.forEach((p) => {
      const label = propertyTypeLabels[p.propertyType] || p.propertyType;
      typeMap[label] = (typeMap[label] || 0) + 1;
    });
    return Object.entries(typeMap).map(([name, value]) => ({ name, value }));
  }, [properties]);

  // Properties by City
  const propertiesByCity: CityCount[] = useMemo(() => {
    const cityMap: Record<string, number> = {};
    properties.forEach((p) => {
      cityMap[p.city] = (cityMap[p.city] || 0) + 1;
    });
    return Object.entries(cityMap)
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [properties]);

  // Mock Inquiries Over Time (6 months)
  const inquiriesOverTime: MonthData[] = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    const base = properties.length * 2;
    return months.map((month, i) => ({
      month,
      inquiries: Math.max(1, Math.floor(base * (0.5 + Math.random() * 0.8) * ((i + 1) / 6))),
      views: Math.max(5, Math.floor(base * 3 * (0.5 + Math.random() * 0.8) * ((i + 1) / 6))),
    }));
  }, [properties]);

  // Mock Views Overview (6 months)
  const viewsOverview: MonthData[] = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    const base = properties.length * 5;
    return months.map((month, i) => ({
      month,
      inquiries: 0,
      views: Math.max(10, Math.floor(base * (0.4 + Math.random() * 0.9) * ((i + 1) / 6))),
    }));
  }, [properties]);

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { delay: i * 0.1, duration: 0.4, ease: 'easeOut' },
    }),
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-80 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={() => {
            setCurrentView(isAdmin ? 'admin' : 'my-listings');
          }}
          className="shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl flex items-center gap-2">
            <BarChart3 className="h-7 w-7 text-red-600" />
            Analytics Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin ? 'Platform-wide analytics overview' : 'Your property analytics overview'}
          </p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Total Properties', value: properties.length },
          { label: 'Avg Price', value: properties.length > 0 ? `UGX ${Math.round(properties.reduce((s, p) => s + p.price, 0) / properties.length).toLocaleString()}` : 'N/A' },
          { label: 'Total Views', value: properties.reduce((s, p) => s + p.views, 0) },
          { label: 'Cities', value: new Set(properties.map((p) => p.city)).size },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-red-600">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Price Distribution */}
        <motion.div custom={0} variants={cardVariants} initial="hidden" animate="visible">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Price Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={priceDistribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="range" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={CUSTOM_TOOLTIP_STYLE} />
                    <Bar dataKey="count" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Properties by Type */}
        <motion.div custom={1} variants={cardVariants} initial="hidden" animate="visible">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Properties by Type</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={propertiesByType}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {propertiesByType.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={CUSTOM_TOOLTIP_STYLE} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Properties by City */}
        <motion.div custom={2} variants={cardVariants} initial="hidden" animate="visible">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Properties by City</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={propertiesByCity} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis dataKey="city" type="category" tick={{ fontSize: 12 }} width={80} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={CUSTOM_TOOLTIP_STYLE} />
                    <Bar dataKey="count" fill="#06b6d4" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Inquiries Over Time */}
        <motion.div custom={3} variants={cardVariants} initial="hidden" animate="visible">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Inquiries Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={inquiriesOverTime}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={CUSTOM_TOOLTIP_STYLE} />
                    <Line type="monotone" dataKey="inquiries" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b', r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Views Overview - Full Width */}
        <motion.div custom={4} variants={cardVariants} initial="hidden" animate="visible" className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Views Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={viewsOverview}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={CUSTOM_TOOLTIP_STYLE} />
                    <Area type="monotone" dataKey="views" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.15} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
