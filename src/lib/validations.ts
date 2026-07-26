import { z } from 'zod';

// Auth schemas
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(128, 'Password too long'),
  role: z.enum(['TENANT', 'LANDLORD']).optional(),
  phone: z.string().max(20).optional(),
});

// Property schemas
export const propertyCreateSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().min(10, 'Description must be at least 10 characters').max(5000),
  price: z.string().min(1, 'Price is required'),
  location: z.string().optional(),
  address: z.string().min(1, 'Address is required').max(300),
  city: z.string().min(1, 'City is required').max(100),
  bedrooms: z.string().optional(),
  bathrooms: z.string().optional(),
  propertyType: z.enum(['APARTMENT', 'HOUSE', 'VILLA', 'STUDIO', 'CONDO', 'TOWNHOUSE', 'BUNGALOW', 'BEDSITTER', 'LAND']),
  area: z.string().min(1, 'Area is required'),
  furnished: z.boolean().optional(),
  parking: z.boolean().optional(),
  petsAllowed: z.boolean().optional(),
  yearBuilt: z.string().optional(),
  floor: z.string().optional(),
  totalFloors: z.string().optional(),
  listingType: z.enum(['RENT', 'SALE', 'BOTH']).optional(),
  landTitleType: z.enum(['READY_TITLE', 'AGREEMENT', 'MILE_LAND', 'CROWN_LAND']).optional().nullable(),
  paymentReference: z.string().max(100).optional(),
  images: z.array(z.object({
    url: z.string().url('Invalid image URL'),
    caption: z.string().max(200).optional(),
    isPrimary: z.boolean().optional(),
  })).max(5, 'Maximum 5 images allowed').optional(),
  amenityIds: z.array(z.string()).optional(),
});

export const propertyUpdateSchema = propertyCreateSchema.partial();

// Inquiry creation schema (for /api/properties/[id]/inquiries)
export const inquiryCreateSchema = z.object({
  message: z.string().min(1, 'Message is required').max(2000, 'Message too long'),
});

// Message send schema (for /api/inquiries POST - sending messages in existing inquiry)
export const messageSendSchema = z.object({
  inquiryId: z.string().min(1, 'Inquiry ID is required'),
  content: z.string().min(1, 'Message content is required').max(2000, 'Message too long'),
});

// Inquiry mark-read schema (for /api/inquiries PUT)
export const inquiryMarkReadSchema = z.object({
  inquiryId: z.string().min(1, 'Inquiry ID is required'),
});

// Review schema
export const reviewCreateSchema = z.object({
  rating: z.number().int().min(1, 'Rating must be at least 1').max(5, 'Rating must be at most 5'),
  comment: z.string().min(1, 'Comment is required').max(1000, 'Comment too long'),
  propertyId: z.string().min(1, 'Property ID is required'),
});

// Profile update schema
export const profileUpdateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100).optional(),
  phone: z.string().max(20).optional(),
  bio: z.string().max(500).optional(),
  avatar: z.string().url().optional().or(z.literal('')),
});

// Saved search schema
export const savedSearchCreateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  searchQuery: z.string().optional(),
  city: z.string().optional(),
  propertyType: z.string().optional(),
  minPrice: z.number().optional(),
  maxPrice: z.number().optional(),
  bedrooms: z.number().optional(),
  furnished: z.boolean().optional(),
  parking: z.boolean().optional(),
  petsAllowed: z.boolean().optional(),
});

// Contact form schema
export const contactFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email'),
  subject: z.string().min(1, 'Subject is required').max(200),
  message: z.string().min(1, 'Message is required').max(2000),
});

// Helper to validate and return error response
export function validateBody<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  // Zod v4 uses 'issues', Zod v3 uses 'errors' — support both
  const issues = (result.error as any).issues || (result.error as any).errors || [];
  const firstError = issues[0];
  return { success: false, error: firstError?.message || result.error.message || 'Validation failed' };
}
