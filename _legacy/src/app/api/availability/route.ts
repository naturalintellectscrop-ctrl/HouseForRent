import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

// In-memory storage for bookings
const bookings: Record<string, Array<{ date: string; timeSlot: string; userId: string; userName: string; propertyId: string; createdAt: string }>> = {};

// Available time slots template
const ALL_TIME_SLOTS = [
  '9:00 AM', '10:00 AM', '11:00 AM',
  '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM',
];

// Generate mock available dates for the next 60 days
function generateMockAvailability(propertyId: string) {
  const availableDates: Record<string, string[]> = {};
  const today = new Date();

  for (let i = 1; i <= 60; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    // Skip Sundays (0) - not available for viewing
    if (date.getDay() === 0) continue;

    const dateStr = date.toISOString().split('T')[0];

    // Randomly make some dates unavailable (about 20% chance)
    const seed = hashCode(propertyId + dateStr);
    if (seed % 5 === 0) continue;

    // Determine available time slots
    // Some dates have fewer slots (e.g., Saturday has fewer)
    const isSaturday = date.getDay() === 6;
    const baseSlots = isSaturday
      ? ['9:00 AM', '10:00 AM', '11:00 AM']
      : [...ALL_TIME_SLOTS];

    // Remove some slots based on bookings
    const dateBookings = bookings[dateStr]?.filter(b => b.propertyId === propertyId) || [];
    const bookedSlots = dateBookings.map(b => b.timeSlot);
    const availableSlots = baseSlots.filter(s => !bookedSlots.includes(s));

    // Also randomly remove 1-2 slots for variety
    const slotSeed = hashCode(propertyId + dateStr + 'slots');
    const slotsToRemove = slotSeed % 3; // 0, 1, or 2
    const filteredSlots = availableSlots.filter((_, idx) => {
      if (idx < slotsToRemove && availableSlots.length > 2) return false;
      return true;
    });

    if (filteredSlots.length > 0) {
      availableDates[dateStr] = filteredSlots;
    }
  }

  return availableDates;
}

// Simple hash function for deterministic "randomness"
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

// GET /api/availability?propertyId=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get('propertyId');

    if (!propertyId) {
      return NextResponse.json({ error: 'Property ID is required' }, { status: 400 });
    }

    const availableDates = generateMockAvailability(propertyId);

    return NextResponse.json({
      propertyId,
      availableDates,
      timeSlots: ALL_TIME_SLOTS,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch availability' }, { status: 500 });
  }
}

// POST /api/availability - Book a viewing slot
export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { propertyId, date, timeSlot } = body;

    if (!propertyId || !date || !timeSlot) {
      return NextResponse.json({ error: 'Property ID, date, and time slot are required' }, { status: 400 });
    }

    // Validate date is in the future
    const selectedDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selectedDate <= today) {
      return NextResponse.json({ error: 'Date must be in the future' }, { status: 400 });
    }

    // Check if slot is still available
    const availability = generateMockAvailability(propertyId);
    const availableSlots = availability[date];
    if (!availableSlots || !availableSlots.includes(timeSlot)) {
      return NextResponse.json({ error: 'This time slot is no longer available' }, { status: 409 });
    }

    // Store booking in memory
    if (!bookings[date]) {
      bookings[date] = [];
    }
    bookings[date].push({
      date,
      timeSlot,
      userId: session.id,
      userName: session.name,
      propertyId,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      booking: {
        date,
        timeSlot,
        propertyId,
        userName: session.name,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to book viewing' }, { status: 500 });
  }
}
