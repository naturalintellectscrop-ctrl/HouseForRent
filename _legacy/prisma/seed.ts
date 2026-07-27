import { db } from '../src/lib/db';
import bcrypt from 'bcryptjs';

async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

const AMENITIES = [
  { name: 'WiFi', icon: 'Wifi', category: 'UTILITY' },
  { name: 'Air Conditioning', icon: 'AirVent', category: 'UTILITY' },
  { name: 'Heating', icon: 'Flame', category: 'UTILITY' },
  { name: 'Washer', icon: 'WashingMachine', category: 'UTILITY' },
  { name: 'Dryer', icon: 'Wind', category: 'UTILITY' },
  { name: 'Dishwasher', icon: 'GlassWater', category: 'UTILITY' },
  { name: 'Refrigerator', icon: 'Refrigerator', category: 'UTILITY' },
  { name: 'Oven', icon: 'CookingPot', category: 'UTILITY' },
  { name: 'Microwave', icon: 'Radio', category: 'UTILITY' },
  { name: 'TV', icon: 'Tv', category: 'UTILITY' },
  { name: 'Swimming Pool', icon: 'Waves', category: 'OUTDOOR' },
  { name: 'Garden', icon: 'Flower2', category: 'OUTDOOR' },
  { name: 'Balcony', icon: 'Sun', category: 'OUTDOOR' },
  { name: 'Terrace', icon: 'Mountain', category: 'OUTDOOR' },
  { name: 'BBQ Area', icon: 'Flame', category: 'OUTDOOR' },
  { name: 'Gym', icon: 'Dumbbell', category: 'OUTDOOR' },
  { name: 'Playground', icon: 'Baby', category: 'OUTDOOR' },
  { name: 'Security', icon: 'Shield', category: 'SECURITY' },
  { name: 'CCTV', icon: 'Camera', category: 'SECURITY' },
  { name: 'Gated Community', icon: 'Lock', category: 'SECURITY' },
  { name: 'Alarm System', icon: 'Bell', category: 'SECURITY' },
  { name: 'Elevator', icon: 'ArrowUpDown', category: 'GENERAL' },
  { name: 'Parking', icon: 'Car', category: 'GENERAL' },
  { name: 'Storage', icon: 'Package', category: 'GENERAL' },
  { name: 'Concierge', icon: 'UserCheck', category: 'GENERAL' },
  { name: 'Pet Friendly', icon: 'PawPrint', category: 'GENERAL' },
];

const PROPERTY_IMAGES = [
  'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1560185127-6ed189bf02f4?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1600573472550-8090b5e0745e?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1583608205776-bfd35f0d9f83?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1571939228382-b2f2b585ce15?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1554995207-c18c203602cb?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1605276374104-dee2a0ed3cd6?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=800&h=600&fit=crop',
];

const CITIES = ['Kampala', 'Entebbe', 'Jinja', 'Mbarara', 'Gulu', 'Mbale', 'Fort Portal', 'Arua'];

