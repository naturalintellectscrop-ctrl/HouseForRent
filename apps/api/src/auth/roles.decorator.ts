import { SetMetadata } from '@nestjs/common';
import { AuthRole } from '@prisma/client';

export const REQUIRED_ROLES = 'auth:roles';

/**
 * Declares which roles may reach an endpoint (API Spec §4).
 *
 * An endpoint with no @Roles() decorator is reachable by any authenticated
 * caller — appropriate only for self-scoped reads. Every money and
 * state-transition endpoint carries one, and a test asserts each cell of
 * the matrix.
 */
export const Roles = (...roles: AuthRole[]) =>
  SetMetadata(REQUIRED_ROLES, roles);
