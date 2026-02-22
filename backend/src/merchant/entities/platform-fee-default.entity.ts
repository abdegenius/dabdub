import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../database/entities/base.entity';
import { MerchantTier } from '../dto/merchant.dto';
import { TieredFee } from './merchant-fee-config.entity';

@Entity('platform_fee_defaults')
@Index(['tier'], { unique: true })
export class PlatformFeeDefault extends BaseEntity {
  @Column({
    type: 'varchar',
    length: 50,
  })
  tier!: MerchantTier;

  @Column({ name: 'transaction_fee_percentage', type: 'decimal', precision: 7, scale: 4 })
  transactionFeePercentage!: string;

  @Column({ name: 'transaction_fee_flat', type: 'decimal', precision: 10, scale: 2 })
  transactionFeeFlat!: string;

  @Column({ name: 'settlement_fee_percentage', type: 'decimal', precision: 7, scale: 4 })
  settlementFeePercentage!: string;

  @Column({ name: 'minimum_fee', type: 'decimal', precision: 10, scale: 2 })
  minimumFee!: string;

  @Column({ name: 'maximum_fee', type: 'decimal', precision: 10, scale: 2 })
  maximumFee!: string;

  @Column({ name: 'tiered_fees', type: 'jsonb', nullable: true })
  tieredFees!: TieredFee[] | null;
}
