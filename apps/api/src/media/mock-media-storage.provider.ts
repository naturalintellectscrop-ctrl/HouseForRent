import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  MediaStorageProvider,
  StoreRequest,
  StoredMedia,
  StoredVariant,
} from './interfaces/media-storage-provider.interface';

/**
 * Stands in for the real object store until procurement completes (SSOT §8).
 *
 * It is a genuine test double, not a stub that always says yes:
 *   - it actually SHRINKS each rung, modelling a real encoder: the produced
 *     size is min(source, ceiling), so a small source is not inflated and a
 *     large one is genuinely capped;
 *   - it fails deterministically for source refs containing '-fail', so the
 *     capture failure path is exercisable;
 *   - it can be told to misbehave via `breakCompression()`, which makes it
 *     return an oversized variant — the only way to prove MediaService's
 *     post-condition check is load-bearing rather than decorative.
 *
 * Being in-memory, its state resets per process — appropriate for a mock,
 * and a reason no business logic may depend on it beyond tests.
 */
@Injectable()
export class MockMediaStorageProvider implements MediaStorageProvider {
  private readonly stored = new Map<string, StoredVariant[]>();
  private compressionBroken = false;

  async store(request: StoreRequest): Promise<StoredMedia> {
    if (request.sourceRef.includes('-fail')) {
      throw new Error(
        `media storage rejected source ${request.sourceRef} (mock deterministic failure)`,
      );
    }

    const storageRef = `mock://media/${randomUUID()}`;

    const variants: StoredVariant[] = request.variants.map((spec) => ({
      name: spec.name,
      variantRef: `${storageRef}#${spec.name}`,
      // A real encoder cannot make a file bigger than its ceiling, and does
      // not pad a already-small source up to it.
      byteSize: this.compressionBroken
        ? spec.maxBytes + 1
        : Math.min(request.sourceByteSize, spec.maxBytes),
    }));

    this.stored.set(storageRef, variants);
    return { storageRef, variants };
  }

  async variantsFor(storageRef: string): Promise<StoredVariant[]> {
    return this.stored.get(storageRef) ?? [];
  }

  /**
   * Test-only. Makes the next store() emit variants one byte over their
   * ceiling, so the service's post-condition can be shown to fail when the
   * provider misbehaves.
   */
  breakCompression(broken = true) {
    this.compressionBroken = broken;
  }
}
