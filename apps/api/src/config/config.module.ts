import { Global, Module } from '@nestjs/common';
import { ConfigService } from './config.service';

/**
 * Config is Global because nearly every product module reads a parameter
 * from it, and threading it through imports adds noise without adding
 * isolation — it is a read-mostly, stateless service over versioned rows.
 */
@Global()
@Module({
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}
