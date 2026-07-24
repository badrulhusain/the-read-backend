import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error('DATABASE_URL is required');
    }

    super({
      adapter: new PrismaPg({ connectionString }),
      transactionOptions: {
        maxWait: 10000,
        timeout: 15000,
      },
      log: [{ emit: 'event', level: 'query' }],
    });
    const queryEvents = this as unknown as {
      $on(
        event: 'query',
        callback: (event: { duration: number }) => void,
      ): void;
    };
    queryEvents.$on('query', (event) => {
      if (event.duration >= 500) {
        this.logger.warn(
          JSON.stringify({
            event: 'slow_database_operation',
            durationMs: event.duration,
          }),
        );
      }
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
