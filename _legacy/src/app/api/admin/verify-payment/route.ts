import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function PUT(request: NextRequest) {
  try {
    const user = await getSession(request);
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { propertyId, paymentStatus } = await request.json();
    if (!propertyId || !paymentStatus) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!['PAID', 'PENDING_VERIFICATION', 'UNPAID'].includes(paymentStatus)) {
      return NextResponse.json({ error: 'Invalid payment status' }, { status: 400 });
    }

    const property = await db.property.update({
      where: { id: propertyId },
      data: { paymentStatus },
    });

    return NextResponse.json(property);
  } catch (error) {
    console.error('Payment verification error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
