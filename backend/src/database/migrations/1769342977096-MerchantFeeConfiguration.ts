import { MigrationInterface, QueryRunner } from 'typeorm';

export class MerchantFeeConfiguration1769342977096 implements MigrationInterface {
  name = 'MerchantFeeConfiguration1769342977096';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "merchant_fee_configs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "merchant_id" uuid NOT NULL,
        "transaction_fee_percentage" decimal(7,4) NOT NULL,
        "transaction_fee_flat" decimal(10,2) NOT NULL,
        "settlement_fee_percentage" decimal(7,4) NOT NULL,
        "minimum_fee" decimal(10,2) NOT NULL,
        "maximum_fee" decimal(10,2) NOT NULL,
        "tiered_fees" jsonb,
        "is_custom" boolean NOT NULL DEFAULT false,
        "updated_by_id" varchar,
        CONSTRAINT "PK_merchant_fee_configs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_merchant_fee_configs_merchant_id"
      ON "merchant_fee_configs" ("merchant_id")
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_merchant_fee_configs_merchant_id'
        ) THEN
          ALTER TABLE "merchant_fee_configs"
            ADD CONSTRAINT "FK_merchant_fee_configs_merchant_id"
            FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE;
        END IF;
      END;
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_merchant_fee_configs_updated_by_id'
        ) THEN
          ALTER TABLE "merchant_fee_configs"
            ADD CONSTRAINT "FK_merchant_fee_configs_updated_by_id"
            FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
        END IF;
      END;
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "platform_fee_defaults" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "tier" varchar(50) NOT NULL,
        "transaction_fee_percentage" decimal(7,4) NOT NULL,
        "transaction_fee_flat" decimal(10,2) NOT NULL,
        "settlement_fee_percentage" decimal(7,4) NOT NULL,
        "minimum_fee" decimal(10,2) NOT NULL,
        "maximum_fee" decimal(10,2) NOT NULL,
        "tiered_fees" jsonb,
        CONSTRAINT "PK_platform_fee_defaults" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_platform_fee_defaults_tier"
      ON "platform_fee_defaults" ("tier")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "platform_fee_audit_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "action" varchar(100) NOT NULL,
        "changed_by" jsonb NOT NULL,
        "changes" jsonb,
        "reason" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_platform_fee_audit_logs" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "platform_fee_audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "platform_fee_defaults"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "merchant_fee_configs"`);
  }
}
