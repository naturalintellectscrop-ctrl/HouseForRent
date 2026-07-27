import { DealStatus } from '@prisma/client';
import {
  ALLOWED_TRANSITIONS,
  assertTransitionAllowed,
  IllegalTransitionError,
  isTransitionAllowed,
  TERMINAL_STATUSES,
} from './deal-state-machine';

const ALL_STATUSES: DealStatus[] = [
  'created',
  'tenant_matched',
  'agreement_signed',
  'escrow_funded',
  'move_in_confirmed',
  'commission_earned',
  'settled',
  'closed',
  'cancelled',
  'refunded',
  'dispute_hold',
];

/**
 * The state machine as specified in Data_Model.md §7.3 (FR-8.1, FR-8.2).
 * Pure-function tests over the transition table.
 */
describe('Deal state machine (Stage 3)', () => {
  describe('THE MOVE-IN GUARANTEE — structural, not a flag (FR-8.2)', () => {
    test('there is NO escrow_funded → settled transition', () => {
      // This single assertion is the guarantee. If it ever passes as `true`,
      // funds could be released to the landlord before the tenant moved in.
      expect(isTransitionAllowed('escrow_funded', 'settled')).toBe(false);
      expect(() => assertTransitionAllowed('escrow_funded', 'settled')).toThrow(
        IllegalTransitionError,
      );
    });

    test('the ONLY value-moving exits from escrow_funded are move_in_confirmed and refunded', () => {
      const exits = [...ALLOWED_TRANSITIONS.escrow_funded];

      // exactly these three, no more: forward, money-back, and the ops hold
      expect(exits.sort()).toEqual(
        ['dispute_hold', 'move_in_confirmed', 'refunded'].sort(),
      );

      // and specifically none of the terminal/settlement states
      expect(exits).not.toContain('settled');
      expect(exits).not.toContain('closed');
      expect(exits).not.toContain('commission_earned');
    });

    test('settlement is reachable ONLY via move_in_confirmed → commission_earned', () => {
      // every status that can reach 'settled' directly
      const canReachSettled = ALL_STATUSES.filter((from) =>
        isTransitionAllowed(from, 'settled'),
      );

      // commission_earned (the legitimate path) and dispute_hold (an ops
      // resolution, which by definition happens after a hold that itself
      // could only be entered from a post-move-in state for settlement to
      // make sense) — nothing else, and crucially not escrow_funded
      expect(canReachSettled.sort()).toEqual(
        ['commission_earned', 'dispute_hold'].sort(),
      );
      expect(canReachSettled).not.toContain('escrow_funded');
    });

    test('commission_earned is reachable ONLY from move_in_confirmed (FR-7.5)', () => {
      const canReachEarned = ALL_STATUSES.filter((from) =>
        isTransitionAllowed(from, 'commission_earned'),
      );
      expect(canReachEarned).toEqual(['move_in_confirmed']);
    });
  });

  describe('the happy path is exactly the sequence §7.3 specifies', () => {
    test('created → tenant_matched → agreement_signed → escrow_funded → move_in_confirmed → commission_earned → settled → closed', () => {
      const path: DealStatus[] = [
        'created',
        'tenant_matched',
        'agreement_signed',
        'escrow_funded',
        'move_in_confirmed',
        'commission_earned',
        'settled',
        'closed',
      ];

      for (let i = 0; i < path.length - 1; i++) {
        expect(isTransitionAllowed(path[i], path[i + 1])).toBe(true);
      }
    });

    test('the happy path cannot be short-circuited — no step may be skipped', () => {
      const path: DealStatus[] = [
        'created',
        'tenant_matched',
        'agreement_signed',
        'escrow_funded',
        'move_in_confirmed',
        'commission_earned',
        'settled',
        'closed',
      ];

      // every non-adjacent forward jump is illegal
      for (let i = 0; i < path.length; i++) {
        for (let j = i + 2; j < path.length; j++) {
          expect(isTransitionAllowed(path[i], path[j])).toBe(false);
        }
      }
    });

    test('no backward transition along the happy path is permitted', () => {
      const path: DealStatus[] = [
        'created',
        'tenant_matched',
        'agreement_signed',
        'escrow_funded',
        'move_in_confirmed',
        'commission_earned',
        'settled',
        'closed',
      ];

      for (let i = path.length - 1; i > 0; i--) {
        for (let j = i - 1; j >= 0; j--) {
          expect(isTransitionAllowed(path[i], path[j])).toBe(false);
        }
      }
    });
  });

  describe('illegal transitions are rejected (FR-8.1)', () => {
    test('terminal statuses permit no transitions at all', () => {
      for (const terminal of TERMINAL_STATUSES) {
        expect(ALLOWED_TRANSITIONS[terminal]).toHaveLength(0);
        for (const to of ALL_STATUSES) {
          expect(isTransitionAllowed(terminal, to)).toBe(false);
        }
      }
    });

    test('a representative set of nonsense transitions all throw', () => {
      const illegal: [DealStatus, DealStatus][] = [
        ['created', 'settled'],
        ['created', 'commission_earned'],
        ['created', 'escrow_funded'],
        ['tenant_matched', 'move_in_confirmed'],
        ['agreement_signed', 'commission_earned'],
        ['escrow_funded', 'settled'], // the guarantee
        ['escrow_funded', 'cancelled'], // the flagged strict reading
        ['move_in_confirmed', 'settled'],
        ['settled', 'escrow_funded'],
        ['closed', 'created'],
        ['refunded', 'settled'],
        ['cancelled', 'tenant_matched'],
      ];

      for (const [from, to] of illegal) {
        expect(isTransitionAllowed(from, to)).toBe(false);
        expect(() => assertTransitionAllowed(from, to)).toThrow(
          IllegalTransitionError,
        );
      }
    });

    test('no status can transition to itself', () => {
      for (const status of ALL_STATUSES) {
        expect(isTransitionAllowed(status, status)).toBe(false);
      }
    });

    test('the error names both the from and to status, for auditability', () => {
      try {
        assertTransitionAllowed('escrow_funded', 'settled');
        throw new Error('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(IllegalTransitionError);
        const typed = err as IllegalTransitionError;
        expect(typed.from).toBe('escrow_funded');
        expect(typed.to).toBe('settled');
        expect(typed.message).toContain('escrow_funded');
        expect(typed.message).toContain('settled');
      }
    });
  });

  describe('cancellation and refund paths (§7.3, FR-7.7)', () => {
    test('pre-funding statuses can be cancelled', () => {
      expect(isTransitionAllowed('created', 'cancelled')).toBe(true);
      expect(isTransitionAllowed('tenant_matched', 'cancelled')).toBe(true);
      expect(isTransitionAllowed('agreement_signed', 'cancelled')).toBe(true);
    });

    test('a FUNDED deal cannot be cancelled — it must route via refunded', () => {
      // Data_Model.md §7.3 row 8's own guard: "if funded → must route via
      // refunded". Allowing a cancel here would strand held client money in
      // a terminal state with no refund posting.
      expect(isTransitionAllowed('escrow_funded', 'cancelled')).toBe(false);
      expect(isTransitionAllowed('escrow_funded', 'refunded')).toBe(true);
    });

    test('refund is reachable only from escrow_funded and dispute_hold', () => {
      const canReachRefunded = ALL_STATUSES.filter((from) =>
        isTransitionAllowed(from, 'refunded'),
      );
      expect(canReachRefunded.sort()).toEqual(
        ['dispute_hold', 'escrow_funded'].sort(),
      );
    });

    test('a post-move-in deal cannot be refunded directly (commission is already earned)', () => {
      expect(isTransitionAllowed('move_in_confirmed', 'refunded')).toBe(false);
      expect(isTransitionAllowed('commission_earned', 'refunded')).toBe(false);
    });
  });

  describe('dispute hold (FR-10.5)', () => {
    test('every active status can be placed on dispute_hold', () => {
      const active: DealStatus[] = [
        'created',
        'tenant_matched',
        'agreement_signed',
        'escrow_funded',
        'move_in_confirmed',
        'commission_earned',
        'settled',
      ];
      for (const status of active) {
        expect(isTransitionAllowed(status, 'dispute_hold')).toBe(true);
      }
    });

    test('terminal statuses cannot be placed on dispute_hold', () => {
      for (const terminal of TERMINAL_STATUSES) {
        expect(isTransitionAllowed(terminal, 'dispute_hold')).toBe(false);
      }
    });

    test('dispute_hold resolves to refunded or settled', () => {
      expect(isTransitionAllowed('dispute_hold', 'refunded')).toBe(true);
      expect(isTransitionAllowed('dispute_hold', 'settled')).toBe(true);
    });
  });

  describe('the table is complete and frozen', () => {
    test('every status has an entry', () => {
      for (const status of ALL_STATUSES) {
        expect(ALLOWED_TRANSITIONS[status]).toBeDefined();
      }
    });

    test('every target status is a real status (no typos)', () => {
      for (const status of ALL_STATUSES) {
        for (const target of ALLOWED_TRANSITIONS[status]) {
          expect(ALL_STATUSES).toContain(target);
        }
      }
    });

    test('the table is frozen at runtime — the graph cannot be mutated to add an illegal edge', () => {
      expect(Object.isFrozen(ALLOWED_TRANSITIONS)).toBe(true);
      // attempting to add the guarantee-breaking edge must not take effect
      expect(() => {
        (ALLOWED_TRANSITIONS as Record<string, unknown>).escrow_funded = [
          'settled',
        ];
      }).toThrow();
      expect(isTransitionAllowed('escrow_funded', 'settled')).toBe(false);
    });
  });
});
