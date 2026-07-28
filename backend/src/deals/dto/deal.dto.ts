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

export class SignAgreementDto extends TransitionDto {
  @IsString()
  @IsNotEmpty()
  agreementId!: string;
}

export class PaymentAccountDto {
  @IsString()
  @IsNotEmpty()
  accountRef!: string;

  @IsIn(['mtn_momo', 'airtel_money', 'bank_transfer'])
  method!: 'mtn_momo' | 'airtel_money' | 'bank_transfer';
}

export class FundEscrowDto extends TransitionDto {
  @Matches(SHILLINGS, {
    message: 'amount must be a string of integer shillings, e.g. "4000000"',
  })
  amount!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentAccountDto)
  tenantAccount?: PaymentAccountDto;
}

export class SettleDto extends TransitionDto {
  @Matches(SHILLINGS, {
    message: 'totalHeld must be a string of integer shillings',
  })
  totalHeld!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentAccountDto)
  landlordAccount?: PaymentAccountDto;
}

export class RefundDto extends TransitionDto {
  @Matches(SHILLINGS, {
    message: 'amount must be a string of integer shillings',
  })
  amount!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentAccountDto)
  tenantAccount?: PaymentAccountDto;
}

export class CancelDealDto extends TransitionDto {}

export class DisputeHoldDto extends TransitionDto {}
