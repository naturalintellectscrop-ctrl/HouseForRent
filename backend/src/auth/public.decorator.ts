import { SetMetadata } from '@nestjs/common';

/** Marks an endpoint as reachable without authentication (login, register). */
export const IS_PUBLIC = 'auth:isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);
