import { Module } from '@nestjs/common';
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

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    IdentityModule,
    LedgerModule,
    DealsModule,
    PaymentsModule,
    ListingsModule,
    SearchModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
