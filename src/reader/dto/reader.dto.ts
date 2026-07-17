import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ReactionType } from '../../generated/prisma/client';
export class ReportBlogDto {
  @IsString() @IsNotEmpty() @MaxLength(120) reason!: string;
  @IsOptional() @IsString() @MaxLength(5000) details?: string;
}

export class ReactionDto {
  @IsEnum(ReactionType)
  reaction!: ReactionType;
}

export class NewsletterSubscriptionDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;
}
