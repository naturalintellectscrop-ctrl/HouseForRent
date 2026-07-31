import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/**
 * The append-only audit log (NFR-2).
 *
 * ── Deliberately NOT @Global ──
 * Global registration was tried first and rejected. It makes `AuditService`
 * resolvable anywhere, which sounds convenient but hides the dependency: a
 * module that needs auditing then looks, from its own definition, like a
 * module that does not. Worse, it only resolves when the global module
 * happens to be in the graph — so a narrower composition (a test module, a
 * future worker process) silently loses auditing at runtime rather than
 * failing to build.
 *
 * Explicit imports make the dependency visible in every consumer, and make
 * a missing one a loud DI error at startup instead of a quietly incomplete
 * audit trail.
 */
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
