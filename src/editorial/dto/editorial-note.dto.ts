import { IsString, MinLength } from 'class-validator';

export class EditorialDecisionDto {
  @IsString()
  @MinLength(10, { message: 'Comment must be at least 10 characters' })
  comment: string;
}
