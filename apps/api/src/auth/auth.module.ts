import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { DealPartyGuard } from './guards/deal-party.guard';
import { resolveJwtSecret } from './jwt-secret';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      // Async so the secret is resolved when the module is instantiated
      // rather than when this file is imported — otherwise a bad secret
      // would throw during module loading, where the stack trace says
      // nothing useful about what is wrong.
      useFactory: () => ({
        secret: resolveJwtSecret(),
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  providers: [AuthService, JwtAuthGuard, RolesGuard, DealPartyGuard],
  controllers: [AuthController],
  exports: [AuthService, JwtAuthGuard, RolesGuard, DealPartyGuard, JwtModule],
})
export class AuthModule {}
