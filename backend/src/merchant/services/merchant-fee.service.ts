import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Merchant } from '../../database/entities/merchant.entity';
import { UserEntity } from '../../database/entities/user.entity';
import { MerchantTier } from '../dto/merchant.dto';
import {
  TieredFeeDto,
  UpdateMerchantFeesDto,
  UpdatePlatformFeeDefaultsDto,
} from '../dto/merchant-fee.dto';
import { MerchantAuditLog } from '../entities/merchant-audit-log.entity';
import { MerchantFeeConfig, TieredFee } from '../entities/merchant-fee-config.entity';
import { PlatformFeeAuditLog } from '../entities/platform-fee-audit-log.entity';
import { PlatformFeeDefault } from '../entities/platform-fee-default.entity';
import {
  assertFeePercentageWithinBounds,
  parseNumeric,
  validateTieredFees,
} from './merchant-fee-validation.util';

interface FeeShape {
  transactionFeePercentage: string;
  transactionFeeFlat: string;
  settlementFeePercentage: string;
  minimumFee: string;
  maximumFee: string;
  tieredFees: TieredFee[] | null;
}

const PLATFORM_DEFAULT_TIER_CONFIG: Record<MerchantTier, FeeShape> = {
  [MerchantTier.STARTER]: {
    transactionFeePercentage: '2.00',
    transactionFeeFlat: '0.30',
    settlementFeePercentage: '0.50',
    minimumFee: '0.50',
    maximumFee: '100.00',
    tieredFees: null,
  },
  [MerchantTier.GROWTH]: {
    transactionFeePercentage: '1.50',
    transactionFeeFlat: '0.30',
    settlementFeePercentage: '0.25',
    minimumFee: '0.50',
    maximumFee: '50.00',
    tieredFees: null,
  },
  [MerchantTier.ENTERPRISE]: {
    transactionFeePercentage: '1.00',
    transactionFeeFlat: '0.20',
    settlementFeePercentage: '0.10',
    minimumFee: '0.25',
    maximumFee: '25.00',
    tieredFees: null,
  },
};

