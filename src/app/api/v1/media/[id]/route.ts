import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { db } from '@/lib/db';
import { route } from '@/server/http';

/**
 * GET /api/v1/media/:id - byte-serving for stored media.
 *
 * MEDIA_ROOT behaves as DEPLOYMENT.md §2.3 describes: files live on disk,
 * the row names the file and carries its own provenance (field_officer |
 * lister | development_fixture). The client renders the label; it never
 * decides it.
 */
export const GET = route(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const asset = await db.mediaAsset.findUnique({ where: { id } });
  if (!asset) {
    return NextResponse.json({ error: { code: 'MEDIA_NOT_FOUND', message: 'no such media' } }, { status: 404 });
  }

  const root = process.env.MEDIA_ROOT ?? path.join(process.cwd(), 'media');
  try {
    const bytes = await readFile(path.join(root, asset.storageRef));
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': asset.mimeType ?? 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json({ error: { code: 'MEDIA_GONE', message: 'media file missing on disk' } }, { status: 404 });
  }
});
