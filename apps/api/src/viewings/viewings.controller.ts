import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ViewingsService } from './viewings.service';
import { Roles } from '../auth/roles.decorator';
import { Caller } from '../auth/caller.decorator';
import { RequiresAssignedFoo } from '../auth/assigned-foo.decorator';
import { AssignedFooGuard } from '../auth/guards/assigned-foo.guard';
import type { AuthenticatedCaller } from '../auth/auth.service';
import {
  AssignViewingDto,
  CaptureMediaDto,
  ConductViewingDto,
  FieldReportDto,
  NoShowDto,
  RequestViewingDto,
} from './dto/viewing.dto';

/**
 * Viewings and field ops (API Spec §4.3).
 *
 * Note what is absent: there is no cancel endpoint and no endpoint that
 * accepts a target status. `cancelled` exists in the schema's enum but §4.3
 * lists no operation reaching it, and adding one would be a scope change
 * requiring an SSOT amendment rather than an API iteration (§11).
 *
 * There is also no endpoint that creates an introduction record directly.
 * The record is a CONSEQUENCE of conducting a viewing, written in the same
 * transaction as the status change. If it were separately creatable, an
 * introduction could be fabricated for a visit that never happened — which
 * is precisely the evidence it exists to be.
 */
@Controller('v1/viewings')
@UseGuards(AssignedFooGuard)
export class ViewingsController {
  constructor(private readonly viewings: ViewingsService) {}

  /**
   * FR-5.1. The requesting tenant comes from the session, never the body:
   * a tenant cannot book a viewing in someone else's name.
   */
  @Roles('tenant', 'admin')
  @Post()
  async request(
    @Caller() caller: AuthenticatedCaller,
    @Body() dto: RequestViewingDto,
  ) {
    return this.viewings.requestViewing({
      listingId: dto.listingId,
      tenantPartyId: caller.partyId,
      scheduledFor: new Date(dto.scheduledFor),
    });
  }

  /**
   * FR-5.2 — dispatch. Admin-only: assigning work to staff is an ops
   * function, and letting an officer assign themselves would make the
   * corridor and workload controls advisory.
   */
  @Roles('admin')
  @Post(':viewingId/assign')
  async assign(
    @Param('viewingId') viewingId: string,
    @Body() dto: AssignViewingDto,
  ) {
    return this.viewings.assign({
      viewingId,
      fooPartyId: dto.fooPartyId,
      scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : undefined,
    });
  }

  /** FR-5.4 — the structured report. Assigned officer only. */
  @Roles('foo', 'admin')
  @RequiresAssignedFoo()
  @Post(':viewingId/field-report')
  async fieldReport(
    @Param('viewingId') viewingId: string,
    @Caller() caller: AuthenticatedCaller,
    @Body() dto: FieldReportDto,
  ) {
    return this.viewings.submitFieldReport({
      viewingId,
      fooPartyId: caller.partyId,
      conditionRating: dto.conditionRating,
      matchesListing: dto.matchesListing,
      isAvailable: dto.isAvailable,
      issuesText: dto.issuesText,
      timingNote: dto.timingNote,
      mediaAssetIds: dto.mediaAssetIds,
    });
  }

  /**
   * FR-5.3 — closes the viewing and mints the introduction record.
   * Rejected with 422 if no field report exists (Data_Model.md §5.1).
   */
  @Roles('foo', 'admin')
  @RequiresAssignedFoo()
  @Post(':viewingId/conduct')
  async conduct(
    @Param('viewingId') viewingId: string,
    @Caller() caller: AuthenticatedCaller,
    @Body() _dto: ConductViewingDto,
  ) {
    return this.viewings.conduct({ viewingId, fooPartyId: caller.partyId });
  }

  /** FR-5.2 — no-shows are tracked, not deleted. */
  @Roles('foo', 'admin')
  @RequiresAssignedFoo()
  @Post(':viewingId/no-show')
  async noShow(@Param('viewingId') viewingId: string, @Body() _dto: NoShowDto) {
    return this.viewings.markNoShow({ viewingId });
  }

