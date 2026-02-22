import { UnprocessableEntityException } from '@nestjs/common';

export const PLATFORM_FEE_BOUNDS = {
  transactionFeePercentage: {
    min: 0.5,
    max: 5,
  },
};

export interface TieredFeeInput {
  minVolumeUsd: number;
  maxVolumeUsd: number | null;
  feePercentage: string;
}

export const parseNumeric = (value: string | number, field: string): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new UnprocessableEntityException(`${field} must be a valid number`);
  }
  return parsed;
};

export const assertFeePercentageWithinBounds = (
  value: string | number,
  fieldName: string,
): void => {
  const numericValue = parseNumeric(value, fieldName);
  if (numericValue < PLATFORM_FEE_BOUNDS.transactionFeePercentage.min) {
    throw new UnprocessableEntityException({
      field: fieldName,
      message: `${fieldName} cannot be below ${PLATFORM_FEE_BOUNDS.transactionFeePercentage.min.toFixed(2)}%`,
      min: PLATFORM_FEE_BOUNDS.transactionFeePercentage.min,
      code: 'FEE_BELOW_PLATFORM_MINIMUM',
    });
  }

  if (numericValue > PLATFORM_FEE_BOUNDS.transactionFeePercentage.max) {
    throw new UnprocessableEntityException({
      field: fieldName,
      message: `${fieldName} cannot exceed ${PLATFORM_FEE_BOUNDS.transactionFeePercentage.max.toFixed(2)}%`,
      max: PLATFORM_FEE_BOUNDS.transactionFeePercentage.max,
      code: 'FEE_ABOVE_PLATFORM_MAXIMUM',
    });
  }
};

export const validateTieredFees = (tiers: TieredFeeInput[]): void => {
  if (tiers.length === 0) {
    throw new UnprocessableEntityException('tieredFees must contain at least one tier');
  }

  const sorted = [...tiers].sort((a, b) => a.minVolumeUsd - b.minVolumeUsd);
  if (sorted[0].minVolumeUsd !== 0) {
    throw new UnprocessableEntityException('tieredFees must start at minVolumeUsd = 0');
  }

  for (let i = 0; i < sorted.length; i += 1) {
    const current = sorted[i];
    const next = sorted[i + 1];

    assertFeePercentageWithinBounds(current.feePercentage, `tieredFees[${i}].feePercentage`);

    if (current.maxVolumeUsd !== null && current.maxVolumeUsd <= current.minVolumeUsd) {
      throw new UnprocessableEntityException(
        `tieredFees[${i}] has invalid range: maxVolumeUsd must be greater than minVolumeUsd`,
      );
    }

    if (!next) {
      if (current.maxVolumeUsd !== null) {
        throw new UnprocessableEntityException(
          'tieredFees must cover 0 to infinity. The last tier maxVolumeUsd must be null.',
        );
      }
      return;
    }

    if (current.maxVolumeUsd === null) {
      throw new UnprocessableEntityException(
        `tieredFees[${i}] has maxVolumeUsd = null before the last tier`,
      );
    }

    if (current.maxVolumeUsd < next.minVolumeUsd) {
      throw new UnprocessableEntityException(
        `tieredFees gap detected between ${current.maxVolumeUsd} and ${next.minVolumeUsd}`,
      );
    }

    if (current.maxVolumeUsd > next.minVolumeUsd) {
      throw new UnprocessableEntityException(
        `tieredFees overlap detected between ${current.maxVolumeUsd} and ${next.minVolumeUsd}`,
      );
    }
  }
};
