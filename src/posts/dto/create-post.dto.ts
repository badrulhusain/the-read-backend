import { PostStatus } from '@prisma/client';

export class CreatePostDto {
  title: string;
  content: string;
  excerpt?: string;
  slug?: string;
  type?: string;
  status?: PostStatus;
  authorId?: string;
  tags?: string[];
  publishedAt?: Date;
}
