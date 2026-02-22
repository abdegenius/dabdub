import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { MerchantFeeService } from './merchant-fee.service';
import { MerchantTier } from '../dto/merchant.dto';

describe('MerchantFeeService', () => {
  const createRepoMock = () => ({
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn((value) => value),
  });

  const createService = () => {
    const merchantRepository = createRepoMock();
    const userRepository = createRepoMock();
    const merchantFeeConfigRepository = createRepoMock();
    const platformFeeDefaultRepository = createRepoMock();
    const merchantAuditLogRepository = createRepoMock();
    const platformFeeAuditLogRepository = createRepoMock();
    const cacheManager = { del: jest.fn() };

    const service = new MerchantFeeService(
      merchantRepository as any,
      userRepository as any,
      merchantFeeConfigRepository as any,
      platformFeeDefaultRepository as any,
      merchantAuditLogRepository as any,
      platformFeeAuditLogRepository as any,
      cacheManager as any,
    );

    return {
      service,
      merchantRepository,
      userRepository,
      merchantFeeConfigRepository,
      platformFeeDefaultRepository,
      merchantAuditLogRepository,
      platformFeeAuditLogRepository,
      cacheManager,
    };
  };

  const adminUser = {
    id: 'admin-1',
    email: 'ops@cheese.io',
    role: 'admin',
  } as any;

  const merchant = {
    id: 'merchant-1',
    settings: { tier: MerchantTier.GROWTH },
    feeStructure: null,
  } as any;

  const growthDefaults = {
    id: 'def-growth',
    tier: MerchantTier.GROWTH,
    transactionFeePercentage: '1.50',
    transactionFeeFlat: '0.30',
    settlementFeePercentage: '0.25',
    minimumFee: '0.50',
    maximumFee: '50.00',
    tieredFees: null,
  };

  it('throws 422 when transactionFeePercentage is below platform minimum', async () => {
    const ctx = createService();
    ctx.merchantRepository.findOne.mockResolvedValue(merchant);
    ctx.platformFeeDefaultRepository.findOne.mockResolvedValue(growthDefaults);
    ctx.merchantFeeConfigRepository.findOne.mockResolvedValue(null);

    await expect(
      ctx.service.updateMerchantFeeConfig(
        merchant.id,
        {
          transactionFeePercentage: '0.10',
          reason: 'Need promo fees',
        },
        adminUser,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('throws 422 when minimumFee is greater than maximumFee', async () => {
    const ctx = createService();
    ctx.merchantRepository.findOne.mockResolvedValue(merchant);
    ctx.platformFeeDefaultRepository.findOne.mockResolvedValue(growthDefaults);
    ctx.merchantFeeConfigRepository.findOne.mockResolvedValue(null);

    await expect(
      ctx.service.updateMerchantFeeConfig(
        merchant.id,
        {
          minimumFee: '100.00',
          maximumFee: '50.00',
          reason: 'manual adjustment',
        },
        adminUser,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('throws 422 when tiered fees have gaps', async () => {
    const ctx = createService();
    ctx.merchantRepository.findOne.mockResolvedValue(merchant);
    ctx.platformFeeDefaultRepository.findOne.mockResolvedValue(growthDefaults);
    ctx.merchantFeeConfigRepository.findOne.mockResolvedValue(null);

    await expect(
      ctx.service.updateMerchantFeeConfig(
        merchant.id,
        {
          tieredFees: [
            { minVolumeUsd: 0, maxVolumeUsd: 10000, feePercentage: '1.50' },
            { minVolumeUsd: 12000, maxVolumeUsd: null, feePercentage: '1.20' },
          ],
          reason: 'new volume strategy',
        },
        adminUser,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('logs reason in merchant audit log on successful update', async () => {
    const ctx = createService();
    ctx.merchantRepository.findOne.mockResolvedValue(merchant);
    ctx.platformFeeDefaultRepository.findOne.mockResolvedValue(growthDefaults);
    ctx.merchantFeeConfigRepository.findOne.mockResolvedValue(null);
    ctx.merchantFeeConfigRepository.save.mockImplementation(async (v) => ({
      ...v,
      id: 'cfg-1',
      updatedAt: new Date('2026-01-10T14:00:00Z'),
      updatedBy: { id: adminUser.id, email: adminUser.email },
    }));

    await ctx.service.updateMerchantFeeConfig(
      merchant.id,
      {
        transactionFeePercentage: '1.40',
        reason: 'special strategic discount for Q1',
      },
      adminUser,
    );

    expect(ctx.merchantAuditLogRepository.save).toHaveBeenCalled();
    const payload = ctx.merchantAuditLogRepository.save.mock.calls[0][0];
    expect(payload.action).toBe('MERCHANT_FEES_UPDATED');
    expect(payload.changes.reason).toBe('special strategic discount for Q1');
  });

  it('resetToDefaults applies current tier defaults and marks config non-custom', async () => {
    const ctx = createService();
    ctx.merchantRepository.findOne.mockResolvedValue(merchant);
    ctx.platformFeeDefaultRepository.findOne.mockResolvedValue(growthDefaults);
    ctx.merchantFeeConfigRepository.findOne.mockResolvedValue({
      id: 'cfg-1',
      merchantId: merchant.id,
      transactionFeePercentage: '1.40',
      transactionFeeFlat: '0.20',
      settlementFeePercentage: '0.20',
      minimumFee: '0.40',
      maximumFee: '40.00',
      tieredFees: null,
      isCustom: true,
    });
    ctx.merchantFeeConfigRepository.save.mockImplementation(async (v) => ({
      ...v,
      updatedAt: new Date(),
      updatedBy: { id: adminUser.id, email: adminUser.email },
    }));

    await ctx.service.resetMerchantFeesToDefaults(merchant.id, adminUser);

    const savedConfig = ctx.merchantFeeConfigRepository.save.mock.calls[0][0];
    expect(savedConfig.isCustom).toBe(false);
    expect(savedConfig.transactionFeePercentage).toBe('1.50');
    expect(savedConfig.transactionFeeFlat).toBe('0.30');
    expect(ctx.merchantAuditLogRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MERCHANT_FEES_RESET_TO_DEFAULTS' }),
    );
  });

  it('throws not found when merchant does not exist', async () => {
    const ctx = createService();
    ctx.merchantRepository.findOne.mockResolvedValue(null);

    await expect(
      ctx.service.getMerchantFeeConfig('missing-merchant'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates platform defaults and writes platform audit log with reason', async () => {
    const ctx = createService();
    const starterDefaults = {
      id: 'def-starter',
      tier: MerchantTier.STARTER,
      transactionFeePercentage: '2.00',
      transactionFeeFlat: '0.30',
      settlementFeePercentage: '0.50',
      minimumFee: '0.50',
      maximumFee: '100.00',
      tieredFees: null,
    };

    ctx.platformFeeDefaultRepository.findOne.mockResolvedValue(starterDefaults);
    ctx.platformFeeDefaultRepository.save.mockImplementation(async (v) => v);

    await ctx.service.updatePlatformFeeDefaults(
      {
        tier: MerchantTier.STARTER,
        transactionFeePercentage: '1.90',
        reason: 'quarterly pricing review',
      },
      adminUser,
    );

    expect(ctx.platformFeeDefaultRepository.save).toHaveBeenCalled();
    expect(ctx.platformFeeAuditLogRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PLATFORM_FEE_DEFAULTS_UPDATED',
        reason: 'quarterly pricing review',
      }),
    );
    expect(ctx.merchantFeeConfigRepository.save).not.toHaveBeenCalled();
  });
});
