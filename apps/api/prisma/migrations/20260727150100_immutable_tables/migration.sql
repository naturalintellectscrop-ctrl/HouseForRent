-- Database-level enforcement of the 🔒 (immutable) tables from
-- Data_Model.md §12 rule 3. Service-layer discipline alone is insufficient
-- for the financial source of truth: any write path that bypasses the
-- service (a manual fix, a future bug, an ad-hoc script) must still be
-- rejected. A single shared trigger function is attached to every immutable
-- table so an UPDATE or DELETE on an already-written row raises an
-- exception regardless of which DB role or code path attempts it.
-- Corrections are new rows (e.g. a reversing ledger posting), never edits.

CREATE OR REPLACE FUNCTION reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'table "%" is immutable: % is not permitted on existing rows (corrections must be new rows)',
    TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

-- consent_record: consent is a historical fact; withdrawal is a new row.
CREATE TRIGGER consent_record_immutable
  BEFORE UPDATE OR DELETE ON "consent_record"
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- config_version: a config change is a new version, never an edit.
CREATE TRIGGER config_version_immutable
  BEFORE UPDATE OR DELETE ON "config_version"
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- commission_rate_version: a rate change is a new version; in-flight deals
-- hold a snapshot and are structurally immune (FR-7.4).
CREATE TRIGGER commission_rate_version_immutable
  BEFORE UPDATE OR DELETE ON "commission_rate_version"
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- introduction_record: circumvention evidence; persists independently of the deal.
CREATE TRIGGER introduction_record_immutable
  BEFORE UPDATE OR DELETE ON "introduction_record"
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- deal_transition: full auditable state history of the deal.
CREATE TRIGGER deal_transition_immutable
  BEFORE UPDATE OR DELETE ON "deal_transition"
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- ledger_entry: the single source of financial truth. Balanced postings are
-- corrected only by a new reversing posting_id, never by editing a posted row.
CREATE TRIGGER ledger_entry_immutable
  BEFORE UPDATE OR DELETE ON "ledger_entry"
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- psp_instruction: the idempotent boundary to the external custodian.
CREATE TRIGGER psp_instruction_immutable
  BEFORE UPDATE OR DELETE ON "psp_instruction"
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- listing_agreement: originates the rate snapshot; immutable once accepted.
CREATE TRIGGER listing_agreement_immutable
  BEFORE UPDATE OR DELETE ON "listing_agreement"
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- audit_event: append-only log (NFR-2).
CREATE TRIGGER audit_event_immutable
  BEFORE UPDATE OR DELETE ON "audit_event"
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
