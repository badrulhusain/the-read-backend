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

export function detectImageMime(buffer: Buffer): string | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  )
    return 'image/jpeg';
  if (
    buffer.length >= 8 &&
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return 'image/png';
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  )
    return 'image/webp';
  return null;
}

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
    const detectedMime = detectImageMime(file.buffer);
    if (!detectedMime || detectedMime !== file.mimetype) {
      throw new BadRequestException(
        'File content does not match a supported image format',
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
