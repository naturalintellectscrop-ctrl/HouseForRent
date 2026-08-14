import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Prisma.TransactionClient;

/**
 * The append-only audit log (NFR-2, Data_Model.md §10.2).
 *
 * ── What must be logged ──
 * NFR-2 names four categories exactly: money events, verification events,
 * consent, and configuration changes. `AuditEventType` enumerates them
 * rather than accepting free-text, so a caller cannot invent a category
 * that no query will ever look for, and so the set is auditable by reading
 * this file.
 *
 * ── Why it takes a transaction client ──
 * An audit row written outside the transaction that caused it can survive a
 * rollback, claiming an event that never happened — or be lost when the
 * event did. Every writer here passes its own `tx`, so the record and the
 * fact commit together or not at all (Technical Architecture §8).
 *
 * ── Why it never throws into the caller's path ──
 * It does. Deliberately. A swallowed audit failure is an audit log that is
 * quietly incomplete, which is worse than a failed money operation: the
 * former is undetectable. `audit_event` is 🔒 immutable at the database
 * level, so a written row cannot later be edited or removed.
 */

export type AuditEventType =
  // money (NFR-2, FR-7.x)
  | 'escrow_funded'
  | 'commission_earned'
  | 'deal_settled'
  | 'deal_refunded'
  | 'psp_instruction_issued'
  // verification (NFR-2, FR-3.x, FR-5.5)
  | 'identity_verified'
  | 'listing_verified'
  | 'mandate_decided'
  | 'listing_published'
  // consent (NFR-3, DPA 2019)
  | 'consent_recorded'
  // configuration (FR-10.1)
  | 'config_version_created'
  | 'commission_rate_version_created'
  // agreements (FR-9.1)
  | 'listing_agreement_accepted';

export interface AuditRecord {
  eventType: AuditEventType;
  /** Who caused it. Always a resolved party, never a client claim. */
  actorPartyId: string;
  /** What it was about — a deal id, listing id, config key. */
  subjectRef?: string;
  /**
   * Structured detail. Must carry NO raw personal data (NFR-3): amounts,
   * states and identifiers only. `assertNoPii` enforces the obvious cases.
   */
  payload?: Record<string, unknown>;
  occurredAt?: Date;
}

/** Keys that must never appear in an audit payload (NFR-3, DPA 2019). */
const FORBIDDEN_PAYLOAD_KEYS = [
  'nin',
  'password',
  'passwordhash',
  'selfie',
  'selfieref',
  'primaryphone',
  'phone',
  'refreshtoken',
  'accesstoken',
];

export class AuditPayloadContainsPiiError extends Error {
  constructor(key: string) {
    super(
      `audit payload carries "${key}", which is personal or secret data. The ` +
        'audit log records that something happened and to which record — not ' +
        'the contents of anyone\'s identity documents (NFR-2, NFR-3).',
    );
    this.name = 'AuditPayloadContainsPiiError';
  }
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Writes one audit row. Pass `tx` whenever the event belongs to a
   * transaction — which, for every money event, it does.
   */
  async record(entry: AuditRecord, tx?: Tx) {
    assertNoPii(entry.payload);
    const client = tx ?? this.prisma;

    return client.auditEvent.create({
      data: {
        eventType: entry.eventType,
        actorPartyId: entry.actorPartyId,
        subjectRef: entry.subjectRef,
        payload: (entry.payload ?? undefined) as Prisma.InputJsonValue,
        occurredAt: entry.occurredAt ?? new Date(),
      },
    });
  }

  /** The trail for one subject — a deal, a listing, a config key. */
  async forSubject(subjectRef: string) {
    return this.prisma.auditEvent.findMany({
      where: { subjectRef },
      orderBy: { occurredAt: 'asc' },
    });
  }

  async byType(eventType: AuditEventType, since?: Date) {
    return this.prisma.auditEvent.findMany({
      where: {
        eventType,
        ...(since ? { occurredAt: { gte: since } } : {}),
      },
      orderBy: { occurredAt: 'desc' },
    });
  }
}

export function assertNoPii(payload?: Record<string, unknown>) {
  if (!payload) return;
  for (const key of Object.keys(payload)) {
    if (FORBIDDEN_PAYLOAD_KEYS.includes(key.toLowerCase())) {
      throw new AuditPayloadContainsPiiError(key);
    }
  }
}
