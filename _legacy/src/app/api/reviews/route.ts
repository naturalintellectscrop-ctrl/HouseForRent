import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { reviewCreateSchema, validateBody } from '@/lib/validations';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get('propertyId');

    if (!propertyId) {
      return NextResponse.json({ error: 'propertyId is required' }, { status: 400 });
    }

    const reviews = await db.review.findMany({
      where: { propertyId },
      include: {
        user: {
          select: { id: true, name: true, avatar: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const avgRating = reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

    const ratingDistribution = [1, 2, 3, 4, 5].map((star) => ({
      star,
      count: reviews.filter((r) => r.rating === star).length,
    }));

    return NextResponse.json({
      reviews,
      avgRating: Math.round(avgRating * 10) / 10,
      totalReviews: reviews.length,
      ratingDistribution,
    });
  } catch (error) {
    console.error('Error fetching reviews:', error);
    return NextResponse.json({ error: 'Failed to fetch reviews' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = validateBody(reviewCreateSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { propertyId, rating, comment } = validation.data;

    // Check if user already reviewed this property
    const existing = await db.review.findUnique({
      where: { userId_propertyId: { userId: session.id, propertyId } },
    });

    if (existing) {
      return NextResponse.json({ error: 'You have already reviewed this property' }, { status: 400 });
    }

    const review = await db.review.create({
      data: {
        rating,
        comment,
        userId: session.id,
        propertyId,
      },
      include: {
        user: {
          select: { id: true, name: true, avatar: true },
        },
      },
    });

    // Create notification for the landlord
    const property = await db.property.findUnique({
      where: { id: propertyId },
      select: { landlordId: true, title: true },
    });

    if (property && property.landlordId !== session.id) {
      await db.notification.create({
        data: {
          type: 'REVIEW',
          title: 'New Review',
          message: `Someone reviewed your property "${property.title}"`,
          userId: property.landlordId,
          link: propertyId,
        },
      });
    }

    return NextResponse.json(review, { status: 201 });
  } catch (error) {
    console.error('Error creating review:', error);
    return NextResponse.json({ error: 'Failed to create review' }, { status: 500 });
  }
}
