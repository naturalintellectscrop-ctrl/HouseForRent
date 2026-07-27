import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const user = await getSession(request);
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const [
      totalUsers,
      totalProperties,
      totalInquiries,
      pendingProperties,
      availableProperties,
      rentedProperties,
      totalFavorites,
      usersByRole,
    ] = await Promise.all([
      db.user.count(),
      db.property.count({ where: { listingStatus: 'APPROVED' } }),
      db.inquiry.count(),
      db.property.count({ where: { listingStatus: 'PENDING' } }),
      db.property.count({ where: { status: 'AVAILABLE', listingStatus: 'APPROVED' } }),
      db.property.count({ where: { status: 'RENTED' } }),
      db.favorite.count(),
      db.user.groupBy({ by: ['role'], _count: { role: true } }),
    ]);

    // Get recent properties
    const recentProperties = await db.property.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        images: { orderBy: { order: 'asc' }, take: 1 },
        landlord: { select: { name: true } },
      },
    });

    // Get recent users
    const recentUsers = await db.user.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, email: true, role: true, createdAt: true, verified: true },
    });

    return NextResponse.json({
      stats: {
        totalUsers,
        totalProperties,
        totalInquiries,
        pendingProperties,
        availableProperties,
        rentedProperties,
        totalFavorites,
        usersByRole,
      },
      recentProperties,
      recentUsers,
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getSession(request);
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const body = await request.json();
    const { action, targetId, targetType } = body;

    if (action === 'APPROVE_PROPERTY' && targetType === 'property') {
      await db.property.update({
        where: { id: targetId },
        data: { listingStatus: 'APPROVED' },
      });
      return NextResponse.json({ message: 'Property approved' });
    }

    if (action === 'REJECT_PROPERTY' && targetType === 'property') {
      await db.property.update({
        where: { id: targetId },
        data: { listingStatus: 'REJECTED' },
      });
      return NextResponse.json({ message: 'Property rejected' });
    }

    if (action === 'VERIFY_USER' && targetType === 'user') {
      await db.user.update({
        where: { id: targetId },
        data: { verified: true },
      });
      return NextResponse.json({ message: 'User verified' });
    }

    if (action === 'FEATURE_PROPERTY' && targetType === 'property') {
      await db.property.update({
        where: { id: targetId },
        data: { featured: true },
      });
      return NextResponse.json({ message: 'Property featured' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Admin action error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
