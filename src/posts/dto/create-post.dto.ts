import { PostStatus } from '@prisma/client';

export class CreatePostDto {
  title: string;
  content: string;
  type?: string;
  status?: PostStatus;
  authorId: string;
  tagIds?: string[];
  publishedAt?: Date;
}
