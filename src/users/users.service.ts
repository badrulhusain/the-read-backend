import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, UserStatus } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

export const USER_SAFE_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  isDeleted: true,
  deletedAt: true,
  avatarUrl: true,
  avatarPublicId: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: USER_SAFE_SELECT,
    });
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  updateMe(userId: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: USER_SAFE_SELECT,
    });
  }

  async deleteUser(actorId: string, userId: string) {
    if (actorId === userId) {
      throw new BadRequestException('Admin cannot delete their own account');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        status: true,
        isDeleted: true,
      },
    });
    if (!user || user.isDeleted || user.status === UserStatus.DELETED) {
      throw new NotFoundException('User not found');
    }

    if (user.role === Role.ADMIN) {
      const activeAdminCount = await this.prisma.user.count({
        where: {
          role: Role.ADMIN,
          isDeleted: false,
          status: { not: UserStatus.DELETED },
        },
      });

      if (activeAdminCount <= 1) {
        throw new BadRequestException('Last admin cannot be deleted');
      }
    }

    const deleted = await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: UserStatus.DELETED,
        isDeleted: true,
        deletedAt: new Date(),
      },
      select: USER_SAFE_SELECT,
    });

    await this.audit.log({
      actorId,
      action: 'USER_DELETED',
      entityType: 'User',
      entityId: userId,
    });

    return deleted;
  }
}
