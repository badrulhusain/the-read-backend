import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { CloudinaryService } from './cloudinary.service';

@Injectable()
export class MediaCleanupService {
  private readonly logger = new Logger(MediaCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async deleteOrEnqueue(publicId: string): Promise<void> {
    try {
      await this.cloudinary.delete(publicId);
    } catch (error) {
      await this.prisma.mediaCleanupJob.upsert({
        where: { publicId },
        create: { publicId, lastError: this.safeError(error) },
        update: {
          completedAt: null,
          availableAt: new Date(),
          lastError: this.safeError(error),
        },
      });
      this.logger.warn(
        JSON.stringify({ event: 'media_cleanup_queued', publicId }),
      );
    }
  }

  @Cron('*/5 * * * *')
  async processDue(): Promise<void> {
    const jobs = await this.prisma.mediaCleanupJob.findMany({
      where: { completedAt: null, availableAt: { lte: new Date() } },
      select: { id: true, publicId: true, attempts: true },
      orderBy: { createdAt: 'asc' },
      take: 25,
    });

    for (const job of jobs) {
      try {
        await this.cloudinary.delete(job.publicId);
        await this.prisma.mediaCleanupJob.update({
          where: { id: job.id },
          data: { completedAt: new Date(), lastError: null },
        });
      } catch (error) {
        const attempts = job.attempts + 1;
        const delayMinutes = Math.min(2 ** attempts, 24 * 60);
        await this.prisma.mediaCleanupJob.update({
          where: { id: job.id },
          data: {
            attempts,
            lastError: this.safeError(error),
            availableAt: new Date(Date.now() + delayMinutes * 60_000),
          },
        });
      }
    }
  }

  private safeError(error: unknown): string {
    return (error instanceof Error ? error.message : 'Deletion failed').slice(
      0,
      500,
    );
  }
}
