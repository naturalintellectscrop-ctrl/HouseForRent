import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import ZAI from 'z-ai-web-dev-sdk';

export async function GET(request: NextRequest) {
  try {
    const user = await getSession(request);

    // If not logged in, return featured/popular properties as fallback
    if (!user) {
      const featured = await db.property.findMany({
        where: {
          listingStatus: 'APPROVED',
          status: 'AVAILABLE',
        },
        include: {
          images: { orderBy: { order: 'asc' } },
          amenities: { include: { amenity: true } },
          landlord: { select: { id: true, name: true, avatar: true, verified: true, phone: true } },
          _count: { select: { favorites: true, inquiries: true } },
        },
        orderBy: [{ featured: 'desc' }, { views: 'desc' }],
        take: 4,
      });

      return NextResponse.json({
        recommendations: featured,
        source: 'featured',
      });
    }

    const { searchParams } = new URL(request.url);
    const currentPropertyId = searchParams.get('propertyId');

    // Fetch user's favorited properties
    const favorites = await db.favorite.findMany({
      where: { userId: user.id },
      include: {
        property: {
          select: {
            id: true,
            title: true,
            city: true,
            propertyType: true,
            price: true,
            bedrooms: true,
            bathrooms: true,
            area: true,
            furnished: true,
            parking: true,
            petsAllowed: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // Fetch user's inquired properties
    const inquiries = await db.inquiry.findMany({
      where: { tenantId: user.id },
      include: {
        property: {
          select: {
            id: true,
            title: true,
            city: true,
            propertyType: true,
            price: true,
            bedrooms: true,
            bathrooms: true,
            area: true,
            furnished: true,
            parking: true,
            petsAllowed: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // If no user activity, return popular properties
    if (favorites.length === 0 && inquiries.length === 0) {
      const popular = await db.property.findMany({
        where: {
          listingStatus: 'APPROVED',
          status: 'AVAILABLE',
        },
        include: {
          images: { orderBy: { order: 'asc' } },
          amenities: { include: { amenity: true } },
          landlord: { select: { id: true, name: true, avatar: true, verified: true, phone: true } },
          _count: { select: { favorites: true, inquiries: true } },
        },
        orderBy: [{ views: 'desc' }, { createdAt: 'desc' }],
        take: 4,
      });

      return NextResponse.json({
        recommendations: popular,
        source: 'popular',
      });
    }

    // Build user preference summary from favorites and inquiries
    const interactedProperties = [
      ...favorites.map((f) => ({ ...f.property, interaction: 'favorite' as const })),
      ...inquiries.map((i) => ({ ...i.property, interaction: 'inquiry' as const })),
    ];

    // Get IDs of properties the user already interacted with
    const interactedIds = new Set(interactedProperties.map((p) => p.id));
    if (currentPropertyId) {
      interactedIds.add(currentPropertyId);
    }

    // Analyze user preferences
    const cities = [...new Set(interactedProperties.map((p) => p.city))];
    const propertyTypes = [...new Set(interactedProperties.map((p) => p.propertyType))];
    const prices = interactedProperties.map((p) => p.price);
    const avgPrice = prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0;
    const avgBedrooms = interactedProperties.length > 0
      ? Math.round(interactedProperties.reduce((a, p) => a + p.bedrooms, 0) / interactedProperties.length)
      : 0;
    const preferFurnished = interactedProperties.filter((p) => p.furnished).length > interactedProperties.filter((p) => !p.furnished).length;
    const preferParking = interactedProperties.filter((p) => p.parking).length > interactedProperties.filter((p) => !p.parking).length;

    // Fetch all available properties that user hasn't interacted with
    const availableProperties = await db.property.findMany({
      where: {
        listingStatus: 'APPROVED',
        status: 'AVAILABLE',
        id: { notIn: [...interactedIds] },
      },
      select: {
        id: true,
        title: true,
        city: true,
        propertyType: true,
        price: true,
        bedrooms: true,
        bathrooms: true,
        area: true,
        furnished: true,
        parking: true,
        petsAllowed: true,
        featured: true,
        views: true,
      },
      take: 30,
    });

    // If no available properties, return empty
    if (availableProperties.length === 0) {
      return NextResponse.json({
        recommendations: [],
        source: 'ai',
      });
    }

    // Build LLM prompt
    const userPrefs = `Cities: ${cities.join(', ')}. Types: ${propertyTypes.join(', ')}. Avg price: UGX ${avgPrice}/mo. Avg bedrooms: ${avgBedrooms}. Furnished: ${preferFurnished ? 'yes' : 'no preference'}. Parking: ${preferParking ? 'yes' : 'no preference'}.`;

    const propertyList = availableProperties
      .map((p, i) => `${i + 1}. ID:${p.id} | ${p.title} | ${p.city} | ${p.propertyType} | UGX${Math.round(p.price)}/mo | ${p.bedrooms}bed/${p.bathrooms}bath | ${p.area}sqm | furnished:${p.furnished} | parking:${p.parking}`)
      .join('\n');

    const prompt = `You are a rental property recommendation AI. Based on the user's preferences, rank the following properties from best to worst match.

User preferences: ${userPrefs}

Available properties:
${propertyList}

Return ONLY a JSON array of property IDs (the ID:xxx values) ranked by best match, top 4 max. Example: ["id1","id2","id3","id4"]
Do not include any other text, just the JSON array.`;

    // Heuristic fallback ranking function
    const heuristicRank = (props: typeof availableProperties) =>
      props
        .map((p) => {
          let score = 0;
          if (cities.includes(p.city)) score += 3;
          if (propertyTypes.includes(p.propertyType)) score += 2;
          if (avgPrice > 0) score -= Math.abs(p.price - avgPrice) / avgPrice;
          if (p.featured) score += 1;
          return { ...p, score };
        })
        .sort((a, b) => b.score - a.score);

    // Call LLM
    let recommendedIds: string[] = [];
    try {
      const zai = await ZAI.create();
      const result = await zai.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'default',
      });

      const responseText = result?.choices?.[0]?.message?.content || '';
      // Extract JSON array from response
      const jsonMatch = responseText.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) {
          recommendedIds = parsed.slice(0, 4);
        }
      }
    } catch (llmError) {
      console.error('LLM recommendation error:', llmError);
    }

    // If no recommendations from LLM, use heuristic fallback
    if (recommendedIds.length === 0) {
      recommendedIds = heuristicRank(availableProperties)
        .slice(0, 4)
        .map((p) => p.id);
    }

    // Fetch full property details for recommended IDs
    const recommendedProperties = await db.property.findMany({
      where: {
        id: { in: recommendedIds },
      },
      include: {
        images: { orderBy: { order: 'asc' } },
        amenities: { include: { amenity: true } },
        landlord: { select: { id: true, name: true, avatar: true, verified: true, phone: true } },
        _count: { select: { favorites: true, inquiries: true } },
      },
    });

    // Sort by the LLM ranking order
    const ordered = recommendedIds
      .map((id) => recommendedProperties.find((p) => p.id === id))
      .filter(Boolean);

    return NextResponse.json({
      recommendations: ordered,
      source: 'ai',
    });
  } catch (error) {
    console.error('Recommendations error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
