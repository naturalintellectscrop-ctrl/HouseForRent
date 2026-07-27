'use client';

import { useEffect, useState } from 'react';
import {
  User as UserIcon,
  Mail,
  Phone,
  MapPin,
  Calendar,
  ShieldCheck,
  Building2,
  Heart,
  MessageSquare,
  Star,
  Edit3,
  Save,
  Loader2,
  ArrowLeft,
  Home,
  CheckCircle2,
  AlertCircle,
  ImageIcon,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import EmptyState from './EmptyState';
import { useAppStore, type User } from '@/store/useAppStore';
import { toast } from 'sonner';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ProfileStats {
  properties: number;
  favorites: number;
  sentInquiries: number;
  reviews: number;
}

interface RecentPropertySnippet {
  id: string;
  title: string;
  city: string;
  price: number;
  images?: { url: string; isPrimary: boolean; order: number }[];
}

interface RecentInquiry {
  id: string;
  message: string;
  status: string;
  createdAt: string;
  property: RecentPropertySnippet;
}

interface RecentFavorite {
  id: string;
  createdAt: string;
  property: RecentPropertySnippet;
}

interface RecentReview {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
  property: { id: string; title: string; city: string };
}

interface ProfileData extends User {
  createdAt: string;
  _count: ProfileStats;
  recentInquiries: RecentInquiry[];
  recentFavorites: RecentFavorite[];
  recentReviews: RecentReview[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatUGX(amount: number) {
  return new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency: 'UGX',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-UG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(dateStr);
}

/* ------------------------------------------------------------------ */
/*  Animation variants                                                 */
/* ------------------------------------------------------------------ */

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.07 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function UserProfile() {
  const { user, setUser, setCurrentView, setShowAuthModal, setAuthMode } = useAppStore();

  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit form state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [saving, setSaving] = useState(false);

  /* ---- Fetch profile ---- */
  const fetchProfile = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch('/api/users/profile');
      if (res.ok) {
        const data: ProfileData = await res.json();
        setProfileData(data);
        setEditName(data.name);
        setEditPhone(data.phone ?? '');
        setEditBio(data.bio ?? '');
        setEditAvatar(data.avatar ?? '');
      } else {
        toast.error('Failed to load profile');
      }
    } catch {
      toast.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [user]);

  /* ---- Save profile ---- */
  const handleSave = async () => {
    if (!editName.trim()) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          phone: editPhone.trim() || null,
          bio: editBio.trim() || null,
          avatar: editAvatar.trim() || null,
        }),
      });
      if (res.ok) {
        const updated: User = await res.json();
        setUser(updated);
        setProfileData((prev) =>
          prev ? { ...prev, ...updated } : prev
        );
        setIsEditing(false);
        toast.success('Profile updated successfully');
        // Refresh full profile data
        fetchProfile();
      } else {
        toast.error('Failed to update profile');
      }
    } catch {
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  /* ---- Not logged in ---- */
  if (!user) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <EmptyState
          icon={UserIcon}
          title="Login to View Your Profile"
          description="Sign in to manage your profile, view activity, and track your rental journey."
          actionLabel="Login"
          onAction={() => {
            setAuthMode('login');
            setShowAuthModal(true);
          }}
        />
      </div>
    );
  }

  /* ---- Loading skeleton ---- */
  if (loading || !profileData) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Banner skeleton */}
        <div className="h-44 sm:h-52 w-full animate-pulse rounded-2xl bg-muted" />
        <div className="flex flex-col sm:flex-row gap-6 -mt-14 px-4">
          <div className="h-28 w-28 shrink-0 animate-pulse rounded-full bg-muted border-4 border-background" />
          <div className="pt-14 sm:pt-16 space-y-3">
            <div className="h-7 w-48 animate-pulse rounded bg-muted" />
            <div className="h-5 w-28 animate-pulse rounded bg-muted" />
          </div>
        </div>
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-2 h-72 animate-pulse rounded-xl bg-muted" />
          <div className="lg:col-span-3 h-72 animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
    );
  }

  const stats = profileData._count;

  /* ---- Stat card items ---- */
  const statCards = [
    {
      label: 'Properties Listed',
      value: stats.properties,
      icon: Building2,
      color: 'text-red-600',
      bg: 'bg-red-50 dark:bg-red-950/40',
      show: user.role === 'LANDLORD' || user.role === 'ADMIN',
    },
    {
      label: 'Favorites',
      value: stats.favorites,
      icon: Heart,
      color: 'text-rose-500',
      bg: 'bg-rose-50 dark:bg-rose-950/40',
      show: true,
    },
    {
      label: 'Inquiries',
      value: stats.sentInquiries,
      icon: MessageSquare,
      color: 'text-blue-500',
      bg: 'bg-blue-50 dark:bg-blue-950/40',
      show: true,
    },
    {
      label: 'Reviews Written',
      value: stats.reviews,
      icon: Star,
      color: 'text-amber-500',
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      show: true,
    },
  ];

  /* ---- Render ---- */
  return (
    <motion.div
      className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Back button */}
      <motion.div variants={itemVariants} className="mb-4">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={() => setCurrentView('home')}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </motion.div>

      {/* ============================================================ */}
      {/*  Profile Header Banner                                        */}
      {/* ============================================================ */}
      <motion.div variants={itemVariants} className="relative">
        <div className="relative h-44 sm:h-52 w-full overflow-hidden rounded-2xl">
          {/* Gradient banner */}
          <div className="absolute inset-0 bg-gradient-to-br from-red-600 via-red-500 to-cyan-500" />
          {/* Pattern overlay */}
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage:
                'radial-gradient(circle at 25% 25%, white 1px, transparent 1px), radial-gradient(circle at 75% 75%, white 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />
          {/* Decorative circles */}
          <div className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-white/10" />
          <div className="absolute -bottom-8 -left-8 h-36 w-36 rounded-full bg-white/10" />
        </div>

        {/* Avatar & info */}
        <div className="relative flex flex-col sm:flex-row items-center sm:items-end gap-4 px-4 -mt-14 sm:-mt-16">
          <div className="relative group">
            <Avatar className="h-28 w-28 border-4 border-background shadow-lg">
              <AvatarImage
                src={isEditing ? editAvatar || undefined : profileData.avatar || undefined}
                alt={profileData.name}
              />
              <AvatarFallback className="bg-red-100 text-red-700 text-3xl font-bold">
                {profileData.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {isEditing && (
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                <Edit3 className="h-5 w-5 text-white" />
              </div>
            )}
          </div>

          <div className="flex-1 text-center sm:text-left pb-1">
            <h1 className="text-2xl font-bold">{profileData.name}</h1>
            <div className="mt-1 flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <Badge
                variant="outline"
                className="border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950/50 dark:text-red-400"
              >
                {profileData.role === 'LANDLORD'
                  ? '🏠 Landlord'
                  : profileData.role === 'ADMIN'
                    ? '🛡️ Admin'
                    : '🏠 Tenant'}
              </Badge>
              {profileData.verified ? (
                <Badge className="gap-1 bg-red-600 text-white hover:bg-red-700">
                  <ShieldCheck className="h-3 w-3" />
                  Verified
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 text-amber-600 border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                  <AlertCircle className="h-3 w-3" />
                  Unverified
                </Badge>
              )}
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Member since {formatDate(profileData.createdAt)}
              </span>
            </div>
          </div>

          <div className="pb-1">
            {!isEditing ? (
              <Button
                variant="outline"
                className="gap-1.5"
                onClick={() => setIsEditing(true)}
              >
                <Edit3 className="h-4 w-4" />
                Edit Profile
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsEditing(false);
                    setEditName(profileData.name);
                    setEditPhone(profileData.phone ?? '');
                    setEditBio(profileData.bio ?? '');
                    setEditAvatar(profileData.avatar ?? '');
                  }}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button
                  className="gap-1.5 bg-red-600 hover:bg-red-700 text-white"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save
                </Button>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* ============================================================ */}
      {/*  Stats Cards                                                   */}
      {/* ============================================================ */}
      <motion.div
        variants={itemVariants}
        className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4"
      >
        {statCards
          .filter((s) => s.show)
          .map((stat) => (
            <Card key={stat.label} className="overflow-hidden">
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
          ))}
      </motion.div>

      {/* ============================================================ */}
      {/*  Main content: Edit Form / Account Info + Activity             */}
      {/* ============================================================ */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ---- Left Column: Edit Form + Account Info ---- */}
        <motion.div variants={itemVariants} className="lg:col-span-2 space-y-6">
          {/* Edit Profile Form */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Edit3 className="h-5 w-5 text-red-600" />
                {isEditing ? 'Edit Profile' : 'Profile Details'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                {isEditing ? (
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Your full name"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <UserIcon className="h-4 w-4" />
                    {profileData.name}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Phone</label>
                {isEditing ? (
                  <Input
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="+256 7XX XXX XXX"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    {profileData.phone || 'Not provided'}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Bio</label>
                {isEditing ? (
                  <Textarea
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                    placeholder="Tell us about yourself..."
                    rows={3}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {profileData.bio || 'No bio provided'}
                  </p>
                )}
              </div>

              {isEditing && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Avatar URL</label>
                  <Input
                    value={editAvatar}
                    onChange={(e) => setEditAvatar(e.target.value)}
                    placeholder="https://example.com/avatar.jpg"
                  />
                  <p className="text-xs text-muted-foreground">
                    Paste a direct link to an image for your profile picture.
                  </p>
                </div>
              )}

              {!isEditing && (
                <Button
                  variant="outline"
                  className="w-full gap-1.5 mt-2"
                  onClick={() => setIsEditing(true)}
                >
                  <Edit3 className="h-4 w-4" />
                  Edit Profile
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Account Information */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldCheck className="h-5 w-5 text-red-600" />
                Account Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email
                </span>
                <span className="text-sm font-medium">{profileData.email}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <UserIcon className="h-4 w-4" />
                  Role
                </span>
                <Badge variant="secondary">{profileData.role}</Badge>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" />
                  Verification
                </span>
                {profileData.verified ? (
                  <Badge className="gap-1 bg-red-600 text-white">
                    <CheckCircle2 className="h-3 w-3" />
                    Verified
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 text-amber-600">
                    <AlertCircle className="h-3 w-3" />
                    Unverified
                  </Badge>
                )}
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Member Since
                </span>
                <span className="text-sm font-medium">{formatDate(profileData.createdAt)}</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* ---- Right Column: Activity Section ---- */}
        <motion.div variants={itemVariants} className="lg:col-span-3">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <MessageSquare className="h-5 w-5 text-red-600" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="inquiries" className="w-full">
                <TabsList className="w-full grid grid-cols-3">
                  <TabsTrigger value="inquiries" className="gap-1.5 text-xs sm:text-sm">
                    <MessageSquare className="h-3.5 w-3.5 hidden sm:block" />
                    Inquiries
                  </TabsTrigger>
                  <TabsTrigger value="favorites" className="gap-1.5 text-xs sm:text-sm">
                    <Heart className="h-3.5 w-3.5 hidden sm:block" />
                    Favorites
                  </TabsTrigger>
                  <TabsTrigger value="reviews" className="gap-1.5 text-xs sm:text-sm">
                    <Star className="h-3.5 w-3.5 hidden sm:block" />
                    Reviews
                  </TabsTrigger>
                </TabsList>

                {/* ---- Recent Inquiries ---- */}
                <TabsContent value="inquiries" className="mt-4">
                  {profileData.recentInquiries.length === 0 ? (
                    <EmptyState
                      icon={MessageSquare}
                      title="No Inquiries Yet"
                      description="Your property inquiries will appear here once you start reaching out to landlords."
                      actionLabel="Browse Properties"
                      onAction={() => setCurrentView('home')}
                    />
                  ) : (
                    <div className="space-y-3 max-h-96 overflow-y-auto pr-1 custom-scroll">
                      {profileData.recentInquiries.map((inquiry) => (
                        <div
                          key={inquiry.id}
                          className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50 cursor-pointer"
                          onClick={() => {
                            setCurrentView('messages');
                          }}
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/40">
                            <MessageSquare className="h-4 w-4 text-blue-500" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">
                              {inquiry.property.title}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                              {inquiry.message}
                            </p>
                            <div className="mt-1.5 flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${
                                  inquiry.status === 'PENDING'
                                    ? 'border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400'
                                    : inquiry.status === 'REPLIED'
                                      ? 'border-red-300 text-red-600 dark:border-red-700 dark:text-red-400'
                                      : 'border-muted-foreground/30 text-muted-foreground'
                                }`}
                              >
                                {inquiry.status}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                {relativeTime(inquiry.createdAt)}
                              </span>
                            </div>
                          </div>
                          <p className="text-sm font-semibold text-red-600 whitespace-nowrap">
                            {formatUGX(inquiry.property.price)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* ---- Recent Favorites ---- */}
                <TabsContent value="favorites" className="mt-4">
                  {profileData.recentFavorites.length === 0 ? (
                    <EmptyState
                      icon={Heart}
                      title="No Favorites Yet"
                      description="Properties you save will appear here. Click the heart icon on any property to add it."
                      actionLabel="Browse Properties"
                      onAction={() => setCurrentView('home')}
                    />
                  ) : (
                    <div className="space-y-3 max-h-96 overflow-y-auto pr-1 custom-scroll">
                      {profileData.recentFavorites.map((fav) => {
                        const img = fav.property.images?.[0]?.url;
                        return (
                          <div
                            key={fav.id}
                            className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50 cursor-pointer"
                            onClick={() => {
                              setCurrentView('favorites');
                            }}
                          >
                            {img ? (
                              <div className="relative h-10 w-14 shrink-0 overflow-hidden rounded-md">
                                <img
                                  src={img}
                                  alt={fav.property.title}
                                  className="h-full w-full object-cover"
                                />
                              </div>
                            ) : (
                              <div className="flex h-10 w-14 shrink-0 items-center justify-center rounded-md bg-muted">
                                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">
                                {fav.property.title}
                              </p>
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {fav.property.city}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-semibold text-red-600">
                                {formatUGX(fav.property.price)}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {relativeTime(fav.createdAt)}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>

                {/* ---- Recent Reviews ---- */}
                <TabsContent value="reviews" className="mt-4">
                  {profileData.recentReviews.length === 0 ? (
                    <EmptyState
                      icon={Star}
                      title="No Reviews Yet"
                      description="Your property reviews will appear here after you submit them."
                      actionLabel="Browse Properties"
                      onAction={() => setCurrentView('home')}
                    />
                  ) : (
                    <div className="space-y-3 max-h-96 overflow-y-auto pr-1 custom-scroll">
                      {profileData.recentReviews.map((review) => (
                        <div
                          key={review.id}
                          className="rounded-lg border p-3 transition-colors hover:bg-muted/50"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium truncate">
                              {review.property.title}
                            </p>
                            <div className="flex items-center gap-0.5 shrink-0">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <Star
                                  key={i}
                                  className={`h-3.5 w-3.5 ${
                                    i < review.rating
                                      ? 'fill-amber-400 text-amber-400'
                                      : 'text-muted-foreground/30'
                                  }`}
                                />
                              ))}
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {review.comment}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {review.property.city} · {relativeTime(review.createdAt)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Note: EmptyState sub-component has been replaced by the reusable   */
/*  EmptyState component at /src/components/house-for-rent/EmptyState   */
/* ------------------------------------------------------------------ */
