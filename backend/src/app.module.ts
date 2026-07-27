import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { IdentityModule } from './identity/identity.module';
import { LedgerModule } from './ledger/ledger.module';
import { DealsModule } from './deals/deals.module';

@Module({
  imports: [PrismaModule, IdentityModule, LedgerModule, DealsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