  /**
   * FR-5.5 — professional media captured on the visit.
   *
   * [Amendment A2] §4.3 listed no media endpoint, which was a gap rather
   * than a prohibition: FR-5.5 mandates the capability and §11 does not
   * list it among the deliberate absences. Added to the spec with the same
   * ¹ assigned-FOO constraint as the other field operations.
   */
  @Roles('foo', 'admin')
  @RequiresAssignedFoo()
  @Post(':viewingId/media')
  async captureMedia(
    @Param('viewingId') viewingId: string,
    @Caller() caller: AuthenticatedCaller,
    @Body() dto: CaptureMediaDto,
  ) {
    return this.viewings.captureMedia({
      viewingId,
      fooPartyId: caller.partyId,
      kind: dto.kind,
      mimeType: dto.mimeType,
      sourceByteSize: dto.sourceByteSize,
      sourceRef: dto.sourceRef,
    });
  }

  /** An officer's dispatch board (FR-5.2). */
  @Roles('foo', 'admin')
  @Get('assigned/me')
  async assignedToMe(@Caller() caller: AuthenticatedCaller) {
    return this.viewings.findAssignedTo(caller.partyId);
  }

  /**
   * The DISPATCHER's queue — requested viewings nobody has been sent to
   * (FR-5.2).
   *
   * [F-002] `POST :viewingId/assign` existed and was tested, but no route
   * could tell an admin WHICH viewings were waiting: `assigned/me` is scoped
   * to the caller, so a dispatcher could not see the queue they exist to
   * dispatch from. A requested viewing therefore stayed requested forever
   * and the tenant journey ended there.
   *
   * Admin-only, matching `assign` itself: seeing the queue and acting on it
   * are the same job, and a queue readable by an officer would be a roster
   * of tenants' pending visits across the whole corridor.
   *
   * Declared before `:viewingId` — Nest matches in declaration order.
   */
  @Roles('admin')
  @Get('dispatch-queue')
  async dispatchQueue() {
    const [queue, officers] = await Promise.all([
      this.viewings.findDispatchQueue(),
      this.viewings.findAssignableOfficers(),
    ]);
    // Returned together because a queue without the roster is not actionable
    // — the dispatcher would have the viewing and no legal value for
    // `fooPartyId`.
    return { total: queue.length, rows: queue, officers };
  }

  /**
   * The viewings a tenant requested (FR-5.1).
   *
   * Scoped from the session, so it can only ever return the caller's own.
   * Declared before `:viewingId` — Nest matches in declaration order, and a
   * literal segment placed after a parameter would be swallowed as an id.
   */
  @Roles('tenant', 'admin')
  @Get('mine')
  async myViewings(@Caller() caller: AuthenticatedCaller) {
    return this.viewings.findForTenant(caller.partyId);
  }

  /**
   * FR-5.3 / FR-8.3 — introduction records as queryable circumvention
   * evidence. Staff-only: it is a linkage between two counterparties, and
   * exposing it to either would tell a landlord which other tenants an
   * officer introduced.
   *
   * Declared BEFORE `:viewingId` — Nest matches routes in declaration
   * order, so a literal segment must come first or `introductions` would be
   * swallowed as an id.
   */
  @Roles('foo', 'admin')
  @Get('introductions')
  async introductions(
    @Query('tenantPartyId') tenantPartyId?: string,
    @Query('landlordPartyId') landlordPartyId?: string,
    @Query('listingId') listingId?: string,
  ) {
    return this.viewings.findIntroductions({
      tenantPartyId,
      landlordPartyId,
      listingId,
    });
  }

  /**
   * One visit, with whatever evidence it has so far — what the field app
   * needs to know which step is next.
   *
   * Carries the same ¹ assigned-FOO constraint as the write operations: an
   * officer reads the visit they were dispatched to, not an arbitrary one.
   * Returns `whatIsMissing` so the client renders the invariant rather than
   * re-deriving it; the server stays the single source of that judgement
   * (Technical Architecture §7).
   */
  @Roles('foo', 'admin')
  @RequiresAssignedFoo()
  @Get(':viewingId')
  async getViewing(@Param('viewingId') viewingId: string) {
    const viewing = await this.viewings.getViewingOrThrow(viewingId);
    const fieldReport = await this.viewings.getFieldReport(viewingId);
    const introduction = await this.viewings.getIntroduction(viewingId);

    return {
      viewing,
      fieldReport,
      introduction,
      canConduct: viewing.status === 'scheduled' && fieldReport !== null,
      whatIsMissing:
        viewing.status === 'scheduled' && !fieldReport ? ['field_report'] : [],
    };
  }
}
