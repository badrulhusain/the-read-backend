import { PostStatus } from '@prisma/client';

export class CreatePostDto {
  title: string;
  content: string;
  type?: string;
  status?: PostStatus;
  authorId: string;
  tags?: string[];
  publishedAt?: Date;
}
