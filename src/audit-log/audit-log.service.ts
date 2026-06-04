import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

interface LogPayload {
  actorId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async log(payload: LogPayload): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        action: payload.action,
        entityType: payload.entityType,
        entityId: payload.entityId,

        metadata: payload.metadata as Record<string, any>,
        ...(payload.actorId
          ? { actor: { connect: { id: payload.actorId } } }
          : {}),
      },
    });
  }
}
