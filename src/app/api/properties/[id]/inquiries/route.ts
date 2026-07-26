import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { inquiryCreateSchema, validateBody } from '@/lib/validations';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession(request);
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;
    const property = await db.property.findUnique({ where: { id } });
    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }

    if (property.landlordId !== user.id && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const inquiries = await db.inquiry.findMany({
      where: { propertyId: id },
      include: {
        tenant: { select: { id: true, name: true, avatar: true, email: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(inquiries);
  } catch (error) {
    console.error('Inquiries fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession(request);
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;
    const property = await db.property.findUnique({ where: { id } });
    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }

    const body = await request.json();
    const validation = validateBody(inquiryCreateSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { message } = validation.data;

    const inquiry = await db.inquiry.create({
      data: {
        message,
        tenantId: user.id,
        propertyId: id,
        status: 'PENDING',
      },
      include: {
        tenant: { select: { id: true, name: true, avatar: true } },
      },
    });

    // Create the first message in the thread
    await db.message.create({
      data: {
        content: message,
        senderId: user.id,
        receiverId: property.landlordId,
        inquiryId: inquiry.id,
      },
    });

    return NextResponse.json(inquiry, { status: 201 });
  } catch (error) {
    console.error('Inquiry creation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