@Injectable()
export class MerchantFeeService {
  constructor(
    @InjectRepository(Merchant)
    private readonly merchantRepository: Repository<Merchant>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(MerchantFeeConfig)
    private readonly merchantFeeConfigRepository: Repository<MerchantFeeConfig>,
    @InjectRepository(PlatformFeeDefault)
    private readonly platformFeeDefaultRepository: Repository<PlatformFeeDefault>,
    @InjectRepository(MerchantAuditLog)
    private readonly merchantAuditLogRepository: Repository<MerchantAuditLog>,
    @InjectRepository(PlatformFeeAuditLog)
    private readonly platformFeeAuditLogRepository: Repository<PlatformFeeAuditLog>,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async getMerchantFeeConfig(merchantId: string) {
    const merchant = await this.merchantRepository.findOne({ where: { id: merchantId } });
    if (!merchant) {
      throw new NotFoundException(`Merchant with id '${merchantId}' not found`);
    }

    const tier = this.getMerchantTier(merchant);
    const tierDefaults = await this.getOrCreatePlatformDefaultsForTier(tier);

    const config = await this.merchantFeeConfigRepository.findOne({
      where: { merchantId },
      relations: ['updatedBy'],
    });

    const effectiveConfig = config
      ? this.normalizeFeeShape(config)
      : this.normalizeFeeShape(tierDefaults);

    return {
      merchantId,
      isCustom: config?.isCustom ?? false,
      ...effectiveConfig,
      platformDefaults: {
        transactionFeePercentage: this.toPercentString(tierDefaults.transactionFeePercentage),
        transactionFeeFlat: this.toMoneyString(tierDefaults.transactionFeeFlat),
      },
      updatedBy: config?.updatedBy
        ? {
            id: config.updatedBy.id,
            email: config.updatedBy.email,
          }
        : null,
      updatedAt: config?.updatedAt ?? null,
    };
  }

  async updateMerchantFeeConfig(
    merchantId: string,
    dto: UpdateMerchantFeesDto,
    currentAdmin: Pick<UserEntity, 'id' | 'email' | 'role'>,
  ) {
    const merchant = await this.merchantRepository.findOne({ where: { id: merchantId } });
    if (!merchant) {
      throw new NotFoundException(`Merchant with id '${merchantId}' not found`);
    }

    const tierDefaults = await this.getOrCreatePlatformDefaultsForTier(this.getMerchantTier(merchant));
    const existing = await this.merchantFeeConfigRepository.findOne({ where: { merchantId } });
    const before = existing ? this.normalizeFeeShape(existing) : this.normalizeFeeShape(tierDefaults);

    const merged: FeeShape = {
      transactionFeePercentage: dto.transactionFeePercentage ?? before.transactionFeePercentage,
      transactionFeeFlat: dto.transactionFeeFlat ?? before.transactionFeeFlat,
      settlementFeePercentage: dto.settlementFeePercentage ?? before.settlementFeePercentage,
      minimumFee: dto.minimumFee ?? before.minimumFee,
      maximumFee: dto.maximumFee ?? before.maximumFee,
      tieredFees:
        dto.tieredFees !== undefined
          ? this.normalizeTieredFees(dto.tieredFees)
          : before.tieredFees,
    };

    this.validateFeeShape(merged);

    const toSave = this.merchantFeeConfigRepository.create({
      id: existing?.id,
      merchantId,
      ...merged,
      isCustom: true,
      updatedById: currentAdmin.id,
    });

    const saved = await this.merchantFeeConfigRepository.save(toSave);
    await this.updateMerchantEmbeddedFeeStructure(merchant, merged);
    await this.invalidateMerchantCaches(merchantId);

    await this.merchantAuditLogRepository.save({
      merchantId,
      action: 'MERCHANT_FEES_UPDATED',
      changedBy: {
        id: currentAdmin.id,
        email: currentAdmin.email,
        role: currentAdmin.role,
      },
      changes: {
        reason: dto.reason,
        before,
        after: this.normalizeFeeShape(saved),
      },
      ip: null,
    });

    return this.getMerchantFeeConfig(merchantId);
  }

  async resetMerchantFeesToDefaults(
    merchantId: string,
    currentAdmin: Pick<UserEntity, 'id' | 'email' | 'role'>,
  ) {
    const merchant = await this.merchantRepository.findOne({ where: { id: merchantId } });
    if (!merchant) {
      throw new NotFoundException(`Merchant with id '${merchantId}' not found`);
    }

    const tierDefaults = await this.getOrCreatePlatformDefaultsForTier(this.getMerchantTier(merchant));
    const existing = await this.merchantFeeConfigRepository.findOne({ where: { merchantId } });
    const before = existing ? this.normalizeFeeShape(existing) : this.normalizeFeeShape(tierDefaults);
    const defaults = this.normalizeFeeShape(tierDefaults);

    const toSave = this.merchantFeeConfigRepository.create({
      id: existing?.id,
      merchantId,
      ...defaults,
      isCustom: false,
      updatedById: currentAdmin.id,
    });

    await this.merchantFeeConfigRepository.save(toSave);
    await this.updateMerchantEmbeddedFeeStructure(merchant, defaults);
    await this.invalidateMerchantCaches(merchantId);

    await this.merchantAuditLogRepository.save({
      merchantId,
      action: 'MERCHANT_FEES_RESET_TO_DEFAULTS',
      changedBy: {
        id: currentAdmin.id,
        email: currentAdmin.email,
        role: currentAdmin.role,
      },
      changes: {
        before,
        after: defaults,
      },
      ip: null,
    });

    return this.getMerchantFeeConfig(merchantId);
  }

  async getPlatformFeeDefaults() {
    const defaults = await this.ensureAllTierDefaults();

    return defaults.reduce<Record<string, FeeShape>>((acc, item) => {
      acc[item.tier] = this.normalizeFeeShape(item);
      return acc;
    }, {});
  }

  async updatePlatformFeeDefaults(
    dto: UpdatePlatformFeeDefaultsDto,
    currentAdmin: Pick<UserEntity, 'id' | 'email' | 'role'>,
  ) {
    const existing = await this.getOrCreatePlatformDefaultsForTier(dto.tier);
    const before = this.normalizeFeeShape(existing);

    const merged: FeeShape = {
      transactionFeePercentage: dto.transactionFeePercentage ?? before.transactionFeePercentage,
      transactionFeeFlat: dto.transactionFeeFlat ?? before.transactionFeeFlat,
      settlementFeePercentage: dto.settlementFeePercentage ?? before.settlementFeePercentage,
      minimumFee: dto.minimumFee ?? before.minimumFee,
      maximumFee: dto.maximumFee ?? before.maximumFee,
      tieredFees:
        dto.tieredFees !== undefined
          ? this.normalizeTieredFees(dto.tieredFees)
          : before.tieredFees,
    };

    this.validateFeeShape(merged);

    const saved = await this.platformFeeDefaultRepository.save(
      this.platformFeeDefaultRepository.create({
        id: existing.id,
        tier: dto.tier,
        ...merged,
      }),
    );

    await this.platformFeeAuditLogRepository.save({
      action: 'PLATFORM_FEE_DEFAULTS_UPDATED',
      changedBy: {
        id: currentAdmin.id,
        email: currentAdmin.email,
        role: currentAdmin.role,
      },
      changes: {
        tier: dto.tier,
        before,
        after: this.normalizeFeeShape(saved),
      },
      reason: dto.reason,
    });

    return this.getPlatformFeeDefaults();
  }

  async getAdminUserSummary(userId: string): Promise<Pick<UserEntity, 'id' | 'email' | 'role'>> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Authenticated user not found');
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
    };
  }

  private getMerchantTier(merchant: Merchant): MerchantTier {
    const maybeTier = merchant.settings?.tier as MerchantTier | undefined;
    if (maybeTier && Object.values(MerchantTier).includes(maybeTier)) {
      return maybeTier;
    }

    return MerchantTier.STARTER;
  }

  private async ensureAllTierDefaults(): Promise<PlatformFeeDefault[]> {
    const tiers = Object.values(MerchantTier);
    const output: PlatformFeeDefault[] = [];

    for (const tier of tiers) {
      output.push(await this.getOrCreatePlatformDefaultsForTier(tier));
    }

    return output;
  }

  private async getOrCreatePlatformDefaultsForTier(tier: MerchantTier): Promise<PlatformFeeDefault> {
    const existing = await this.platformFeeDefaultRepository.findOne({ where: { tier } });
    if (existing) {
      return existing;
    }

    const defaults = PLATFORM_DEFAULT_TIER_CONFIG[tier];
    return this.platformFeeDefaultRepository.save(
      this.platformFeeDefaultRepository.create({
        tier,
        ...defaults,
      }),
    );
  }

  private normalizeFeeShape(source: FeeShape): FeeShape {
    return {
      transactionFeePercentage: this.toPercentString(source.transactionFeePercentage),
      transactionFeeFlat: this.toMoneyString(source.transactionFeeFlat),
      settlementFeePercentage: this.toPercentString(source.settlementFeePercentage),
      minimumFee: this.toMoneyString(source.minimumFee),
      maximumFee: this.toMoneyString(source.maximumFee),
      tieredFees: source.tieredFees
        ? source.tieredFees
            .map((tier) => ({
              minVolumeUsd: parseNumeric(tier.minVolumeUsd, 'tieredFees.minVolumeUsd'),
              maxVolumeUsd:
                tier.maxVolumeUsd === null
                  ? null
                  : parseNumeric(tier.maxVolumeUsd, 'tieredFees.maxVolumeUsd'),
              feePercentage: this.toPercentString(tier.feePercentage),
            }))
            .sort((a, b) => a.minVolumeUsd - b.minVolumeUsd)
        : null,
    };
  }

  private normalizeTieredFees(tiers: TieredFeeDto[]): TieredFee[] {
    return tiers.map((tier) => ({
      minVolumeUsd: parseNumeric(tier.minVolumeUsd, 'tieredFees.minVolumeUsd'),
      maxVolumeUsd:
        tier.maxVolumeUsd === null || tier.maxVolumeUsd === undefined
          ? null
          : parseNumeric(tier.maxVolumeUsd, 'tieredFees.maxVolumeUsd'),
      feePercentage: this.toPercentString(tier.feePercentage),
    }));
  }

  private validateFeeShape(config: FeeShape): void {
    assertFeePercentageWithinBounds(config.transactionFeePercentage, 'transactionFeePercentage');

    const minimumFee = parseNumeric(config.minimumFee, 'minimumFee');
    const maximumFee = parseNumeric(config.maximumFee, 'maximumFee');
    if (minimumFee > maximumFee) {
      throw new UnprocessableEntityException({
        field: 'minimumFee',
        message: 'minimumFee must be less than or equal to maximumFee',
        code: 'INVALID_MIN_MAX_RANGE',
      });
    }

    if (config.tieredFees) {
      validateTieredFees(config.tieredFees);
    }
  }

  private async updateMerchantEmbeddedFeeStructure(merchant: Merchant, feeShape: FeeShape): Promise<void> {
    merchant.feeStructure = {
      transactionFeePercentage: this.toPercentString(feeShape.transactionFeePercentage),
      transactionFeeFlat: this.toMoneyString(feeShape.transactionFeeFlat),
      settlementFeePercentage: this.toPercentString(feeShape.settlementFeePercentage),
      minimumFee: this.toMoneyString(feeShape.minimumFee),
      maximumFee: this.toMoneyString(feeShape.maximumFee),
      tieredFees: feeShape.tieredFees,
    };

    await this.merchantRepository.save(merchant);
  }

  private async invalidateMerchantCaches(merchantId: string): Promise<void> {
    await this.cacheManager.del(`merchant_detail_${merchantId}`);
    await this.cacheManager.del(`merchant_fee_config_${merchantId}`);
  }

  private toPercentString(value: string | number): string {
    const numeric = parseNumeric(value, 'percentage');
    return numeric.toFixed(2);
  }

  private toMoneyString(value: string | number): string {
    const numeric = parseNumeric(value, 'amount');
    return numeric.toFixed(2);
  }
}
