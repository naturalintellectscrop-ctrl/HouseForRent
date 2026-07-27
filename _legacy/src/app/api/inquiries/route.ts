import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { messageSendSchema, inquiryMarkReadSchema, validateBody } from '@/lib/validations';

export async function GET(request: NextRequest) {
  try {
    const user = await getSession(request);
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    let inquiries;
    if (user.role === 'TENANT') {
      inquiries = await db.inquiry.findMany({
        where: { tenantId: user.id },
        include: {
          property: {
            include: {
              images: { orderBy: { order: 'asc' }, take: 1 },
              landlord: { select: { id: true, name: true, avatar: true } },
            },
          },
          messages: {
            orderBy: { createdAt: 'asc' },
            include: {
              sender: { select: { id: true, name: true, avatar: true } },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      });
    } else {
      // Landlord - get inquiries for their properties
      inquiries = await db.inquiry.findMany({
        where: {
          property: { landlordId: user.id },
        },
        include: {
          tenant: { select: { id: true, name: true, avatar: true, email: true } },
          property: {
            include: {
              images: { orderBy: { order: 'asc' }, take: 1 },
            },
          },
          messages: {
            orderBy: { createdAt: 'asc' },
            include: {
              sender: { select: { id: true, name: true, avatar: true } },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      });
    }

    return NextResponse.json(inquiries);
  } catch (error) {
    console.error('Inquiries fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession(request);
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const validation = validateBody(messageSendSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { inquiryId, content } = validation.data;

    const inquiry = await db.inquiry.findUnique({
      where: { id: inquiryId },
      include: { property: true },
    });

    if (!inquiry) {
      return NextResponse.json({ error: 'Inquiry not found' }, { status: 404 });
    }

    // Verify user is part of this inquiry
    const isParticipant = user.id === inquiry.tenantId || user.id === inquiry.property.landlordId;
    if (!isParticipant) {
      return NextResponse.json({ error: 'Not authorized to send messages in this inquiry' }, { status: 403 });
    }

    // Determine receiver
    const receiverId = user.id === inquiry.tenantId
      ? inquiry.property.landlordId
      : inquiry.tenantId;

    const message = await db.message.create({
      data: {
        content,
        senderId: user.id,
        receiverId,
        inquiryId,
      },
      include: {
        sender: { select: { id: true, name: true, avatar: true } },
      },
    });

    // Update inquiry status
    await db.inquiry.update({
      where: { id: inquiryId },
      data: { status: 'REPLIED' },
    });

    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    console.error('Message send error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getSession(request);
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const validation = validateBody(inquiryMarkReadSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { inquiryId } = validation.data;

    // Mark all unread messages in this inquiry as read
    await db.message.updateMany({
      where: {
        inquiryId,
        receiverId: user.id,
        read: false,
      },
      data: { read: true },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Mark read error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
