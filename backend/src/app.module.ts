import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { IdentityModule } from './identity/identity.module';
import { LedgerModule } from './ledger/ledger.module';

@Module({
  imports: [PrismaModule, IdentityModule, LedgerModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
