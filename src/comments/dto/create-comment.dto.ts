export class CreateCommentDto {
  content: string;
  postId: string;
  authorId: string;
  parentId?: string;
}
