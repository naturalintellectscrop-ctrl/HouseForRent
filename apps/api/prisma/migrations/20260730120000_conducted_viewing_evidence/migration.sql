-- Database-level enforcement of the Data_Model.md §5.1 invariant:
--
--   "A viewing cannot move to `conducted` without (a) an introduction_record
--    and (b) a field_report (FR-5.3, FR-5.4)."
--
-- ViewingsService.conduct() already enforces this. That is not enough, for
-- the same reason it was not enough for the 🔒 tables in
-- 20260727150100_immutable_tables: an introduction record is EVIDENCE. If
-- any write path that bypasses the service — a manual fix, a future bug, an
-- ad-hoc script, a test fixture — can produce a `conducted` viewing with no
-- evidence behind it, then "every conducted viewing produced an introduction
-- record" stops being a fact about the data and becomes a fact about one
-- code path. The circumvention clause is only enforceable if the former.
--
-- Note the ordering this implies for any caller: the introduction record and
-- field report must be INSERTed before the status flips. Inside a single
-- transaction (which is how conduct() does it) both are visible to the
-- trigger, so the whole thing still commits or rolls back as one.

-- Repair any pre-existing violation before the trigger takes effect. A row
-- claiming a viewing was conducted with no evidence to show for it is
-- DEMOTED, not deleted — nothing real is lost, and in any database where the
-- service was the only writer this matches zero rows.
UPDATE "viewing" v
SET status = 'scheduled'
WHERE v.status = 'conducted'
  AND (
    NOT EXISTS (SELECT 1 FROM "introduction_record" i WHERE i.viewing_id = v.id)
    OR NOT EXISTS (SELECT 1 FROM "field_report" f WHERE f.viewing_id = v.id)
  );

CREATE OR REPLACE FUNCTION enforce_conducted_viewing_evidence()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'conducted' THEN
    IF NOT EXISTS (
      SELECT 1 FROM "introduction_record" WHERE viewing_id = NEW.id
    ) THEN
      RAISE EXCEPTION
        'viewing % cannot be conducted: no introduction_record exists (FR-5.3, Data_Model.md 5.1)',
        NEW.id
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM "field_report" WHERE viewing_id = NEW.id
    ) THEN
      RAISE EXCEPTION
        'viewing % cannot be conducted: no field_report exists (FR-5.4, Data_Model.md 5.1)',
        NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS viewing_conducted_requires_evidence ON "viewing";
CREATE TRIGGER viewing_conducted_requires_evidence
  BEFORE INSERT OR UPDATE ON "viewing"
  FOR EACH ROW EXECUTE FUNCTION enforce_conducted_viewing_evidence();
