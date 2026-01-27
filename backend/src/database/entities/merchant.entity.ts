import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    OneToMany,
} from 'typeorm';
import { Settlement } from '../../settlement/entities/settlement.entity';
import { PaymentRequest } from './payment-request.entity';

export enum MerchantStatus {
    ACTIVE = 'active',
    INACTIVE = 'inactive',
    SUSPENDED = 'suspended',
}

@Entity('merchants')
export class Merchant {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ name: 'name', type: 'varchar', length: 255 })
    name!: string;

    @Column({ name: 'business_name', type: 'varchar', length: 255, nullable: true })
    businessName!: string;

    @Column({ name: 'email', type: 'varchar', length: 255, unique: true })
    email!: string;

    @Column({
        type: 'enum',
        enum: MerchantStatus,
        default: MerchantStatus.ACTIVE,
    })
    status!: MerchantStatus;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    // Relationships
    @OneToMany(() => Settlement, (settlement) => settlement.merchant)
    settlements!: Settlement[];

    @OneToMany(() => PaymentRequest, (paymentRequest) => paymentRequest.merchant)
    paymentRequests!: PaymentRequest[];
}
