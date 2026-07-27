import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { profileUpdateSchema, validateBody } from '@/lib/validations';

export async function PUT(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = validateBody(profileUpdateSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { name, phone, bio, avatar } = validation.data;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (bio !== undefined) updateData.bio = bio;
    if (avatar !== undefined) updateData.avatar = avatar;

    const user = await db.user.update({
      where: { id: session.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatar: true,
        phone: true,
        bio: true,
        verified: true,
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { id: session.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatar: true,
        phone: true,
        bio: true,
        verified: true,
        createdAt: true,
        _count: {
          select: {
            properties: true,
            favorites: true,
            sentInquiries: true,
            reviews: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Fetch recent activity data
    const [recentInquiries, recentFavorites, recentReviews] = await Promise.all([
      db.inquiry.findMany({
        where: { tenantId: session.id },
        include: {
          property: {
            select: {
              id: true,
              title: true,
              city: true,
              price: true,
              images: { orderBy: { order: 'asc' }, take: 1 },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      db.favorite.findMany({
        where: { userId: session.id },
        include: {
          property: {
            select: {
              id: true,
              title: true,
              city: true,
              price: true,
              images: { orderBy: { order: 'asc' }, take: 1 },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      db.review.findMany({
        where: { userId: session.id },
        include: {
          property: {
            select: {
              id: true,
              title: true,
              city: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    return NextResponse.json({
      ...user,
      recentInquiries,
      recentFavorites,
      recentReviews,
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}
