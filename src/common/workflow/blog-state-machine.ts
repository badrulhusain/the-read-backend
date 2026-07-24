import { ConflictException } from '@nestjs/common';
import { BlogStatus } from '../../generated/prisma/client';

export const BLOG_TRANSITIONS: Readonly<
  Record<BlogStatus, readonly BlogStatus[]>
> = {
  DRAFT: [BlogStatus.QUALITY_REVIEW, BlogStatus.ARCHIVED],
  EDITING: [BlogStatus.QUALITY_REVIEW, BlogStatus.ARCHIVED],
  QUALITY_REVIEW: [
    BlogStatus.NEEDS_CORRECTION,
    BlogStatus.READY_FOR_ADMIN,
    BlogStatus.REJECTED,
    BlogStatus.ARCHIVED,
  ],
  NEEDS_CORRECTION: [BlogStatus.QUALITY_REVIEW, BlogStatus.ARCHIVED],
  READY_FOR_ADMIN: [
    BlogStatus.SCHEDULED,
    BlogStatus.PUBLISHED,
    BlogStatus.NEEDS_CORRECTION,
    BlogStatus.REJECTED,
    BlogStatus.ARCHIVED,
  ],
  SCHEDULED: [
    BlogStatus.PUBLISHED,
    BlogStatus.NEEDS_CORRECTION,
    BlogStatus.ARCHIVED,
  ],
  PUBLISHED: [BlogStatus.UNPUBLISHED, BlogStatus.ARCHIVED],
  UNPUBLISHED: [BlogStatus.ARCHIVED],
  REJECTED: [BlogStatus.ARCHIVED],
  ARCHIVED: [],
};

export function assertBlogTransition(
  current: BlogStatus,
  next: BlogStatus,
): void {
  if (!BLOG_TRANSITIONS[current].includes(next)) {
    throw new ConflictException(
      `Invalid blog transition: ${current} -> ${next}`,
    );
  }
}

export const EDITOR_EDITABLE_STATUSES: readonly BlogStatus[] = [
  BlogStatus.DRAFT,
  BlogStatus.EDITING,
  BlogStatus.QUALITY_REVIEW,
  BlogStatus.NEEDS_CORRECTION,
];
