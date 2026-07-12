import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadDraftFileDto {
  @IsIn(['STANDARD', 'KNOWLEDGE'])
  ownerType: 'STANDARD' | 'KNOWLEDGE';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  changeDescription?: string;
}
