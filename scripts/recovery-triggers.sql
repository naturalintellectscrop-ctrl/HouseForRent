-- Append-only wall + viewing-evidence guard DDL — captured READ-ONLY from the PRODUCTION catalog
-- on 2026-11-11 via pg_get_triggerdef / pg_get_functiondef (Round 69, first verified production backup).
--
-- Apply AFTER the data load when building a recovery target (supplements
-- scripts/recovery-out-of-band-tables.sql). Applying after load is deliberate:
-- viewing_conducted_requires_evidence fires on INSERT and would reject a restored
-- 'conducted' viewing whose evidence rows load later in the topo order. The Prisma
-- datamodel does NOT carry any of this: without it a recovery DB accepts UPDATE/DELETE
-- on the ten append-only tables at the DB level and permits unevidenced conducted viewings.
--
-- Owned by no migration. If these objects ever move into the migrations ledger, delete this file.

-- Append-only wall + evidence-guard DDL captured READ-ONLY from the production catalog 2026-11-11 (Round 69).
-- Via pg_get_triggerdef / pg_get_functiondef during the first verified production backup run.
-- Apply AFTER the Prisma-datamodel schema when building a recovery target (supplements
-- scripts/recovery-out-of-band-tables.sql). The app-level schema does NOT carry these:
-- without them a recovery DB accepts UPDATE/DELETE on the append-only tables at the DB level.

-- ===== function: enforce_conducted_viewing_evidence =====
CREATE OR REPLACE FUNCTION public.enforce_conducted_viewing_evidence()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$


-- ===== function: reject_mutation =====
CREATE OR REPLACE FUNCTION public.reject_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  RAISE EXCEPTION
    'table "%" is immutable: % is not permitted on existing rows (corrections must be new rows)',
    TG_TABLE_NAME, TG_OP;
END;
$function$


-- ===== function: rls_auto_enable =====
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$


-- audit_event :: audit_event_immutable
CREATE TRIGGER audit_event_immutable BEFORE DELETE OR UPDATE ON public.audit_event FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- commission_rate_version :: commission_rate_version_immutable
CREATE TRIGGER commission_rate_version_immutable BEFORE DELETE OR UPDATE ON public.commission_rate_version FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- config_version :: config_version_immutable
CREATE TRIGGER config_version_immutable BEFORE DELETE OR UPDATE ON public.config_version FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- consent_record :: consent_record_immutable
CREATE TRIGGER consent_record_immutable BEFORE DELETE OR UPDATE ON public.consent_record FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- deal_transition :: deal_transition_immutable
CREATE TRIGGER deal_transition_immutable BEFORE DELETE OR UPDATE ON public.deal_transition FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- introduction_record :: introduction_record_immutable
CREATE TRIGGER introduction_record_immutable BEFORE DELETE OR UPDATE ON public.introduction_record FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- ledger_entry :: ledger_entry_immutable
CREATE TRIGGER ledger_entry_immutable BEFORE DELETE OR UPDATE ON public.ledger_entry FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- listing_agreement :: listing_agreement_immutable
CREATE TRIGGER listing_agreement_immutable BEFORE DELETE OR UPDATE ON public.listing_agreement FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- psp_instruction :: psp_instruction_immutable
CREATE TRIGGER psp_instruction_immutable BEFORE DELETE OR UPDATE ON public.psp_instruction FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- psp_instruction_event :: psp_instruction_event_immutable
CREATE TRIGGER psp_instruction_event_immutable BEFORE DELETE OR UPDATE ON public.psp_instruction_event FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- viewing :: viewing_conducted_requires_evidence
CREATE TRIGGER viewing_conducted_requires_evidence BEFORE INSERT OR UPDATE ON public.viewing FOR EACH ROW EXECUTE FUNCTION enforce_conducted_viewing_evidence();
