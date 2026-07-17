import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { Readable } from 'stream';
import { UploadType } from './dto/upload-image.dto';

const FOLDER_MAP: Record<UploadType, string> = {
  [UploadType.BLOG_COVER]: 'the-read/blog-covers',
  [UploadType.PROFILE_IMAGE]: 'the-read/profile-images',
};

const TRANSFORM_MAP: Record<UploadType, object> = {
  [UploadType.BLOG_COVER]: {},
  [UploadType.PROFILE_IMAGE]: {
    width: 400,
    height: 400,
    crop: 'fill',
    gravity: 'face',
    quality: 'auto',
    fetch_format: 'auto',
  },
};

@Injectable()
export class CloudinaryService {
  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  async upload(
    buffer: Buffer,
    uploadType: UploadType,
  ): Promise<{
    url: string;
    publicId: string;
    width: number;
    height: number;
    format: string;
    bytes: number;
  }> {
    const folder = FOLDER_MAP[uploadType];
    const transformation = TRANSFORM_MAP[uploadType];

    try {
      const result = await new Promise<UploadApiResponse>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder, transformation, resource_type: 'image' },
          (error, result) => {
            if (error || !result)
              reject(
                error instanceof Error ? error : new Error('Upload failed'),
              );
            else resolve(result);
          },
        );
        Readable.from(buffer).pipe(stream);
      });

      return {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
        bytes: result.bytes,
      };
    } catch {
      throw new InternalServerErrorException('Image upload failed');
    }
  }

  async delete(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    } catch {
      throw new InternalServerErrorException('Image deletion failed');
    }
  }
}
