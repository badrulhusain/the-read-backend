import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @IsNotEmpty()
  content: string;

  @IsUUID()
  @IsNotEmpty()
  postId: string;

  @IsUUID()
  @IsNotEmpty()
  authorId: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;
}
