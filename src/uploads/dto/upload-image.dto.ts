import { IsEnum } from 'class-validator';

export enum UploadType {
  BLOG_COVER = 'BLOG_COVER',
  PROFILE_IMAGE = 'PROFILE_IMAGE',
}

export class UploadImageDto {
  @IsEnum(UploadType)
  type: UploadType;
}
