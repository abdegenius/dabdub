import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDecimal,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MerchantTier } from './merchant.dto';

export class TieredFeeDto {
  @IsNumber()
  @Min(0)
  minVolumeUsd!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxVolumeUsd!: number | null;

  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  feePercentage!: string;
}

export class UpdateMerchantFeesDto {
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  transactionFeePercentage?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  @Min(0)
  transactionFeeFlat?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  settlementFeePercentage?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  @Min(0)
  minimumFee?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  @Min(0)
  maximumFee?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TieredFeeDto)
  tieredFees?: TieredFeeDto[];

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}

export class UpdatePlatformFeeDefaultsDto {
  @IsEnum(MerchantTier)
  tier!: MerchantTier;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  transactionFeePercentage?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  @Min(0)
  transactionFeeFlat?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  settlementFeePercentage?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  @Min(0)
  minimumFee?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  @Min(0)
  maximumFee?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TieredFeeDto)
  tieredFees?: TieredFeeDto[];

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}
