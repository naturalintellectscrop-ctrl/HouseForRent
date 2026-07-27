'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { format } from 'date-fns';
import {
  Users, Building2, MessageSquare, Eye, Heart, CheckCircle2,
  XCircle, Star, Shield, TrendingUp, Loader2, BarChart3,
  AlertTriangle, CircleDollarSign, LandPlot, FileCheck
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppStore } from '@/store/useAppStore';
import { toast } from 'sonner';

interface AdminStats {
  totalUsers: number;
  totalProperties: number;
  totalInquiries: number;
  pendingProperties: number;
  availableProperties: number;
  rentedProperties: number;
  totalFavorites: number;
  usersByRole: { role: string; _count: { role: number } }[];
}

const landTitleLabels: Record<string, string> = {
  READY_TITLE: 'Ready Title',
  AGREEMENT: 'Agreement',
  MILE_LAND: 'Mailo Land',
  CROWN_LAND: 'Crown Land',
};

const paymentStatusConfig: Record<string, { label: string; color: string; icon: typeof CircleDollarSign }> = {
  UNPAID: { label: 'Not Paid', color: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700', icon: AlertTriangle },
  PENDING_VERIFICATION: { label: 'Payment Verifying', color: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700', icon: CircleDollarSign },
  PAID: { label: 'Paid', color: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-700', icon: CheckCircle2 },
};

export default function AdminDashboard() {
  const { user, setCurrentView } = useAppStore();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [recentProperties, setRecentProperties] = useState<any[]>([]);
  const [recentUsers, setRecentUsers] = useState<any[]>([]);
  const [pendingProperties, setPendingProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [verifyLoading, setVerifyLoading] = useState<string | null>(null);

  const fetchData = async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const [statsRes, pendingRes] = await Promise.all([
        fetch('/api/admin'),
        fetch('/api/admin/properties?status=PENDING'),
      ]);

      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data.stats);
        setRecentProperties(data.recentProperties);
        setRecentUsers(data.recentUsers);
      }

      if (pendingRes.ok) {
        const data = await pendingRes.json();
        setPendingProperties(data);
        // Keep stats.pendingProperties in sync with actual pending list
        if (statsRes.ok) {
          setStats((prev) => prev ? { ...prev, pendingProperties: data.length } : prev);
        }
      }
    } catch {
      toast.error('Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'ADMIN') fetchData();
  }, [user]);

  const handleAction = async (action: string, targetId: string, targetType: string) => {
    setActionLoading(targetId);
    try {
      const res = await fetch('/api/admin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, targetId, targetType }),
      });
      if (res.ok) {
        toast.success('Action completed successfully');
        fetchData(true);
      } else {
        toast.error('Failed to perform action');
      }
    } catch {
      toast.error('Failed to perform action');
    } finally {
      setActionLoading(null);
    }
  };

  const handleVerifyPayment = async (propertyId: string) => {
    setVerifyLoading(propertyId);
    try {
      const res = await fetch('/api/admin/verify-payment', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId, paymentStatus: 'PAID' }),
      });
      if (res.ok) {
        toast.success('Payment verified successfully');
        fetchData(true);
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to verify payment');
      }
    } catch {
      toast.error('Failed to verify payment');
    } finally {
      setVerifyLoading(null);
    }
  };

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

  const statCards = [
    { label: 'Total Users', value: stats?.totalUsers || 0, icon: Users, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Total Properties', value: stats?.totalProperties || 0, icon: Building2, color: 'text-cyan-600', bg: 'bg-cyan-50' },
    { label: 'Pending Approval', value: stats?.pendingProperties || 0, icon: Eye, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Total Inquiries', value: stats?.totalInquiries || 0, icon: MessageSquare, color: 'text-green-600', bg: 'bg-green-50' },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl flex items-center gap-2">
            <Shield className="h-7 w-7 text-red-600" />
            Admin Dashboard
          </h1>
          <p className="mt-1 text-muted-foreground">Manage the platform, approve properties, and monitor activity</p>
        </div>
        <Button
          variant="outline"
          className="border-red-600 text-red-600 hover:bg-red-50"
          onClick={() => setCurrentView('analytics')}
        >
          <BarChart3 className="mr-2 h-4 w-4" />
          View Analytics
        </Button>
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

      {/* Additional Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-600">{stats?.availableProperties || 0}</p>
            <p className="text-xs text-muted-foreground">Available Properties</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-cyan-600">{stats?.rentedProperties || 0}</p>
            <p className="text-xs text-muted-foreground">Rented Properties</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{stats?.totalFavorites || 0}</p>
            <p className="text-xs text-muted-foreground">Total Favorites</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for different sections */}
      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending">
            Pending Approval
            {pendingProperties.length > 0 && (
              <Badge className="ml-2 bg-amber-500 text-white text-[10px]">{pendingProperties.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="properties">Recent Properties</TabsTrigger>
          <TabsTrigger value="users">Recent Users</TabsTrigger>
        </TabsList>

        {/* Pending Properties */}
        <TabsContent value="pending">
          {pendingProperties.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <CheckCircle2 className="h-12 w-12 text-red-400" />
                <p className="mt-4 text-muted-foreground">All properties have been reviewed!</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {pendingProperties.map((property) => {
                const paymentConfig = paymentStatusConfig[property.paymentStatus] || paymentStatusConfig.UNPAID;
                const isUnpaid = property.paymentStatus === 'UNPAID';
                const isPendingVerification = property.paymentStatus === 'PENDING_VERIFICATION';
                const canApprove = !isUnpaid;
                const PaymentIcon = paymentConfig.icon;

                return (
                  <Card key={property.id}>
                    <CardContent className="p-4">
                      <div className="flex gap-4">
                        <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-muted">
                          {property.images?.[0]?.url ? (
                            <Image
                              src={property.images[0].url}
                              alt={property.title}
                              fill
                              className="object-cover"
                              unoptimized
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <Building2 className="h-6 w-6 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h3 className="font-semibold text-sm">{property.title}</h3>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                By {property.landlord?.name} &bull; {property.city}
                              </p>
                              <p className="text-sm font-medium text-red-600 mt-1">
                                UGX {property.price?.toLocaleString()}
                                {property.listingType === 'RENT' && '/mo'}
                                {property.listingType === 'BOTH' && '/mo'}
                              </p>
                            </div>
                            {/* Payment Status Badge */}
                            <Badge
                              variant="outline"
                              className={`shrink-0 text-[10px] px-2 py-0.5 border ${paymentConfig.color}`}
                            >
                              <PaymentIcon className="h-3 w-3 mr-1" />
                              {paymentConfig.label}
                            </Badge>
                          </div>

                          {/* Land Title Type */}
                          {property.landTitleType && (
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <LandPlot className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
                              <span className="text-xs text-muted-foreground">
                                Land Title: <span className="font-medium text-cyan-700 dark:text-cyan-300">{landTitleLabels[property.landTitleType] || property.landTitleType}</span>
                              </span>
                            </div>
                          )}

                          {/* Unpaid Notice */}
                          {isUnpaid && (
                            <div className="mt-2 flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/50">
                              <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                              <span className="text-xs text-red-600 dark:text-red-400">
                                Landlord has not yet paid the listing fee
                              </span>
                            </div>
                          )}

                          <div className="flex gap-2 mt-3">
                            <Button
                              size="sm"
                              className="bg-red-600 hover:bg-red-700 text-white"
                              onClick={() => handleAction('APPROVE_PROPERTY', property.id, 'property')}
                              disabled={actionLoading === property.id || !canApprove}
                              title={!canApprove ? 'Cannot approve unpaid properties' : 'Approve this property'}
                            >
                              {actionLoading === property.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="mr-1 h-3 w-3" />}
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleAction('REJECT_PROPERTY', property.id, 'property')}
                              disabled={actionLoading === property.id}
                            >
                              <XCircle className="mr-1 h-3 w-3" />
                              Reject
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAction('FEATURE_PROPERTY', property.id, 'property')}
                              disabled={actionLoading === property.id}
                            >
                              <Star className="mr-1 h-3 w-3" />
                              Feature
                            </Button>
                            {/* Verify Payment Button */}
                            {isPendingVerification && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-green-600 text-green-600 hover:bg-green-50 dark:hover:bg-green-950/30"
                                onClick={() => handleVerifyPayment(property.id)}
                                disabled={verifyLoading === property.id}
                              >
                                {verifyLoading === property.id ? (
                                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                ) : (
                                  <FileCheck className="mr-1 h-3 w-3" />
                                )}
                                Verify Payment
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Recent Properties */}
        <TabsContent value="properties">
          <div className="space-y-3">
            {recentProperties.map((property) => (
              <Card key={property.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                      {property.images?.[0]?.url ? (
                        <Image
                          src={property.images[0].url}
                          alt={property.title}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Building2 className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-sm truncate">{property.title}</h3>
                        <Badge variant="outline" className="text-[10px] shrink-0">{property.listingStatus}</Badge>
                        {property.featured && <Star className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        By {property.landlord?.name} &bull; {format(new Date(property.createdAt), 'MMM d, yyyy')}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAction('FEATURE_PROPERTY', property.id, 'property')}
                      >
                        <Star className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Recent Users */}
        <TabsContent value="users">
          <div className="space-y-3">
            {recentUsers.map((u) => (
              <Card key={u.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-red-100 text-red-700 text-sm">
                        {u.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{u.name}</p>
                        <Badge variant="outline" className="text-[10px]">{u.role}</Badge>
                        {u.verified && <CheckCircle2 className="h-3.5 w-3.5 text-red-500" />}
                      </div>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Joined {format(new Date(u.createdAt), 'MMM d, yyyy')}
                      </p>
                    </div>
                    {!u.verified && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 hover:bg-red-50 shrink-0"
                        onClick={() => handleAction('VERIFY_USER', u.id, 'user')}
                        disabled={actionLoading === u.id}
                      >
                        {actionLoading === u.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="mr-1 h-3 w-3" />}
                        Verify
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
