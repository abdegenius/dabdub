import { validateTieredFees } from './merchant-fee-validation.util';

describe('validateTieredFees', () => {
  it('accepts valid contiguous tiers that cover 0 to infinity', () => {
    expect(() =>
      validateTieredFees([
        { minVolumeUsd: 0, maxVolumeUsd: 10000, feePercentage: '1.50' },
        { minVolumeUsd: 10000, maxVolumeUsd: 100000, feePercentage: '1.20' },
        { minVolumeUsd: 100000, maxVolumeUsd: null, feePercentage: '0.90' },
      ]),
    ).not.toThrow();
  });

  it('rejects tier arrays that do not start at 0', () => {
    expect(() =>
      validateTieredFees([
        { minVolumeUsd: 1, maxVolumeUsd: null, feePercentage: '1.50' },
      ]),
    ).toThrow('start at minVolumeUsd = 0');
  });

  it('rejects tier arrays with gaps', () => {
    expect(() =>
      validateTieredFees([
        { minVolumeUsd: 0, maxVolumeUsd: 10000, feePercentage: '1.50' },
        { minVolumeUsd: 11000, maxVolumeUsd: null, feePercentage: '1.20' },
      ]),
    ).toThrow('gap detected');
  });

  it('rejects tier arrays with overlaps', () => {
    expect(() =>
      validateTieredFees([
        { minVolumeUsd: 0, maxVolumeUsd: 10000, feePercentage: '1.50' },
        { minVolumeUsd: 9000, maxVolumeUsd: null, feePercentage: '1.20' },
      ]),
    ).toThrow('overlap detected');
  });

  it('rejects out-of-range fee percentages', () => {
    expect(() =>
      validateTieredFees([
        { minVolumeUsd: 0, maxVolumeUsd: null, feePercentage: '0.10' },
      ]),
    ).toThrow('cannot be below');
  });
});
