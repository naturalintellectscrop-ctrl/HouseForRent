# Task 2-2: Error Boundaries and Not-Found Page

## Summary
Created three essential Next.js App Router special files to handle error states gracefully.

## Files Created

### 1. `/src/app/error.tsx` — Global Error Boundary
- Client component (`'use client'`) that catches runtime errors
- Logs errors to console via `useEffect`
- Shows friendly UI with AlertTriangle icon in red circle
- Displays error message and digest in development mode only
- Provides "Try Again" (calls `reset()`) and "Go Home" buttons

### 2. `/src/app/not-found.tsx` — 404 Page
- Server component for unmatched routes
- Shows 404 heading, "Page Not Found" subtitle, descriptive message
- Search icon in cyan circle
- "Go Home" and "Go Back" (uses `window.history.back()`) buttons

### 3. `/src/app/loading.tsx` — Global Loading State
- Server component shown during route transitions
- Animated Loader2 spinner with "Loading..." text
- Uses red-600 brand color for spinner

## Verification
- `bun run lint` passed with no errors
- All components use shadcn/ui Button and Lucide icons (consistent with project)
