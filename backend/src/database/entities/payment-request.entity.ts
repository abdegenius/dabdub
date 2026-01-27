import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
    OneToOne,
    Index,
} from 'typeorm';
import { Merchant } from './merchant.entity';
import { Settlement } from '../../settlement/entities/settlement.entity';

export enum PaymentRequestStatus {
    PENDING = 'pending',
    COMPLETED = 'completed',
    FAILED = 'failed',
    REFUNDED = 'refunded',
}

export enum PaymentRequestType {
    PAYMENT = 'payment',
    REFUND = 'refund',
}

@Entity('payment_requests')
@Index(['merchantId'])
@Index(['status'])
@Index(['createdAt'])
export class PaymentRequest {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ name: 'merchant_id', type: 'uuid' })
    merchantId!: string;

    @Column({ type: 'decimal', precision: 19, scale: 4 })
    amount!: number;

    @Column({ type: 'varchar', length: 3 })
    currency!: string;

    @Column({
        type: 'enum',
        enum: PaymentRequestStatus,
        default: PaymentRequestStatus.PENDING,
    })
    status!: PaymentRequestStatus;

    @Column({
        type: 'enum',
        enum: PaymentRequestType,
        default: PaymentRequestType.PAYMENT,
    })
    type!: PaymentRequestType;

    @Column({ name: 'description', type: 'text', nullable: true })
    description!: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
    completedAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    // Relationships
    @ManyToOne(() => Merchant, (merchant) => merchant.paymentRequests)
    @JoinColumn({ name: 'merchant_id' })
    merchant!: Merchant;

    @OneToOne(() => Settlement, (settlement) => settlement.paymentRequest)
    settlement!: Settlement;
}
