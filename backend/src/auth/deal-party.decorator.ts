import { SetMetadata } from '@nestjs/common';

export const REQUIRES_DEAL_PARTY = 'auth:requiresDealParty';

/**
 * Requires the caller to be the tenant or landlord of the deal named in the
 * route (API Spec §7.4). Non-parties receive 404, not 403.
 */
export const RequiresDealParty = () => SetMetadata(REQUIRES_DEAL_PARTY, true);
