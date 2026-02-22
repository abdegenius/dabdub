import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

// Entities
import { KycVerification } from './entities/kyc-verification.entity';
import { KycDocument } from './entities/kyc-document.entity';
import { KycAuditLog } from './entities/kyc-audit-log.entity';

// Controllers
import { KycVerificationController } from './controllers/kyc-verification.controller';
import { KycAdminController } from './controllers/kyc-admin.controller';
import { KycReviewController } from './controllers/kyc-review.controller';

// Services
import { KycVerificationService } from './services/kyc-verification.service';
import { KycDocumentService } from './services/kyc-document.service';
import { KycAuditService } from './services/kyc-audit.service';
import { StorageService } from './services/storage.service';
import { VerificationProviderService } from './services/verification-provider.service';
import { RiskAssessmentService } from './services/risk-assessment.service';
import { KycReviewService } from './services/kyc-review.service';

// Processors
import { KycProcessingProcessor } from './processors/kyc-processing.processor';
import { DocumentProcessingProcessor } from './processors/document-processing.processor';

// External modules
import { NotificationModule } from '../notification/notification.module';
import { AuthModule } from '../auth/auth.module';
import { Merchant } from '../database/entities/merchant.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      KycVerification,
      KycDocument,
      KycAuditLog,
      Merchant,
    ]),
    BullModule.registerQueue(
      {
        name: 'kyc-processing',
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      },
      {
        name: 'document-processing',
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      },
    ),
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    ConfigModule,
    NotificationModule,
    AuthModule,
  ],
  controllers: [
    KycVerificationController,
    KycAdminController,
    KycReviewController,
  ],
  providers: [
    KycVerificationService,
    KycDocumentService,
    KycAuditService,
    KycReviewService,
    StorageService,
    VerificationProviderService,
    RiskAssessmentService,
    KycProcessingProcessor,
    DocumentProcessingProcessor,
  ],
  exports: [
    KycVerificationService,
    KycDocumentService,
    KycAuditService,
    KycReviewService,
    StorageService,
  ],
})
export class KycModule {}
