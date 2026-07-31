import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { IllegalTransitionError } from '../deals/deal-state-machine';
import {
  DealNotFoundError,
  MissingIntroductionRecordError,
  SettlementReleaseFailedError,
  SnapshotImmutableError,
} from '../deals/deals.service';
import {
  ListingNotFoundError,
  MissingListingAgreementError,
  MissingMandateError,
  OutsideServiceAreaError,
  UnverifiedListingError,
} from '../listings/listings.service';
import {
  AgreementAlreadyAcceptedError,
  NoCommissionRateInForceError,
  NotTheListerError,
} from '../agreements/agreements.service';
import { UnknownClauseVersionError } from '../agreements/circumvention-clause';
import { AuditPayloadContainsPiiError } from '../audit/audit.service';
import {
  EmptyPostingError,
  InvalidAmountError,
  UnbalancedPostingError,
} from '../ledger/ledger.types';
import { ConfigNotSetError } from '../config/config.service';
import { UnknownScreeningModuleError } from '../screening/screening.service';
import { IllegalViewingTransitionError } from '../viewings/viewing-state-machine';
import {
  FieldReportAlreadyFiledError,
  FieldReportRequiredError,
  ListingNotViewableError,
  NotAFieldOfficerError,
  OutsideServiceCorridorError,
  TenantNotVerifiedError,
  ViewingNotFoundError,
} from '../viewings/viewings.service';
import {
  CompressionPolicyViolationError,
  MediaAssetNotFoundError,
  MediaTooLargeError,
  UnsupportedMediaTypeError,
} from '../media/media.service';

/**
 * Maps domain errors to the status codes of API Spec §2.
 *
 * ── Why a filter rather than try/catch in each handler ──
 * A domain rejection is an ANTICIPATED outcome, not a server fault. Without
 * this mapping every rejected transition would surface as a 500, which is
 * both wrong (the server worked correctly) and dangerous (a monitoring
 * system cannot distinguish "tenant tried something illegal" from "the
 * ledger is broken"). Mapping centrally means a new handler cannot forget.
 *
 * Note that unrecognised errors deliberately fall through to 500 WITHOUT
 * their message being echoed to the client — an unexpected failure in money
 * code should not leak internals to whoever provoked it.
 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      response
        .status(exception.getStatus())
        .json(
          typeof body === 'object'
            ? { error: body }
            : { error: { message: body } },
        );
      return;
    }

    const mapped = this.mapDomainError(exception);
    if (mapped) {
      response.status(mapped.status).json({
        error: { code: mapped.code, message: (exception as Error).message },
      });
      return;
    }

    this.logger.error('unhandled exception', exception as Error);
    response.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'internal server error' },
    });
  }

  private mapDomainError(
    error: unknown,
  ): { status: number; code: string } | null {
    // 409 — legal request, illegal in the current state
    if (error instanceof IllegalTransitionError) {
      return { status: 409, code: 'ILLEGAL_TRANSITION' };
    }
    if (error instanceof SnapshotImmutableError) {
      return { status: 409, code: 'SNAPSHOT_IMMUTABLE' };
    }
    if (error instanceof IllegalViewingTransitionError) {
      return { status: 409, code: 'ILLEGAL_VIEWING_TRANSITION' };
    }
    if (error instanceof FieldReportAlreadyFiledError) {
      return { status: 409, code: 'FIELD_REPORT_ALREADY_FILED' };
    }
    if (error instanceof AgreementAlreadyAcceptedError) {
      return { status: 409, code: 'AGREEMENT_ALREADY_ACCEPTED' };
    }

    // 403 — the caller is the wrong party, and saying so is safe here
    // because they already hold the role and know the listing exists.
    if (error instanceof NotTheListerError) {
      return { status: 403, code: 'NOT_THE_LISTER' };
    }

    // 404 — absent, or not disclosable to this caller
    if (
      error instanceof DealNotFoundError ||
      error instanceof ListingNotFoundError ||
      error instanceof ViewingNotFoundError ||
      error instanceof MediaAssetNotFoundError
    ) {
      return { status: 404, code: 'NOT_FOUND' };
    }

    // 413 / 415 — the capture boundary refused the source outright
    if (error instanceof MediaTooLargeError) {
      return { status: 413, code: 'MEDIA_TOO_LARGE' };
    }
    if (error instanceof UnsupportedMediaTypeError) {
      return { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' };
    }

    // 422 — a domain rule rejected an otherwise well-formed request
    if (error instanceof MissingMandateError) {
      return { status: 422, code: 'MANDATE_REQUIRED' };
    }
    if (error instanceof UnverifiedListingError) {
      return { status: 422, code: 'LISTING_UNVERIFIED' };
    }
    if (error instanceof MissingListingAgreementError) {
      return { status: 422, code: 'AGREEMENT_REQUIRED' };
    }
    if (error instanceof NoCommissionRateInForceError) {
      return { status: 422, code: 'NO_RATE_IN_FORCE' };
    }
    if (error instanceof UnknownClauseVersionError) {
      return { status: 422, code: 'UNKNOWN_CLAUSE_VERSION' };
    }
    if (error instanceof AuditPayloadContainsPiiError) {
      return { status: 422, code: 'AUDIT_PAYLOAD_PII' };
    }
    if (error instanceof OutsideServiceAreaError) {
      return { status: 422, code: 'OUTSIDE_SERVICE_AREA' };
    }
    if (error instanceof MissingIntroductionRecordError) {
      return { status: 422, code: 'INTRODUCTION_RECORD_REQUIRED' };
    }
    if (error instanceof FieldReportRequiredError) {
      return { status: 422, code: 'FIELD_REPORT_REQUIRED' };
    }
    if (error instanceof TenantNotVerifiedError) {
      return { status: 422, code: 'TENANT_NOT_VERIFIED' };
    }
    if (error instanceof ListingNotViewableError) {
      return { status: 422, code: 'LISTING_NOT_VIEWABLE' };
    }
    if (error instanceof OutsideServiceCorridorError) {
      return { status: 422, code: 'OUTSIDE_SERVICE_AREA' };
    }
    if (error instanceof NotAFieldOfficerError) {
      return { status: 422, code: 'NOT_A_FIELD_OFFICER' };
    }
    if (error instanceof UnbalancedPostingError) {
      return { status: 422, code: 'UNBALANCED_POSTING' };
    }
    if (error instanceof InvalidAmountError) {
      return { status: 422, code: 'INVALID_AMOUNT' };
    }
    if (error instanceof EmptyPostingError) {
      return { status: 422, code: 'EMPTY_POSTING' };
    }
    if (error instanceof UnknownScreeningModuleError) {
      return { status: 422, code: 'UNKNOWN_SCREENING_MODULE' };
    }
    if (error instanceof ConfigNotSetError) {
      return { status: 422, code: 'CONFIG_NOT_SET' };
    }

    // 502 — an external provider declined or misbehaved
    if (error instanceof SettlementReleaseFailedError) {
      return { status: 502, code: 'PROVIDER_REJECTED' };
    }
    if (error instanceof CompressionPolicyViolationError) {
      return { status: 502, code: 'MEDIA_PROVIDER_POLICY_VIOLATION' };
    }

    return null;
  }
}
