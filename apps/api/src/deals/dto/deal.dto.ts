import { Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';

/**
 * Money arrives as a STRING of integer shillings (API Spec §2) and is
 * validated to be exactly that before any BigInt conversion. A JSON number
 * would lose precision above 2^53; a loosely-typed string would throw deep
 * inside `BigInt()` with an unhelpful error.
 *
 * Note what none of these DTOs accept: no `status`, no `commissionAmount`,
 * no rate, no `partyId`. The global ValidationPipe uses
 * `forbidNonWhitelisted`, so sending one is a 400 rather than a silently
 * ignored field.
 */
const SHILLINGS = /^[0-9]+$/;

export class TransitionDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

/**
 * Creating a deal. ONE field, and it names no person.
 *
 * `introductionRecordId` already resolves, server-side, to the tenant, the
 * landlord, the listing and the officer. There is deliberately no
 * `tenantPartyId`, `landlordPartyId` or `listingId` here: a body that cannot
 * express a party cannot be tampered with to name a different one, so the
 * safety is structural rather than a validation rule someone must remember
 * to keep.
 *
 * `forbidNonWhitelisted` means adding one to the request is a 400, not a
 * silently ignored field — asserted by test.
 */
export class CreateDealDto {
  @IsString()
  @IsNotEmpty()
  introductionRecordId!: string;
}

/**
 * Signing. The agreement is DERIVED, not required (F-014).
 *
 * ── Why this became optional ──
 * `agreementId` was mandatory and no client could obtain one. There is no
 * route that lists a listing's agreements; the id existed only in the
 * database and in test fixtures, so the one transition that freezes the
 * commission snapshot was unreachable from any real surface — the same
 * shape of defect as F-001 and F-002.
 *
 * It is derivable without ambiguity: a listing cannot be published without
 * exactly one ACCEPTED agreement (the publish gate enforces that), and a
 * deal is created from an introduction on one listing. So the server looks
 * it up rather than asking a client to know something it cannot know.
 *
 * It remains ACCEPTED but optional, for the operations console: an admin
 * acting on a listing that has more than one accepted agreement in its
 * history can name which. A supplied id is verified to belong to this
 * deal's listing before anything is frozen — it narrows the choice, it can
 * never widen it to another landlord's terms.
 */
export class SignAgreementDto extends TransitionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  agreementId?: string;
}

export class PaymentAccountDto {
  @IsString()
  @IsNotEmpty()
  accountRef!: string;

  @IsIn(['mtn_momo', 'airtel_money', 'bank_transfer'])
  method!: 'mtn_momo' | 'airtel_money' | 'bank_transfer';
}

/**
 * Funding. The amount is DERIVED server-side from the deal's own signed
 * terms (F-012); this field is TRANSITIONAL.
 *
 * The mobile app still asks the tenant to type a figure. Until that is
 * replaced by the server-stated total (F-013), a supplied amount is checked
 * against the derived one and REJECTED on mismatch — silently booking a
 * different number from the one the tenant was shown is the error class this
 * change exists to end. It is never the source of truth, and it goes away.
 */
export class FundEscrowDto extends TransitionDto {
  @IsOptional()
  @Matches(SHILLINGS, {
    message: 'amount must be a string of integer shillings, e.g. "4000000"',
  })
  amount?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentAccountDto)
  tenantAccount?: PaymentAccountDto;
}

/**
 * Settlement names no amount. What the landlord receives is the deal's
 * OUTSTANDING escrow liability, read inside the settling transaction — the
 * commission has already been debited out of it, so the remainder is the net
 * (F-012, FR-7.6).
 */
export class SettleDto extends TransitionDto {

  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentAccountDto)
  landlordAccount?: PaymentAccountDto;
}

/**
 * A refund names no amount either. "Full refund of tenant funds" (FR-7.7) is
 * what the ledger says we still hold, not a figure a request can assert.
 */
export class RefundDto extends TransitionDto {

  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentAccountDto)
  tenantAccount?: PaymentAccountDto;
}

export class CancelDealDto extends TransitionDto {}

export class DisputeHoldDto extends TransitionDto {}
