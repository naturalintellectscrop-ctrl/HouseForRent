import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { savedSearchCreateSchema, validateBody } from '@/lib/validations';

// GET /api/saved-searches - List saved searches for authenticated user
export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const savedSearches = await db.savedSearch.findMany({
      where: { userId: session.id },
      orderBy: { createdAt: 'desc' },
    });

    // Compute matchCount for each saved search
    const enrichedSearches = await Promise.all(
      savedSearches.map(async (search) => {
        const where: Record<string, unknown> = {
          listingStatus: 'APPROVED',
          status: 'AVAILABLE',
        };

        if (search.city) {
          where.city = { contains: search.city };
        }
        if (search.propertyType) {
          where.propertyType = search.propertyType;
        }
        if (search.minPrice !== null) {
          where.price = { ...((where.price as Record<string, unknown>) || {}), gte: search.minPrice };
        }
        if (search.maxPrice !== null) {
          where.price = { ...((where.price as Record<string, unknown>) || {}), lte: search.maxPrice };
        }
        if (search.bedrooms !== null) {
          where.bedrooms = { gte: search.bedrooms };
        }
        if (search.furnished) {
          where.furnished = true;
        }
        if (search.parking) {
          where.parking = true;
        }
        if (search.petsAllowed) {
          where.petsAllowed = true;
        }

        const matchCount = await db.property.count({ where });

        // Update stored matchCount if different
        if (matchCount !== search.matchCount) {
          await db.savedSearch.update({
            where: { id: search.id },
            data: { matchCount },
          });
        }

        return {
          ...search,
          matchCount,
        };
      })
    );

    return NextResponse.json(enrichedSearches);
  } catch (error) {
    console.error('Error fetching saved searches:', error);
    return NextResponse.json({ error: 'Failed to fetch saved searches' }, { status: 500 });
  }
}

// POST /api/saved-searches - Create a new saved search
export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validation = validateBody(savedSearchCreateSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { name, searchQuery, city, propertyType, minPrice, maxPrice, bedrooms, furnished, parking, petsAllowed } = validation.data;

    // Check for duplicate name
    const existing = await db.savedSearch.findFirst({
      where: { userId: session.id, name: name.trim() },
    });
    if (existing) {
      return NextResponse.json({ error: 'A saved search with this name already exists' }, { status: 409 });
    }

    // Compute initial matchCount
    const where: Record<string, unknown> = {
      listingStatus: 'APPROVED',
      status: 'AVAILABLE',
    };

    if (city) {
      where.city = { contains: city };
    }
    if (propertyType) {
      where.propertyType = propertyType;
    }
    if (minPrice !== undefined && minPrice !== null) {
      where.price = { ...((where.price as Record<string, unknown>) || {}), gte: Number(minPrice) };
    }
    if (maxPrice !== undefined && maxPrice !== null) {
      where.price = { ...((where.price as Record<string, unknown>) || {}), lte: Number(maxPrice) };
    }
    if (bedrooms !== undefined && bedrooms !== null && bedrooms !== '') {
      where.bedrooms = { gte: Number(bedrooms) };
    }
    if (furnished) {
      where.furnished = true;
    }
    if (parking) {
      where.parking = true;
    }
    if (petsAllowed) {
      where.petsAllowed = true;
    }

    const matchCount = await db.property.count({ where });

    const savedSearch = await db.savedSearch.create({
      data: {
        userId: session.id,
        name: name.trim(),
        searchQuery: searchQuery || null,
        city: city || null,
        propertyType: propertyType || null,
        minPrice: minPrice !== undefined && minPrice !== null && minPrice !== '' ? Number(minPrice) : null,
        maxPrice: maxPrice !== undefined && maxPrice !== null && maxPrice !== '' ? Number(maxPrice) : null,
        bedrooms: bedrooms !== undefined && bedrooms !== null && bedrooms !== '' ? Number(bedrooms) : null,
        furnished: !!furnished,
        parking: !!parking,
        petsAllowed: !!petsAllowed,
        matchCount,
      },
    });

    return NextResponse.json(savedSearch, { status: 201 });
  } catch (error) {
    console.error('Error creating saved search:', error);
    return NextResponse.json({ error: 'Failed to create saved search' }, { status: 500 });
  }
}

// DELETE /api/saved-searches - Delete a saved search by ID
export async function DELETE(request: NextRequest) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Saved search ID is required' }, { status: 400 });
    }

    const savedSearch = await db.savedSearch.findUnique({
      where: { id },
    });

    if (!savedSearch) {
      return NextResponse.json({ error: 'Saved search not found' }, { status: 404 });
    }

    if (savedSearch.userId !== session.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await db.savedSearch.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting saved search:', error);
    return NextResponse.json({ error: 'Failed to delete saved search' }, { status: 500 });
  }
}
