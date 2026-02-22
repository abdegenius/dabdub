import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('platform_fee_audit_logs')
export class PlatformFeeAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  action!: string;

  @Column({ name: 'changed_by', type: 'jsonb' })
  changedBy!: {
    id: string;
    email: string;
    role: string;
  };

  @Column({ type: 'jsonb', nullable: true })
  changes!: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
