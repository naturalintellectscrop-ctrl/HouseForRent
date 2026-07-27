export default function StructuredData() {
  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'House For Rent',
    alternateName: 'HouseForRent',
    url: 'https://houseforrent.co.ug',
    logo: 'https://houseforrent.co.ug/logo.png',
    description:
      "Uganda's #1 Rental Platform. Find your perfect rental home in Uganda. Discover thousands of rental properties across Uganda.",
    email: 'gthebanks@gmail.com',
    telephone: '+256752255676',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Kampala',
      addressCountry: 'UG',
    },
    sameAs: [],
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: '+256752255676',
      contactType: 'customer service',
      email: 'gthebanks@gmail.com',
      availableLanguage: ['English'],
    },
    brand: {
      '@type': 'Brand',
      name: 'House For Rent',
      logo: 'https://houseforrent.co.ug/logo.png',
    },
  };

  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'House For Rent',
    alternateName: 'HouseForRent',
    url: 'https://houseforrent.co.ug',
    description:
      "Uganda's #1 Rental Platform - Find rental properties across Uganda",
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: 'https://houseforrent.co.ug/?search={search_term_string}',
      },
      'query-input': 'required name=search_term_string',
    },
  };

  const realEstateAgentSchema = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateAgent',
    name: 'House For Rent',
    description:
      "Uganda's leading rental property platform connecting landlords with tenants across Uganda. From cozy bedsitters to luxurious villas.",
    url: 'https://houseforrent.co.ug',
    telephone: '+256752255676',
    email: 'gthebanks@gmail.com',
    image: 'https://houseforrent.co.ug/logo.png',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Kampala',
      addressCountry: 'UG',
    },
    areaServed: {
      '@type': 'Country',
      name: 'Uganda',
    },
    priceRange: 'UGX 50,000 - UGX 50,000,000',
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(organizationSchema),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(websiteSchema),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(realEstateAgentSchema),
        }}
      />
    </>
  );
}
