'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { format } from 'date-fns';
import {
  Building2, Eye, MessageSquare, Heart, Plus, Trash2, Edit,
  MapPin, TrendingUp, Loader2, BarChart3
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from './EmptyState';
import { useAppStore, type Property, type Inquiry } from '@/store/useAppStore';
import { toast } from 'sonner';
import { formatUGX, propertyTypeLabels, listingTypeLabels, listingTypeColors } from './PropertyCard';

export default function LandlordDashboard() {
  const { user, setCurrentView, setSelectedPropertyId } = useAppStore();
  const [stats, setStats] = useState({ totalProperties: 0, totalInquiries: 0, totalViews: 0, activeProperties: 0 });
  const [properties, setProperties] = useState<Property[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
        setProperties(data.properties || []);
        setInquiries(data.inquiries || []);
      }
    } catch {
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this property?')) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/properties/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setProperties((prev) => prev.filter((p) => p.id !== id));
        toast.success('Property deleted');
      } else {
        toast.error('Failed to delete property');
      }
    } catch {
      toast.error('Failed to delete property');
    } finally {
      setDeleting(null);
    }
  };

  const handleEdit = (id: string) => {
    setSelectedPropertyId(id);
    setCurrentView('add-property');
  };

  const statCards = [
    { label: 'Total Properties', value: stats.totalProperties, icon: Building2, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Active Listings', value: stats.activeProperties, icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Total Inquiries', value: stats.totalInquiries, icon: MessageSquare, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Total Views', value: stats.totalViews, icon: Eye, color: 'text-purple-600', bg: 'bg-purple-50' },
  ];

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Dashboard</h1>
          <p className="mt-1 text-muted-foreground">Manage your property listings and inquiries</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            className="bg-red-600 hover:bg-red-700 text-white"
            onClick={() => setCurrentView('add-property')}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Property
          </Button>
          <Button
            variant="outline"
            className="border-red-600 text-red-600 hover:bg-red-50"
            onClick={() => setCurrentView('analytics')}
          >
            <BarChart3 className="mr-2 h-4 w-4" />
            View Analytics
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.bg}`}>
                    <stat.icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Properties List */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Your Properties</h2>
        {properties.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No Listings Yet"
            description="Start by adding your first property to the platform. It only takes a few minutes!"
            actionLabel="Add Property"
            onAction={() => setCurrentView('add-property')}
          />
        ) : (
          <div className="space-y-3">
            {properties.map((property) => (
              <Card key={property.id}>
                <CardContent className="p-4">
                  <div className="flex gap-4">
                    <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg">
                      {property.images?.[0]?.url ? (
                        <Image
                          src={property.images[0].url}
                          alt={property.title}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-muted">
                          <Building2 className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-sm truncate">{property.title}</h3>
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <MapPin className="h-3 w-3" />
                            {property.city}
                          </p>
                        </div>
                        <Badge
                          variant={property.status === 'AVAILABLE' ? 'default' : 'secondary'}
                          className={property.status === 'AVAILABLE' ? 'bg-red-600 shrink-0' : 'shrink-0'}
                        >
                          {property.listingStatus === 'PENDING' ? 'Pending Review' : property.status === 'AVAILABLE' ? 'Active' : property.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>{formatUGX(property.price, property.listingType)}</span>
                        <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {property.views}</span>
                        <span className="flex items-center gap-1"><Heart className="h-3 w-3" /> {property._count?.favorites || 0}</span>
                        <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {property._count?.inquiries || 0}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-3">
                        <Button size="sm" variant="outline" onClick={() => handleEdit(property.id)}>
                          <Edit className="mr-1 h-3 w-3" /> Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => handleDelete(property.id)}
                          disabled={deleting === property.id}
                        >
                          {deleting === property.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="mr-1 h-3 w-3" />
                          )}
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Recent Inquiries */}
      {inquiries.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Recent Inquiries</h2>
          <div className="space-y-3">
            {inquiries.slice(0, 5).map((inquiry) => (
              <Card key={inquiry.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={inquiry.tenant?.avatar || undefined} alt={inquiry.tenant?.name} />
                      <AvatarFallback className="bg-red-100 text-red-700 text-xs">
                        {inquiry.tenant?.name?.charAt(0) || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-sm">{inquiry.tenant?.name}</p>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(inquiry.createdAt), 'MMM d, yyyy')}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Re: {inquiry.property?.title}
                      </p>
                      <p className="text-sm mt-1 line-clamp-2">{inquiry.message}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Button
            variant="outline"
            className="mt-4 w-full"
            onClick={() => setCurrentView('messages')}
          >
            View All Messages
          </Button>
        </div>
      )}
    </div>
  );
}
