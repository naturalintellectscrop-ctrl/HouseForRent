import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const user = await getSession(request);
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (user.role === 'LANDLORD') {
      // Get landlord's properties
      const properties = await db.property.findMany({
        where: { landlordId: user.id },
        include: {
          images: { orderBy: { order: 'asc' } },
          _count: { select: { favorites: true, inquiries: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      const inquiries = await db.inquiry.findMany({
        where: { property: { landlordId: user.id } },
        include: {
          tenant: { select: { id: true, name: true, avatar: true } },
          property: { select: { id: true, title: true } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
        orderBy: { updatedAt: 'desc' },
      });

      return NextResponse.json({
        user,
        properties,
        inquiries,
        stats: {
          totalProperties: properties.length,
          totalInquiries: inquiries.length,
          totalViews: properties.reduce((sum, p) => sum + p.views, 0),
          activeProperties: properties.filter(p => p.status === 'AVAILABLE').length,
        },
      });
    }

    // Tenant
    const favorites = await db.favorite.findMany({
      where: { userId: user.id },
      include: {
        property: {
          include: {
            images: { orderBy: { order: 'asc' }, take: 1 },
            landlord: { select: { name: true, verified: true } },
          },
        },
      },
    });

    const inquiries = await db.inquiry.findMany({
      where: { tenantId: user.id },
      include: {
        property: {
          include: {
            images: { orderBy: { order: 'asc' }, take: 1 },
          },
        },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({
      user,
      favorites,
      inquiries,
      stats: {
        totalFavorites: favorites.length,
        totalInquiries: inquiries.length,
      },
    });
  } catch (error) {
    console.error('User data fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
