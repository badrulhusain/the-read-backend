import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Role, UserStatus } from '../generated/prisma/client';
import { CloudinaryService } from './cloudinary.service';
import { UploadType } from './dto/upload-image.dto';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const SIZE_LIMITS: Record<UploadType, number> = {
  [UploadType.BLOG_COVER]: 5 * 1024 * 1024,
  [UploadType.PROFILE_IMAGE]: 2 * 1024 * 1024,
};

type RequestUser = { id: string; role: Role; status?: UserStatus };

@Injectable()
export class UploadsService {
  constructor(private readonly cloudinary: CloudinaryService) {}

  async uploadImage(
    user: RequestUser,
    file: Express.Multer.File,
    uploadType: UploadType,
  ) {
    if (
      user.status === UserStatus.BLOCKED ||
      user.status === UserStatus.DELETED
    ) {
      throw new ForbiddenException('Your account is not active');
    }

    if (
      uploadType === UploadType.BLOG_COVER &&
      user.role !== Role.EDITOR &&
      user.role !== Role.ADMIN
    ) {
      throw new ForbiddenException(
        'Only editors and admins can upload blog cover images',
      );
    }

    if (!file) {
      throw new BadRequestException('File is required');
    }

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
      );
    }

    const sizeLimit = SIZE_LIMITS[uploadType];
    if (file.size > sizeLimit) {
      throw new PayloadTooLargeException(
        `File too large. Max size for ${uploadType}: ${sizeLimit / (1024 * 1024)}MB`,
      );
    }

    return this.cloudinary.upload(file.buffer, uploadType);
  }
}
