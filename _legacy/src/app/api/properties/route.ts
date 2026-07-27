import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { propertyCreateSchema, validateBody } from '@/lib/validations';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const city = searchParams.get('city');
    const propertyType = searchParams.get('propertyType');
    const minPrice = searchParams.get('minPrice');
    const maxPrice = searchParams.get('maxPrice');
    const bedrooms = searchParams.get('bedrooms');
    const minArea = searchParams.get('minArea');
    const maxArea = searchParams.get('maxArea');
    const furnished = searchParams.get('furnished');
    const parking = searchParams.get('parking');
    const petsAllowed = searchParams.get('petsAllowed');
    const search = searchParams.get('search');
    const listingType = searchParams.get('listingType');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '12');
    const sort = searchParams.get('sort') || 'newest';
    const featured = searchParams.get('featured');

    const where: Record<string, unknown> = {
      listingStatus: 'APPROVED',
      status: 'AVAILABLE',
    };

    if (city) where.city = { contains: city };
    if (propertyType) where.propertyType = propertyType;
    if (listingType) where.listingType = listingType;
    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) (where.price as Record<string, unknown>).gte = parseFloat(minPrice);
      if (maxPrice) (where.price as Record<string, unknown>).lte = parseFloat(maxPrice);
    }
    if (bedrooms) {
      const bed = parseInt(bedrooms);
      if (bed >= 5) {
        where.bedrooms = { gte: 5 };
      } else {
        where.bedrooms = bed;
      }
    }
    if (minArea || maxArea) {
      where.area = {};
      if (minArea) (where.area as Record<string, unknown>).gte = parseFloat(minArea);
      if (maxArea) (where.area as Record<string, unknown>).lte = parseFloat(maxArea);
    }
    if (furnished === 'true') where.furnished = true;
    if (parking === 'true') where.parking = true;
    if (petsAllowed === 'true') where.petsAllowed = true;
    if (featured === 'true') where.featured = true;
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
        { address: { contains: search } },
        { city: { contains: search } },
      ];
    }

    let orderBy: Record<string, string> = { createdAt: 'desc' };
    if (sort === 'price_asc') orderBy = { price: 'asc' };
    else if (sort === 'price_desc') orderBy = { price: 'desc' };
    else if (sort === 'newest') orderBy = { createdAt: 'desc' };
    else if (sort === 'popular') orderBy = { views: 'desc' };
    else if (sort === 'area_asc') orderBy = { area: 'asc' };
    else if (sort === 'area_desc') orderBy = { area: 'desc' };

    const skip = (page - 1) * limit;

    const [properties, total] = await Promise.all([
      db.property.findMany({
        where,
        include: {
          images: { orderBy: { order: 'asc' } },
          amenities: { include: { amenity: true } },
          landlord: { select: { id: true, name: true, avatar: true, verified: true, phone: true } },
          _count: { select: { favorites: true, inquiries: true } },
        },
        orderBy,
        skip,
        take: limit,
      }),
      db.property.count({ where }),
    ]);

    return NextResponse.json({
      properties,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Properties fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession(request);
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    if (user.role !== 'LANDLORD' && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only landlords can create listings' }, { status: 403 });
    }

    const body = await request.json();
    const validation = validateBody(propertyCreateSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const {
      title, description, price, location, address, city,
      bedrooms, bathrooms, propertyType, area, furnished,
      parking, petsAllowed, yearBuilt, floor, totalFloors,
      listingType, landTitleType, paymentReference,
      images, amenityIds,
    } = validation.data;

    const property = await db.property.create({
      data: {
        title,
        description,
        price: parseFloat(price),
        location: location || address,
        address,
        city,
        bedrooms: parseInt(bedrooms),
        bathrooms: parseInt(bathrooms),
        propertyType,
        area: parseFloat(area),
        furnished: furnished || false,
        parking: parking || false,
        petsAllowed: petsAllowed || false,
        yearBuilt: yearBuilt ? parseInt(yearBuilt) : null,
        floor: floor ? parseInt(floor) : null,
        totalFloors: totalFloors ? parseInt(totalFloors) : null,
        listingType: listingType || 'RENT',
        landTitleType: landTitleType || null,
        paymentReference: paymentReference || null,
        paymentStatus: paymentReference ? 'PENDING_VERIFICATION' : 'UNPAID',
        landlordId: user.id,
        images: images ? {
          create: images.map((img: { url: string; caption?: string; isPrimary?: boolean }, i: number) => ({
            url: img.url,
            caption: img.caption || null,
            isPrimary: img.isPrimary || i === 0,
            order: i,
          })),
        } : undefined,
        amenities: amenityIds ? {
          create: amenityIds.map((amenityId: string) => ({ amenityId })),
        } : undefined,
      },
      include: {
        images: true,
        amenities: { include: { amenity: true } },
        landlord: { select: { id: true, name: true, avatar: true, verified: true } },
      },
    });

    return NextResponse.json(property, { status: 201 });
  } catch (error) {
    console.error('Property creation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
