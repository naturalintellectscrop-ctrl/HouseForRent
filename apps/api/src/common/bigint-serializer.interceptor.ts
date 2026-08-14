import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Serialises every `bigint` in a response as a decimal STRING (API Spec §2).
 *
 * ── Why this is an interceptor and not per-DTO mapping ──
 * JSON numbers are IEEE-754 doubles in most parsers, so any shilling amount
 * above 2^53 silently loses precision on the way out. Per-endpoint mapping
 * would work until the first handler that forgets — and the failure is
 * silent, produces plausible-looking numbers, and concerns money. Doing it
 * once, globally, means no handler *can* forget.
 *
 * (`JSON.stringify` throws on bigint rather than corrupting it, so without
 * this every money response would 500 — the failure mode is at least loud.
 * This makes it correct.)
 */
@Injectable()
export class BigIntSerializerInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(map((value) => this.convert(value)));
  }

  private convert(value: unknown): unknown {
    if (typeof value === 'bigint') {
      return value.toString();
    }
    if (value instanceof Date || value === null || value === undefined) {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.convert(item));
    }
    if (typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value)) {
        out[key] = this.convert(item);
      }
      return out;
    }
    return value;
  }
}