const PROPERTIES = [
  {
    title: 'Luxury Penthouse in Kololo',
    description: 'Stunning penthouse apartment in the heart of Kololo with panoramic views of Kampala city skyline. Features floor-to-ceiling windows, modern open-plan kitchen, and a private rooftop terrace. Perfect for professionals and diplomats seeking luxury urban living in the diplomatic quarter.',
    price: 3500000,
    address: 'Kololo Hill, Kololo',
    city: 'Kampala',
    bedrooms: 4,
    bathrooms: 3,
    propertyType: 'APARTMENT',
    area: 220,
    furnished: true,
    parking: true,
    petsAllowed: false,
    yearBuilt: 2022,
    floor: 15,
    totalFloors: 16,
    featured: true,
    listingType: 'RENT',
    landTitleType: 'READY_TITLE',
    paymentStatus: 'PAID',
  },
  {
    title: 'Modern Studio near Makerere University',
    description: 'Compact and stylish studio apartment ideal for young professionals and students. Walking distance to Makerere University and the city centre. Features modern fixtures, built-in storage, and high-speed internet connectivity.',
    price: 350000,
    address: 'Makerere Hill Road, Makerere',
    city: 'Kampala',
    bedrooms: 1,
    bathrooms: 1,
    propertyType: 'STUDIO',
    area: 45,
    furnished: true,
    parking: false,
    petsAllowed: true,
    yearBuilt: 2021,
    floor: 3,
    totalFloors: 8,
    featured: false,
    listingType: 'RENT',
    landTitleType: 'AGREEMENT',
    paymentStatus: 'PAID',
  },
  {
    title: 'Spacious Family Home in Muyenga',
    description: 'Beautiful family home in the prestigious Muyenga neighborhood on the hills overlooking Lake Victoria. Large garden, secure compound, and close to international schools. Features a modern kitchen, spacious living areas, and domestic staff quarters.',
    price: 2500000,
    address: 'Muyenga Hill, Muyenga',
    city: 'Kampala',
    bedrooms: 5,
    bathrooms: 4,
    propertyType: 'HOUSE',
    area: 450,
    furnished: false,
    parking: true,
    petsAllowed: true,
    yearBuilt: 2018,
    featured: true,
    listingType: 'RENT',
    landTitleType: 'READY_TITLE',
    paymentStatus: 'PAID',
  },
  {
    title: 'Lakefront Villa in Entebbe',
    description: 'Exquisite lakefront villa with direct access to the shores of Lake Victoria near Entebbe. Features a private pool, outdoor entertainment area, and stunning lake views. Ideal for those seeking the ultimate lakeside lifestyle close to Entebbe International Airport.',
    price: 4000000,
    address: 'Lakeside Drive, Entebbe',
    city: 'Entebbe',
    bedrooms: 5,
    bathrooms: 4,
    propertyType: 'VILLA',
    area: 380,
    furnished: true,
    parking: true,
    petsAllowed: true,
    yearBuilt: 2020,
    featured: true,
    listingType: 'BOTH',
    landTitleType: 'READY_TITLE',
    paymentStatus: 'PAID',
  },
  {
    title: 'Cozy 2-Bedroom Apartment in Bugolobi',
    description: 'Well-maintained 2-bedroom apartment in a secure complex in Bugolobi. Close to Village Mall, restaurants, and the Kitante golf course. Features a balcony with city views and access to a shared swimming pool.',
    price: 900000,
    address: 'Bugolobi Road, Bugolobi',
    city: 'Kampala',
    bedrooms: 2,
    bathrooms: 2,
    propertyType: 'APARTMENT',
    area: 95,
    furnished: false,
    parking: true,
    petsAllowed: false,
    yearBuilt: 2017,
    floor: 5,
    totalFloors: 10,
    featured: false,
    listingType: 'RENT',
    landTitleType: 'AGREEMENT',
    paymentStatus: 'PAID',
  },
  {
    title: 'Executive Condo in Nakasero',
    description: 'Premium condo with high-end finishes in the sought-after Nakasero area. Features smart home technology, a gourmet kitchen, and access to a state-of-the-art gym. Walking distance to Nakasero Market and the city centre.',
    price: 1800000,
    address: 'Nakasero Hill, Nakasero',
    city: 'Kampala',
    bedrooms: 3,
    bathrooms: 2,
    propertyType: 'CONDO',
    area: 150,
    furnished: true,
    parking: true,
    petsAllowed: false,
    yearBuilt: 2023,
    floor: 8,
    totalFloors: 12,
    featured: true,
    listingType: 'BOTH',
    landTitleType: 'READY_TITLE',
    paymentStatus: 'PAID',
  },
  {
    title: 'Affordable Bedsitter in Ntinda',
    description: 'Budget-friendly bedsitter in the bustling Ntinda neighborhood. Basic amenities included, water and electricity available. Good access to public transportation and close to Ntinda shopping centre and the Northern Bypass.',
    price: 250000,
    address: 'Ntinda-Kisaasi Road, Ntinda',
    city: 'Kampala',
    bedrooms: 1,
    bathrooms: 1,
    propertyType: 'BEDSITTER',
    area: 25,
    furnished: false,
    parking: false,
    petsAllowed: false,
    yearBuilt: 2015,
    floor: 2,
    totalFloors: 4,
    featured: false,
    listingType: 'RENT',
    landTitleType: 'AGREEMENT',
    paymentStatus: 'PAID',
  },
  {
    title: 'Riverside Cottage in Jinja',
    description: 'Charming cottage near the Source of the Nile in Jinja. Enjoy stunning views of the Nile River and fresh breezes. Perfect for nature lovers and those seeking a peaceful retreat. Comes with a small private garden and easy access to white-water rafting spots.',
    price: 600000,
    address: 'Nile Avenue, Jinja',
    city: 'Jinja',
    bedrooms: 2,
    bathrooms: 1,
    propertyType: 'HOUSE',
    area: 110,
    furnished: true,
    parking: true,
    petsAllowed: true,
    yearBuilt: 2019,
    featured: false,
    listingType: 'RENT',
    landTitleType: 'AGREEMENT',
    paymentStatus: 'PAID',
  },
  {
    title: 'Modern Townhouse in Makindye',
    description: 'Contemporary townhouse in a gated community in Makindye. Features modern architecture, shared amenities including playground and backup generator. Close to the Southern Bypass and major highways for easy commuting.',
    price: 1200000,
    address: 'Makindye Road, Makindye',
    city: 'Kampala',
    bedrooms: 3,
    bathrooms: 2,
    propertyType: 'TOWNHOUSE',
    area: 130,
    furnished: false,
    parking: true,
    petsAllowed: true,
    yearBuilt: 2021,
    featured: false,
    listingType: 'BOTH',
    landTitleType: 'READY_TITLE',
    paymentStatus: 'PAID',
  },
  {
    title: 'Luxury Apartment in Mbarara',
    description: 'Premium apartment with panoramic views of the western Uganda countryside. Modern finishes, spacious rooms, and 24/7 security. Close to shopping centers and restaurants in Mbarara town, the gateway to western Uganda.',
    price: 800000,
    address: 'Mbarara-Kabale Road, Mbarara',
    city: 'Mbarara',
    bedrooms: 3,
    bathrooms: 2,
    propertyType: 'APARTMENT',
    area: 140,
    furnished: true,
    parking: true,
    petsAllowed: false,
    yearBuilt: 2022,
    floor: 6,
    totalFloors: 8,
    featured: false,
    listingType: 'RENT',
    landTitleType: 'AGREEMENT',
    paymentStatus: 'PAID',
  },
  {
    title: 'Traditional House in Gulu',
    description: 'Beautifully crafted house blending traditional Acholi architecture with modern amenities in Gulu. Features a spacious compound, veranda, and modern kitchen. A unique blend of culture and comfort in the heart of northern Uganda.',
    price: 500000,
    address: 'Gulu-Kampala Road, Gulu',
    city: 'Gulu',
    bedrooms: 3,
    bathrooms: 2,
    propertyType: 'HOUSE',
    area: 160,
    furnished: true,
    parking: true,
    petsAllowed: true,
    yearBuilt: 2020,
    featured: false,
    listingType: 'RENT',
    landTitleType: 'MILE_LAND',
    paymentStatus: 'PAID',
  },
  {
    title: 'Newly Built Apartment in Mbale',
    description: 'Brand new apartment in the shadow of Mount Elgon in Mbale. Modern design, quality finishes, and efficient layout. Close to Mbale town centre and the scenic Sipi Falls road. Perfect for those who love the eastern Uganda highlands.',
    price: 450000,
    address: 'Mbale-Soroti Road, Mbale',
    city: 'Mbale',
    bedrooms: 2,
    bathrooms: 1,
    propertyType: 'APARTMENT',
    area: 75,
    furnished: false,
    parking: true,
    petsAllowed: false,
    yearBuilt: 2024,
    floor: 4,
    totalFloors: 6,
    featured: false,
    listingType: 'RENT',
    landTitleType: 'AGREEMENT',
    paymentStatus: 'PAID',
  },
  {
    title: 'Gated Community Villa in Lubaga',
    description: 'Elegant villa in a secure gated community in Lubaga. Features a manicured garden, private parking for 3 cars, and a domestic staff quarter. Ideal for families seeking security and space near the Lubaga Cathedral area.',
    price: 2200000,
    address: 'Lubaga Road, Lubaga',
    city: 'Kampala',
    bedrooms: 4,
    bathrooms: 3,
    propertyType: 'VILLA',
    area: 280,
    furnished: false,
    parking: true,
    petsAllowed: true,
    yearBuilt: 2020,
    featured: false,
    listingType: 'RENT',
    landTitleType: 'READY_TITLE',
    paymentStatus: 'PAID',
  },
  {
    title: 'Lakeside Studio in Entebbe',
    description: 'Bright and airy studio just minutes from the Lake Victoria shoreline in Entebbe. Perfect for solo travelers or couples. Features a kitchenette and a balcony with lake views. Close to Entebbe Botanical Gardens and the airport.',
    price: 400000,
    address: 'Airport Road, Entebbe',
    city: 'Entebbe',
    bedrooms: 1,
    bathrooms: 1,
    propertyType: 'STUDIO',
    area: 40,
    furnished: true,
    parking: true,
    petsAllowed: false,
    yearBuilt: 2019,
    floor: 1,
    totalFloors: 3,
    featured: false,
    listingType: 'RENT',
    landTitleType: 'AGREEMENT',
    paymentStatus: 'PAID',
  },
  {
    title: 'Mountain View Cottage in Fort Portal',
    description: 'Rustic cottage with magnificent views of the Rwenzori Mountains in Fort Portal. Set on lush grounds with indigenous trees and a stream nearby. Ideal for those seeking tranquility and connection with nature in western Uganda.',
    price: 550000,
    address: 'Fort Portal-Kasese Road, Fort Portal',
    city: 'Fort Portal',
    bedrooms: 2,
    bathrooms: 1,
    propertyType: 'BUNGALOW',
    area: 120,
    furnished: true,
    parking: true,
    petsAllowed: true,
    yearBuilt: 2016,
    featured: false,
    listingType: 'RENT',
    landTitleType: 'CROWN_LAND',
    paymentStatus: 'PAID',
  },
  {
    title: 'Premium Loft Apartment in Kisaasi',
    description: 'Unique loft-style apartment with industrial chic design in Kisaasi. Features exposed brick walls, high ceilings, and oversized windows. A creative living space with easy access to the Northern Bypass and Kisaasi trading centre.',
    price: 1100000,
    address: 'Kisaasi-Kyanja Road, Kisaasi',
    city: 'Kampala',
    bedrooms: 2,
    bathrooms: 2,
    propertyType: 'APARTMENT',
    area: 130,
    furnished: true,
    parking: true,
    petsAllowed: false,
    yearBuilt: 2023,
    floor: 4,
    totalFloors: 7,
    featured: false,
    listingType: 'RENT',
    landTitleType: 'AGREEMENT',
    paymentStatus: 'PAID',
  },
  // === FOR SALE PROPERTIES ===
  {
    title: 'Prime Land for Sale in Mukono',
    description: 'Excellent 1-acre plot of land in the fast-growing Mukono area. Ideal for residential or commercial development. The land has a ready land title and is located just off the Jinja Highway with easy access to Kampala. Water and electricity are available nearby.',
    price: 150000000,
    address: 'Jinja Highway, Mukono',
    city: 'Kampala',
    bedrooms: 0,
    bathrooms: 0,
    propertyType: 'LAND',
    area: 4047,
    furnished: false,
    parking: false,
    petsAllowed: false,
    yearBuilt: null,
    featured: true,
    listingType: 'SALE',
    landTitleType: 'READY_TITLE',
    paymentStatus: 'PAID',
  },
  {
    title: '4-Bedroom House for Sale in Naalya',
    description: 'Beautiful 4-bedroom house for sale in the quiet Naalya estate. Modern finishes, spacious rooms, master bedroom with en-suite, and a well-maintained garden. The property comes with a ready land title and is in a secure, well-planned neighborhood.',
    price: 450000000,
    address: 'Naalya Estate, Naalya',
    city: 'Kampala',
    bedrooms: 4,
    bathrooms: 3,
    propertyType: 'HOUSE',
    area: 350,
    furnished: false,
    parking: true,
    petsAllowed: true,
    yearBuilt: 2019,
    featured: true,
    listingType: 'SALE',
    landTitleType: 'READY_TITLE',
    paymentStatus: 'PAID',
  },
  {
    title: 'Commercial Plot in Mbarara Town',
    description: 'Strategic commercial plot located on the main road in Mbarara town. Perfect for office buildings, shops, or a hotel. High foot traffic area with great visibility. Has a ready land title and all necessary utilities connected.',
    price: 800000000,
    address: 'Main Street, Mbarara',
    city: 'Mbarara',
    bedrooms: 0,
    bathrooms: 0,
    propertyType: 'LAND',
    area: 2023,
    furnished: false,
    parking: false,
    petsAllowed: false,
    yearBuilt: null,
    featured: true,
    listingType: 'SALE',
    landTitleType: 'READY_TITLE',
    paymentStatus: 'PAID',
  },
  {
    title: 'Luxury Bungalow for Sale in Entebbe',
    description: 'Stunning luxury bungalow for sale in a prime Entebbe location. Features 3 bedrooms, modern kitchen, open-plan living area, and a large compound. Just 10 minutes from Entebbe International Airport. Perfect for a family home or holiday house.',
    price: 380000000,
    address: 'Lakeside Road, Entebbe',
    city: 'Entebbe',
    bedrooms: 3,
    bathrooms: 2,
    propertyType: 'BUNGALOW',
    area: 200,
    furnished: true,
    parking: true,
    petsAllowed: true,
    yearBuilt: 2021,
    featured: true,
    listingType: 'SALE',
    landTitleType: 'READY_TITLE',
    paymentStatus: 'PAID',
  },
  {
    title: '50x100 Plot in Wakiso',
    description: 'Residential plot measuring 50x100 feet in the growing Wakiso district. Ideal for building a family home. The area is well-developed with good road access, electricity, and water. Mile land with an agreement in place.',
    price: 45000000,
    address: 'Wakiso Town, Wakiso',
    city: 'Kampala',
    bedrooms: 0,
    bathrooms: 0,
    propertyType: 'LAND',
    area: 465,
    furnished: false,
    parking: false,
    petsAllowed: false,
    yearBuilt: null,
    featured: false,
    listingType: 'SALE',
    landTitleType: 'MILE_LAND',
    paymentStatus: 'PAID',
  },
  {
    title: 'Modern Apartment for Sale in Kololo',
    description: 'Sleek and modern 2-bedroom apartment for sale in Kololo. High-end finishes, smart home features, and panoramic city views. Located in a secure building with 24/7 security, gym, and rooftop terrace. A great investment opportunity in Kampala\'s most prestigious neighborhood.',
    price: 520000000,
    address: 'Kololo Hill, Kololo',
    city: 'Kampala',
    bedrooms: 2,
    bathrooms: 2,
    propertyType: 'CONDO',
    area: 120,
    furnished: true,
    parking: true,
    petsAllowed: false,
    yearBuilt: 2023,
    floor: 10,
    totalFloors: 15,
    featured: true,
    listingType: 'SALE',
    landTitleType: 'READY_TITLE',
    paymentStatus: 'PAID',
  },
];

