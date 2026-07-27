import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

const CITY_COORDINATES: Record<string, { x: number; y: number }> = {
  Kampala: { x: 55, y: 52 },
  Entebbe: { x: 50, y: 58 },
  Jinja: { x: 66, y: 50 },
  Mbarara: { x: 32, y: 68 },
  Gulu: { x: 48, y: 22 },
  Mbale: { x: 72, y: 38 },
  'Fort Portal': { x: 25, y: 44 },
  Arua: { x: 26, y: 18 },
};

export async function GET() {
  try {
    const properties = await db.property.findMany({
      where: {
        listingStatus: 'APPROVED',
        status: 'AVAILABLE',
      },
      include: {
        images: { orderBy: { order: 'asc' } },
        landlord: { select: { id: true, name: true, avatar: true, verified: true } },
        _count: { select: { favorites: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Group by city
    const cityMap = new Map<string, typeof properties>();

    for (const property of properties) {
      const city = property.city;
      if (!cityMap.has(city)) {
        cityMap.set(city, []);
      }
      cityMap.get(city)!.push(property);
    }

    // Build response grouped by city
    const cities = Array.from(cityMap.entries()).map(([city, cityProperties]) => {
      const prices = cityProperties.map((p) => p.price);
      const avgPrice = prices.length > 0 ? prices.reduce((sum, p) => sum + p, 0) / prices.length : 0;

      // Find matching coordinates - case-insensitive match
      const coordKey = Object.keys(CITY_COORDINATES).find(
        (key) => key.toLowerCase() === city.toLowerCase()
      );
      const coordinates = coordKey
        ? CITY_COORDINATES[coordKey]
        : { x: 35 + Math.random() * 35, y: 25 + Math.random() * 45 };

      // Top 3 properties by views
      const topProperties = [...cityProperties]
        .sort((a, b) => b.views - a.views)
        .slice(0, 3)
        .map((p) => ({
          id: p.id,
          title: p.title,
          price: p.price,
          bedrooms: p.bedrooms,
          bathrooms: p.bathrooms,
          area: p.area,
          propertyType: p.propertyType,
          listingType: p.listingType,
          images: p.images,
          landlord: p.landlord,
          views: p.views,
          featured: p.featured,
        }));

      return {
        city,
        propertyCount: cityProperties.length,
        averagePrice: Math.round(avgPrice),
        coordinates,
        topProperties,
      };
    });

    // Sort by property count descending
    cities.sort((a, b) => b.propertyCount - a.propertyCount);

    return NextResponse.json({ cities });
  } catch (error) {
    console.error('Properties by-city fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
