import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { DealPartyGuard } from './guards/deal-party.guard';

@Global()
@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dev-only-secret-change-in-production',
      signOptions: { expiresIn: '15m' },
    }),
  ],
  providers: [AuthService, JwtAuthGuard, RolesGuard, DealPartyGuard],
  controllers: [AuthController],
  exports: [AuthService, JwtAuthGuard, RolesGuard, DealPartyGuard, JwtModule],
})
export class AuthModule {}
