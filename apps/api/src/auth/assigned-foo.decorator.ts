import { SetMetadata } from '@nestjs/common';

export const REQUIRES_ASSIGNED_FOO = 'requiresAssignedFoo';

/**
 * Marks an endpoint as callable only by the field officer actually assigned
 * to that viewing (API Spec §4.3, footnote ¹). Admin bypasses, per the
 * matrix, which gives admin an unqualified ✅ on those rows.
 */
export const RequiresAssignedFoo = () =>
  SetMetadata(REQUIRES_ASSIGNED_FOO, true);
