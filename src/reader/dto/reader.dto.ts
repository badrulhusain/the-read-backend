import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
export class ReportBlogDto {
  @IsString() @IsNotEmpty() @MaxLength(120) reason!: string;
  @IsOptional() @IsString() @MaxLength(5000) details?: string;
}
