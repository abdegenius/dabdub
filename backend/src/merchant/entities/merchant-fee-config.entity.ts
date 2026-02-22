import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { BaseEntity } from '../../database/entities/base.entity';
import { Merchant } from '../../database/entities/merchant.entity';
import { UserEntity } from '../../database/entities/user.entity';

export interface TieredFee {
  minVolumeUsd: number;
  maxVolumeUsd: number | null;
  feePercentage: string;
}

@Entity('merchant_fee_configs')
@Index(['merchantId'], { unique: true })
export class MerchantFeeConfig extends BaseEntity {
  @Column({ name: 'merchant_id' })
  merchantId!: string;

  @ManyToOne(() => Merchant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'merchant_id' })
  merchant!: Merchant;

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

  @Column({ name: 'is_custom', type: 'boolean', default: false })
  isCustom!: boolean;

  @Column({ name: 'updated_by_id', nullable: true })
  updatedById!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'updated_by_id' })
  updatedBy!: UserEntity | null;
}
