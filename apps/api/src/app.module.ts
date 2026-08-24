import { Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { IdentityModule } from './identity/identity.module';
import { LedgerModule } from './ledger/ledger.module';
import { DealsModule } from './deals/deals.module';
import { PaymentsModule } from './payments/payments.module';
import { ConfigModule } from './config/config.module';
import { ListingsModule } from './listings/listings.module';
import { SearchModule } from './search/search.module';
import { ScreeningModule } from './screening/screening.module';
import { MediaModule } from './media/media.module';
import { ViewingsModule } from './viewings/viewings.module';
import { AuditModule } from './audit/audit.module';
import { AgreementsModule } from './agreements/agreements.module';
import { AdminModule } from './admin/admin.module';
import { TaxonomyModule } from './taxonomy/taxonomy.module';
import { PhotosModule } from './photos/photos.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { BigIntSerializerInterceptor } from './common/bigint-serializer.interceptor';
import { DomainExceptionFilter } from './common/domain-exception.filter';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    ConfigModule,
    AuthModule,
    IdentityModule,
    LedgerModule,
    DealsModule,
    PaymentsModule,
    ListingsModule,
    SearchModule,
    ScreeningModule,
    MediaModule,
    ViewingsModule,
    AgreementsModule,
    AdminModule,
    TaxonomyModule,
    PhotosModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,

    // ── Authentication and authorisation are GLOBAL by default ──
    // Registering these per-controller would fail open: a controller
    // written without the decorator would be silently unauthenticated, and
    // no test would notice. Global registration means an endpoint is
    // protected unless it explicitly opts out with @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },

    // Rejects bodies carrying unexpected fields outright, so a client
    // cannot smuggle `status`, `commissionAmount` or `isVerified` into a
    // request and have it silently ignored (API Spec §12.4).
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },

    // Money leaves as strings, always (API Spec §2).
    { provide: APP_INTERCEPTOR, useClass: BigIntSerializerInterceptor },

    // Domain rejections map to their documented status codes rather than 500.
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class AppModule {}
