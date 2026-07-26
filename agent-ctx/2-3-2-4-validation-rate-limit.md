# Task 2-3 and 2-4: Validation & Rate Limiting

## Summary
Added Zod validation to all API routes and created in-memory rate limiting middleware.

## Changes Made

### New Files
1. **`/src/lib/validations.ts`** — Shared Zod schemas and `validateBody` helper
2. **`/src/middleware.ts`** — Rate limiting middleware for all API routes

### Modified Files (Zod validation added)
1. `/src/app/api/auth/register/route.ts` — registerSchema
2. `/src/app/api/auth/login/route.ts` — loginSchema
3. `/src/app/api/properties/route.ts` — propertyCreateSchema (POST only)
4. `/src/app/api/inquiries/route.ts` — messageSendSchema (POST), inquiryMarkReadSchema (PUT)
5. `/src/app/api/properties/[id]/inquiries/route.ts` — inquiryCreateSchema (POST)
6. `/src/app/api/reviews/route.ts` — reviewCreateSchema (POST)
7. `/src/app/api/users/profile/route.ts` — profileUpdateSchema (PUT)
8. `/src/app/api/saved-searches/route.ts` — savedSearchCreateSchema (POST)

### Rate Limiting Configuration
- Auth routes: 5 req/min
- Upload routes: 20 req/min
- Property routes: 10 req/min
- General API: 60 req/min

## Lint Status
Clean — no errors
