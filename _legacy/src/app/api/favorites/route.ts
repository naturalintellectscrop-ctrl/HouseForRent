import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const user = await getSession(request);
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const favorites = await db.favorite.findMany({
      where: { userId: user.id },
      include: {
        property: {
          include: {
            images: { orderBy: { order: 'asc' } },
            landlord: { select: { id: true, name: true, avatar: true, verified: true } },
            _count: { select: { favorites: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(favorites);
  } catch (error) {
    console.error('Favorites fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession(request);
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { propertyId } = await request.json();
    if (!propertyId) {
      return NextResponse.json({ error: 'Property ID is required' }, { status: 400 });
    }

    const existing = await db.favorite.findUnique({
      where: { userId_propertyId: { userId: user.id, propertyId } },
    });

    if (existing) {
      // Remove favorite
      await db.favorite.delete({ where: { id: existing.id } });
      return NextResponse.json({ favorited: false });
    } else {
      // Add favorite
      await db.favorite.create({
        data: { userId: user.id, propertyId },
      });
      return NextResponse.json({ favorited: true }, { status: 201 });
    }
  } catch (error) {
    console.error('Favorite toggle error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
