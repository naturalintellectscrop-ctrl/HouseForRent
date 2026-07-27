'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Star, MessageSquare, ThumbsUp, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { useAppStore } from '@/store/useAppStore';
import { toast } from 'sonner';

interface PropertyReviewsProps {
  propertyId: string;
}

interface ReviewUser {
  id: string;
  name: string;
  avatar: string | null;
}

interface Review {
  id: string;
  rating: number;
  comment: string;
  userId: string;
  propertyId: string;
  createdAt: string;
  updatedAt: string;
  user: ReviewUser;
}

interface RatingDistribution {
  star: number;
  count: number;
}

interface ReviewsData {
  reviews: Review[];
  avgRating: number;
  totalReviews: number;
  ratingDistribution: RatingDistribution[];
}

function StarRating({
  rating,
  interactive = false,
  onChange,
  size = 'md',
}: {
  rating: number;
  interactive?: boolean;
  onChange?: (rating: number) => void;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [hovered, setHovered] = useState(0);

  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-7 w-7',
  };

  const displayRating = interactive ? (hovered || rating) : rating;

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={!interactive}
          className={`${
            interactive
              ? 'cursor-pointer transition-transform hover:scale-110'
              : 'cursor-default'
          }`}
          onMouseEnter={() => interactive && setHovered(star)}
          onMouseLeave={() => interactive && setHovered(0)}
          onClick={() => interactive && onChange?.(star)}
        >
          <Star
            className={`${sizeClasses[size]} ${
              star <= displayRating
                ? 'fill-amber-500 text-amber-500'
                : 'fill-muted text-muted-foreground/30'
            } transition-colors`}
          />
        </button>
      ))}
    </div>
  );
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) > 1 ? 's' : ''} ago`;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function PropertyReviews({ propertyId }: PropertyReviewsProps) {
  const { user, setShowAuthModal, setAuthMode } = useAppStore();

  const [data, setData] = useState<ReviewsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [newRating, setNewRating] = useState(0);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchReviews = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/reviews?propertyId=${propertyId}`);
      if (res.ok) {
        const result = await res.json();
        setData(result);
      } else {
        toast.error('Failed to load reviews');
      }
    } catch {
      toast.error('Failed to load reviews');
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const handleSubmit = async () => {
    if (!user) {
      toast.error('Please login to write a review');
      setAuthMode('login');
      setShowAuthModal(true);
      return;
    }

    if (newRating === 0) {
      toast.error('Please select a star rating');
      return;
    }

    if (!newComment.trim()) {
      toast.error('Please write a comment');
      return;
    }

    if (newComment.trim().length < 10) {
      toast.error('Comment must be at least 10 characters');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          rating: newRating,
          comment: newComment.trim(),
        }),
      });

      if (res.ok) {
        toast.success('Review submitted successfully!');
        setNewRating(0);
        setNewComment('');
        fetchReviews();
      } else {
        const result = await res.json();
        toast.error(result.error || 'Failed to submit review');
      }
    } catch {
      toast.error('Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="h-48 animate-pulse rounded-xl bg-muted" />
          <div className="col-span-2 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const reviews = data?.reviews ?? [];
  const avgRating = data?.avgRating ?? 0;
  const totalReviews = data?.totalReviews ?? 0;
  const ratingDistribution = data?.ratingDistribution ?? [];

  const maxDistributionCount = Math.max(
    ...ratingDistribution.map((d) => d.count),
    1
  );

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center gap-2">
        <span className="inline-block h-1.5 w-6 rounded-full bg-red-500" />
        <h2 className="text-xl font-bold">Reviews & Ratings</h2>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column - Rating Summary */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Rating Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Average Rating Display */}
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <p className="text-5xl font-bold text-foreground">
                    {avgRating.toFixed(1)}
                  </p>
                  <div className="mt-1">
                    <StarRating rating={Math.round(avgRating)} size="sm" />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {totalReviews} review{totalReviews !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              <Separator />

              {/* Rating Distribution */}
              <div className="space-y-2.5">
                {[5, 4, 3, 2, 1].map((star) => {
                  const distItem = ratingDistribution.find(
                    (d) => d.star === star
                  );
                  const count = distItem?.count ?? 0;
                  const percentage =
                    totalReviews > 0
                      ? Math.round((count / totalReviews) * 100)
                      : 0;
                  const barValue =
                    maxDistributionCount > 0
                      ? (count / maxDistributionCount) * 100
                      : 0;

                  return (
                    <div key={star} className="flex items-center gap-2">
                      <span className="flex w-8 items-center gap-0.5 text-sm font-medium">
                        {star}
                        <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                      </span>
                      <Progress
                        value={barValue}
                        className="h-2 flex-1 [&>[data-slot=indicator]]:bg-red-500"
                      />
                      <span className="w-12 text-right text-xs text-muted-foreground">
                        {count} ({percentage}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Write Review Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="h-4 w-4 text-red-600" />
                Write a Review
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {user ? (
                <>
                  {/* Star Rating Selector */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Your Rating</label>
                    <div className="flex items-center gap-2">
                      <StarRating
                        rating={newRating}
                        interactive
                        onChange={setNewRating}
                        size="lg"
                      />
                      {newRating > 0 && (
                        <Badge
                          variant="secondary"
                          className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                        >
                          {newRating}/5
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Comment Textarea */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Your Review</label>
                    <Textarea
                      placeholder="Share your experience with this property..."
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      className="min-h-[100px] resize-none"
                      maxLength={500}
                    />
                    <p className="text-xs text-muted-foreground text-right">
                      {newComment.length}/500
                    </p>
                  </div>

                  {/* Submit Button */}
                  <Button
                    className="w-full bg-red-600 hover:bg-red-700 text-white"
                    onClick={handleSubmit}
                    disabled={
                      submitting || newRating === 0 || !newComment.trim()
                    }
                  >
                    {submitting ? (
                      <>
                        <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <MessageSquare className="mr-2 h-4 w-4" />
                        Submit Review
                      </>
                    )}
                  </Button>
                </>
              ) : (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 dark:bg-red-900/30">
                    <User className="h-6 w-6 text-red-600" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Please login to write a review
                  </p>
                  <Button
                    className="bg-red-600 hover:bg-red-700 text-white"
                    onClick={() => {
                      setAuthMode('login');
                      setShowAuthModal(true);
                    }}
                  >
                    Login to Review
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Reviews List */}
        <div className="lg:col-span-2">
          {reviews.length === 0 ? (
            /* Empty State */
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                  className="flex flex-col items-center gap-4"
                >
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-50 dark:bg-red-900/20">
                    <MessageSquare className="h-10 w-10 text-red-400" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold">No Reviews Yet</h3>
                    <p className="max-w-sm text-sm text-muted-foreground">
                      Be the first to share your experience with this property.
                      Your review helps others make informed decisions!
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className="h-6 w-6 text-muted-foreground/20"
                      />
                    ))}
                  </div>
                  {user && (
                    <Button
                      className="mt-2 bg-red-600 hover:bg-red-700 text-white"
                      onClick={() =>
                        document
                          .getElementById('review-textarea')
                          ?.focus()
                      }
                    >
                      Write the First Review
                    </Button>
                  )}
                </motion.div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1 custom-scrollbar">
              {reviews.map((review, index) => (
                <motion.div
                  key={review.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.3,
                    delay: index * 0.05,
                    ease: 'easeOut',
                  }}
                >
                  <Card className="transition-shadow hover:shadow-md">
                    <CardContent className="p-4 sm:p-6">
                      <div className="flex items-start gap-3">
                        {/* Avatar */}
                        <Avatar className="h-10 w-10 shrink-0">
                          <AvatarImage
                            src={review.user.avatar || undefined}
                            alt={review.user.name}
                          />
                          <AvatarFallback className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">
                            {review.user.name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>

                        <div className="flex-1 min-w-0">
                          {/* Name, Rating, Date Row */}
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="font-semibold text-sm">
                              {review.user.name}
                            </span>
                            <StarRating rating={review.rating} size="sm" />
                            <span className="text-xs text-muted-foreground">
                              {formatDate(review.createdAt)}
                            </span>
                          </div>

                          {/* Rating Badge */}
                          <div className="mt-1.5">
                            <Badge
                              variant="secondary"
                              className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                            >
                              <Star className="mr-1 h-3 w-3 fill-amber-500 text-amber-500" />
                              {review.rating}.0
                            </Badge>
                          </div>

                          {/* Comment */}
                          <p className="mt-3 text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                            {review.comment}
                          </p>

                          {/* Helpful Indicator */}
                          <div className="mt-3 flex items-center gap-3">
                            <button
                              type="button"
                              className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-red-600"
                              onClick={() =>
                                toast.success('Thanks for your feedback!')
                              }
                            >
                              <ThumbsUp className="h-3.5 w-3.5" />
                              Helpful
                            </button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