async function seed() {
  console.log('🌱 Seeding database...');

  // Create amenities
  console.log('Creating amenities...');
  const amenityRecords = [];
  for (const amenity of AMENITIES) {
    const record = await db.amenity.upsert({
      where: { name: amenity.name },
      update: {},
      create: amenity,
    });
    amenityRecords.push(record);
  }

  // Create users
  console.log('Creating users...');
  const adminUser = await db.user.upsert({
    where: { email: 'admin@houseforrent.co.ug' },
    update: {},
    create: {
      email: 'admin@houseforrent.co.ug',
      name: 'Admin User',
      password: await hashPassword('admin123'),
      role: 'ADMIN',
      verified: true,
      phone: '+256752255676',
    },
  });

  const landlord1 = await db.user.upsert({
    where: { email: 'john.mukasa@example.com' },
    update: {},
    create: {
      email: 'john.mukasa@example.com',
      name: 'John Mukasa',
      password: await hashPassword('landlord123'),
      role: 'LANDLORD',
      verified: true,
      phone: '+256711000001',
      bio: 'Experienced property manager with over 10 years in the Kampala real estate market.',
    },
  });

  const landlord2 = await db.user.upsert({
    where: { email: 'sarah.nakamya@example.com' },
    update: {},
    create: {
      email: 'sarah.nakamya@example.com',
      name: 'Sarah Nakamya',
      password: await hashPassword('landlord123'),
      role: 'LANDLORD',
      verified: true,
      phone: '+256722000002',
      bio: 'Property investor specializing in lakefront and upcountry properties across Uganda.',
    },
  });

  const landlord3 = await db.user.upsert({
    where: { email: 'peter.odongo@example.com' },
    update: {},
    create: {
      email: 'peter.odongo@example.com',
      name: 'Peter Odongo',
      password: await hashPassword('landlord123'),
      role: 'LANDLORD',
      verified: true,
      phone: '+256733000003',
      bio: 'Real estate developer focused on affordable housing solutions in Kampala and northern Uganda.',
    },
  });

  const tenant1 = await db.user.upsert({
    where: { email: 'alice.nabwire@example.com' },
    update: {},
    create: {
      email: 'alice.nabwire@example.com',
      name: 'Alice Nabwire',
      password: await hashPassword('tenant123'),
      role: 'TENANT',
      verified: true,
      phone: '+256744000004',
    },
  });

  const tenant2 = await db.user.upsert({
    where: { email: 'bob.okello@example.com' },
    update: {},
    create: {
      email: 'bob.okello@example.com',
      name: 'Bob Okello',
      password: await hashPassword('tenant123'),
      role: 'TENANT',
      verified: true,
      phone: '+256755000005',
    },
  });

  const landlords = [landlord1, landlord2, landlord3];
  const tenants = [tenant1, tenant2];

  // Create properties
  console.log('Creating properties...');
  for (let i = 0; i < PROPERTIES.length; i++) {
    const prop = PROPERTIES[i];
    const landlord = landlords[i % landlords.length];

    // Assign 3-5 images per property
    const startImgIdx = (i * 3) % PROPERTY_IMAGES.length;
    const numImages = Math.min(3 + Math.floor(Math.random() * 3), 5); // 3-5 images, max 5
    const images = [];
    for (let j = 0; j < numImages; j++) {
      const imgIdx = (startImgIdx + j) % PROPERTY_IMAGES.length;
      images.push({
        url: PROPERTY_IMAGES[imgIdx],
        caption: j === 0 ? `${prop.title} - Main View` : `${prop.title} - View ${j + 1}`,
        isPrimary: j === 0,
        order: j,
      });
    }

    // Assign 4-8 random amenities
    const numAmenities = 4 + Math.floor(Math.random() * 5);
    const shuffled = [...amenityRecords].sort(() => Math.random() - 0.5);
    const propertyAmenities = shuffled.slice(0, numAmenities).map(a => ({ amenityId: a.id }));

    await db.property.create({
      data: {
        ...prop,
        location: prop.address,
        landlordId: landlord.id,
        listingStatus: 'APPROVED',
        images: { create: images },
        amenities: { create: propertyAmenities },
      },
    });
  }

  // Create some favorites
  console.log('Creating favorites...');
  const allProperties = await db.property.findMany({ take: 10 });
  for (const tenant of tenants) {
    for (let i = 0; i < Math.min(4, allProperties.length); i++) {
      await db.favorite.upsert({
        where: {
          userId_propertyId: {
            userId: tenant.id,
            propertyId: allProperties[i].id,
          },
        },
        update: {},
        create: {
          userId: tenant.id,
          propertyId: allProperties[i].id,
        },
      });
    }
  }

  // Create some inquiries
  console.log('Creating inquiries...');
  for (let i = 0; i < Math.min(3, allProperties.length); i++) {
    const property = allProperties[i];
    const inquiry = await db.inquiry.create({
      data: {
        message: `Hi, I'm interested in the ${property.title}. Is it still available? I'd like to schedule a viewing.`,
        tenantId: tenants[0].id,
        propertyId: property.id,
        status: 'PENDING',
      },
    });

    await db.message.create({
      data: {
        content: `Hi, I'm interested in the ${property.title}. Is it still available? I'd like to schedule a viewing.`,
        senderId: tenants[0].id,
        receiverId: property.landlordId,
        inquiryId: inquiry.id,
      },
    });
  }

  // Add one more pending property for admin review (unpaid)
  await db.property.create({
    data: {
      title: 'Pending Review - Garden Apartment in Ntinda',
      description: 'A lovely garden apartment in Ntinda awaiting admin approval. Close to Ntinda market and public transport.',
      price: 650000,
      location: 'Ntinda-Kisaasi Road, Ntinda',
      address: 'Ntinda-Kisaasi Road, Ntinda',
      city: 'Kampala',
      bedrooms: 2,
      bathrooms: 1,
      propertyType: 'APARTMENT',
      area: 80,
      furnished: false,
      parking: true,
      petsAllowed: true,
      landlordId: landlord1.id,
      listingStatus: 'PENDING',
      listingType: 'RENT',
      landTitleType: 'AGREEMENT',
      paymentStatus: 'UNPAID',
      images: {
        create: [{
          url: PROPERTY_IMAGES[5],
          caption: 'Garden Apartment in Ntinda - Main View',
          isPrimary: true,
          order: 0,
        }],
      },
    },
  });

  // Create reviews for properties
  console.log('Creating reviews...');
  const reviewedProperties = allProperties.slice(0, 8);
  const reviewData = [
    { rating: 5, comment: 'Absolutely stunning property in Kololo! The views of Kampala city are incredible and the finishes are top-notch. The landlord was very responsive and professional throughout the process.' },
    { rating: 4, comment: 'Great location in Bugolobi and well-maintained property. The amenities are fantastic. Only giving 4 stars because parking could be better organized.' },
    { rating: 5, comment: 'Perfect family home in Muyenga! Spacious rooms, beautiful garden, and very safe neighborhood. The kids love the playground nearby and the views of Lake Victoria are breathtaking.' },
    { rating: 3, comment: 'Decent property in Ntinda for the price. Some fixtures could use updating but overall a comfortable living space. Good value for money with easy access to the Northern Bypass.' },
    { rating: 4, comment: 'Beautiful lakefront villa in Entebbe! Waking up to the view of Lake Victoria is amazing. The pool area is well-maintained and the property manager is helpful.' },
    { rating: 5, comment: 'Exceeded all my expectations in Nakasero! Smart home features are a game-changer. The gym in the building is world-class. Highly recommend for anyone working in the city centre.' },
    { rating: 4, comment: 'Charming cottage near the Source of the Nile in Jinja. Very peaceful and relaxing environment. The garden is a wonderful bonus and the white-water rafting nearby is incredible.' },
    { rating: 3, comment: 'Good budget option for the area in Makindye. Basic but functional. The neighborhood is quiet and has good transport links to Kampala city centre via the Southern Bypass.' },
  ];

  for (let i = 0; i < Math.min(reviewData.length, reviewedProperties.length); i++) {
    const reviewer = tenants[i % tenants.length];
    const prop = reviewedProperties[i];
    try {
      await db.review.create({
        data: {
          rating: reviewData[i].rating,
          comment: reviewData[i].comment,
          userId: reviewer.id,
          propertyId: prop.id,
        },
      });
    } catch {
      // Skip if already exists (unique constraint)
    }
  }

  // Create sample notifications
  console.log('Creating notifications...');
  const notificationTypes = [
    { type: 'FAVORITE', title: 'New Favorite', message: 'Someone added your property "Luxury Penthouse in Kololo" to their favorites!' },
    { type: 'INQUIRY', title: 'New Inquiry', message: 'Alice Nabwire sent you an inquiry about "Spacious Family Home in Muyenga".' },
    { type: 'REVIEW', title: 'New Review', message: 'Your property "Executive Condo in Nakasero" received a 5-star review!' },
    { type: 'SYSTEM', title: 'Welcome to House For Rent!', message: 'Start by listing your first property or browsing available rentals and properties for sale across Uganda.' },
  ];

  for (const landlord of landlords) {
    for (const notif of notificationTypes) {
      await db.notification.create({
        data: {
          type: notif.type,
          title: notif.title,
          message: notif.message,
          userId: landlord.id,
          read: Math.random() > 0.5,
        },
      });
    }
  }

  console.log('✅ Seeding completed!');
  console.log(`  - ${AMENITIES.length} amenities`);
  console.log(`  - ${5 + landlords.length + tenants.length} users`);
  console.log(`  - ${PROPERTIES.length + 1} properties (rent + sale + land)`);
  console.log(`  - Sample favorites, inquiries, reviews, and notifications`);
}

seed()
  .catch(console.error)
  .finally(() => db.$disconnect());
