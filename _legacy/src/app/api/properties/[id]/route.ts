import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const property = await db.property.findUnique({
      where: { id },
      include: {
        images: { orderBy: { order: 'asc' } },
        amenities: { include: { amenity: true } },
        landlord: { select: { id: true, name: true, avatar: true, verified: true, phone: true, bio: true } },
        _count: { select: { favorites: true, inquiries: true } },
      },
    });

    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }

    // Increment view count
    await db.property.update({
      where: { id },
      data: { views: { increment: 1 } },
    });

    // Check if current user has favorited
    let isFavorited = false;
    const user = await getSession(request);
    if (user) {
      const fav = await db.favorite.findUnique({
        where: { userId_propertyId: { userId: user.id, propertyId: id } },
      });
      isFavorited = !!fav;
    }

    return NextResponse.json({ ...property, isFavorited });
  } catch (error) {
    console.error('Property fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession(request);
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;
    const property = await db.property.findUnique({ where: { id } });
    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }

    if (property.landlordId !== user.id && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const body = await request.json();
    const updated = await db.property.update({
      where: { id },
      data: {
        ...(body.title && { title: body.title }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.price !== undefined && { price: parseFloat(body.price) }),
        ...(body.location && { location: body.location }),
        ...(body.address && { address: body.address }),
        ...(body.city && { city: body.city }),
        ...(body.bedrooms !== undefined && { bedrooms: parseInt(body.bedrooms) }),
        ...(body.bathrooms !== undefined && { bathrooms: parseInt(body.bathrooms) }),
        ...(body.propertyType && { propertyType: body.propertyType }),
        ...(body.area !== undefined && { area: parseFloat(body.area) }),
        ...(body.furnished !== undefined && { furnished: body.furnished }),
        ...(body.parking !== undefined && { parking: body.parking }),
        ...(body.petsAllowed !== undefined && { petsAllowed: body.petsAllowed }),
        ...(body.status && { status: body.status }),
        ...(body.listingStatus && { listingStatus: body.listingStatus }),
        ...(body.featured !== undefined && { featured: body.featured }),
      },
      include: {
        images: { orderBy: { order: 'asc' } },
        amenities: { include: { amenity: true } },
        landlord: { select: { id: true, name: true, avatar: true, verified: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Property update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession(request);
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;
    const property = await db.property.findUnique({ where: { id } });
    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }

    if (property.landlordId !== user.id && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    await db.property.delete({ where: { id } });
    return NextResponse.json({ message: 'Property deleted' });
  } catch (error) {
    console.error('Property delete error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
