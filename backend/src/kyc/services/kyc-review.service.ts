import {
  ConflictException,
  Injectable,
  NotFoundException,
  Inject,
  Logger,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Merchant,
  MerchantStatus,
  KycStatus,
} from '../../database/entities/merchant.entity';
import { NotificationService } from '../../notification/notification.service';
import { NotificationType } from '../../notification/entities/notification.entity';
import { KycAuditService } from './kyc-audit.service';
import { KycDocument } from '../entities/kyc-document.entity';
import {
  KycVerification,
  KycVerificationStatus,
} from '../entities/kyc-verification.entity';
import { AuditAction } from '../entities/kyc-audit-log.entity';
import { StorageService } from './storage.service';
import { ApproveKycDto } from '../dto/approve-kyc.dto';
import { RejectKycDto } from '../dto/reject-kyc.dto';
import { RequestResubmissionDto } from '../dto/request-resubmission.dto';
import { KycSubmissionResponseDto } from '../dto/kyc-review-response.dto';

@Injectable()
export class KycReviewService {
  private readonly logger = new Logger(KycReviewService.name);
  private static readonly PRESIGNED_URL_TTL_SECONDS = 15 * 60;

  constructor(
    @InjectRepository(KycVerification)
    private readonly verificationRepository: Repository<KycVerification>,
    @InjectRepository(Merchant)
    private readonly merchantRepository: Repository<Merchant>,
    private readonly dataSource: DataSource,
    private readonly storageService: StorageService,
    private readonly auditService: KycAuditService,
    private readonly notificationService: NotificationService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async getKycSubmission(merchantId: string): Promise<KycSubmissionResponseDto> {
    const verification = await this.findLatestVerification(merchantId, true);
    const expiresAt = new Date(
      Date.now() + KycReviewService.PRESIGNED_URL_TTL_SECONDS * 1000,
    );

    const documents = await Promise.all(
      (verification.documents || []).map(async (doc: KycDocument) => ({
        id: doc.id,
        documentType: doc.documentType,
        status: doc.status,
        fileName: doc.fileName,
        uploadedAt: doc.createdAt,
        downloadUrl: await this.storageService.getSignedUrl(
          doc.filePath,
          KycReviewService.PRESIGNED_URL_TTL_SECONDS,
        ),
        expiresAt,
      })),
    );

    return {
      id: verification.id,
      merchantId: verification.merchantId,
      status: verification.status,
      submissionVersion: Number(verification.metadata?.submissionVersion || 1),
      businessInfo: {
        businessName: verification.businessName,
        businessRegistrationNumber: verification.businessRegistrationNumber,
        businessType: verification.businessType,
        businessCountry: verification.businessCountry,
        businessAddress: verification.businessAddress,
      },
      reviewedById: verification.reviewerId,
      reviewedAt: verification.processedAt,
      reviewNote: verification.reviewNotes,
      rejectionReason: verification.rejectionReason,
      resubmissionFields: verification.metadata?.resubmissionFields || [],
      submittedAt: verification.submittedAt,
      documents,
    };
  }

  async startReview(merchantId: string, adminId: string): Promise<void> {
    const merchant = await this.findMerchantOrFail(merchantId);
    const verification = await this.findLatestVerification(merchantId);

    if (merchant.kycStatus !== KycStatus.PENDING) {
      throw new ConflictException(
        `Merchant KYC status is ${merchant.kycStatus}. Expected ${KycStatus.PENDING} to start review.`,
      );
    }

    if (
      ![
        KycVerificationStatus.DOCUMENTS_UPLOADED,
        KycVerificationStatus.PROCESSING,
      ].includes(verification.status)
    ) {
      throw new ConflictException(
        `KYC is currently ${verification.status}. Expected documents uploaded or processing to perform this action.`,
      );
    }

    const previousVerification = { ...verification };
    const previousMerchant = { ...merchant };

    await this.dataSource.transaction(async (manager) => {
      const verificationRepo = manager.getRepository(KycVerification);
      const merchantRepo = manager.getRepository(Merchant);

      verification.status = KycVerificationStatus.UNDER_REVIEW;
      verification.reviewerId = adminId;

      merchant.kycStatus = KycStatus.UNDER_REVIEW;

      await verificationRepo.save(verification);
      await merchantRepo.save(merchant);
    });

    await this.auditService.logAction(
      verification.id,
      AuditAction.MANUAL_REVIEW_STARTED,
      'KYC review started',
      adminId,
      'admin',
      previousVerification,
      verification,
      {
        merchantBefore: { status: previousMerchant.status, kycStatus: previousMerchant.kycStatus },
        merchantAfter: { status: merchant.status, kycStatus: merchant.kycStatus },
      },
    );

    await this.notificationService.sendNotification(
      merchant.id,
      NotificationType.EMAIL,
      merchant.email,
      'Your KYC verification is currently under review.',
      'KYC Review Started',
    );

    await this.invalidateMerchantCache(merchant.id);
  }

  async approveKyc(
    merchantId: string,
    adminId: string,
    dto: ApproveKycDto,
  ): Promise<void> {
    const merchant = await this.findMerchantOrFail(merchantId);
    const verification = await this.findLatestVerification(merchantId);
    this.validateKycStatus(verification, KycVerificationStatus.UNDER_REVIEW);

    const previousVerification = { ...verification };
    const previousMerchant = { ...merchant };
    const now = new Date();

    await this.dataSource.transaction(async (manager) => {
      const verificationRepo = manager.getRepository(KycVerification);
      const merchantRepo = manager.getRepository(Merchant);

      verification.status = KycVerificationStatus.APPROVED;
      verification.reviewNotes = dto.reviewNote;
      verification.reviewerId = adminId;
      verification.approvedAt = now;
      verification.processedAt = now;

      merchant.kycStatus = KycStatus.APPROVED;
      merchant.status = MerchantStatus.ACTIVE;
      merchant.kycVerifiedAt = now;

      await verificationRepo.save(verification);
      await merchantRepo.save(merchant);
    });

    await this.auditService.logAction(
      verification.id,
      AuditAction.VERIFICATION_APPROVED,
      'KYC approved',
      adminId,
      'admin',
      previousVerification,
      verification,
      {
        reviewNote: dto.reviewNote,
        merchantBefore: { status: previousMerchant.status, kycStatus: previousMerchant.kycStatus },
        merchantAfter: { status: merchant.status, kycStatus: merchant.kycStatus },
      },
    );

    await this.notificationService.sendNotification(
      merchant.id,
      NotificationType.EMAIL,
      merchant.email,
      'Congratulations, your account is now active.',
      'KYC Approved',
    );

    await this.invalidateMerchantCache(merchant.id);
  }

  async rejectKyc(
    merchantId: string,
    adminId: string,
    dto: RejectKycDto,
  ): Promise<void> {
    const merchant = await this.findMerchantOrFail(merchantId);
    const verification = await this.findLatestVerification(merchantId);
    this.validateKycStatus(verification, KycVerificationStatus.UNDER_REVIEW);

    const previousVerification = { ...verification };
    const previousMerchant = { ...merchant };
    const now = new Date();

    await this.dataSource.transaction(async (manager) => {
      const verificationRepo = manager.getRepository(KycVerification);
      const merchantRepo = manager.getRepository(Merchant);

      verification.status = KycVerificationStatus.REJECTED;
      verification.reviewNotes = dto.reviewNote; // internal only
      verification.rejectionReason = dto.rejectionReason;
      verification.reviewerId = adminId;
      verification.rejectedAt = now;
      verification.processedAt = now;

      merchant.kycStatus = KycStatus.REJECTED;
      merchant.status = MerchantStatus.PENDING;

      await verificationRepo.save(verification);
      await merchantRepo.save(merchant);
    });

    await this.auditService.logAction(
      verification.id,
      AuditAction.VERIFICATION_REJECTED,
      'KYC rejected',
      adminId,
      'admin',
      previousVerification,
      verification,
      {
        rejectionReason: dto.rejectionReason,
        reviewNote: dto.reviewNote,
        merchantBefore: { status: previousMerchant.status, kycStatus: previousMerchant.kycStatus },
        merchantAfter: { status: merchant.status, kycStatus: merchant.kycStatus },
      },
    );

    await this.notificationService.sendNotification(
      merchant.id,
      NotificationType.EMAIL,
      merchant.email,
      `Your KYC verification was rejected. Reason: ${dto.rejectionReason}`,
      'KYC Rejected',
      { rejectionReason: dto.rejectionReason },
    );

    await this.invalidateMerchantCache(merchant.id);
  }

  async requestResubmission(
    merchantId: string,
    adminId: string,
    dto: RequestResubmissionDto,
  ): Promise<void> {
    const merchant = await this.findMerchantOrFail(merchantId);
    const verification = await this.findLatestVerification(merchantId);
    this.validateKycStatus(verification, KycVerificationStatus.UNDER_REVIEW);

    const previousVerification = { ...verification };
    const previousMerchant = { ...merchant };
    const now = new Date();

    await this.dataSource.transaction(async (manager) => {
      const verificationRepo = manager.getRepository(KycVerification);
      const merchantRepo = manager.getRepository(Merchant);

      verification.status = KycVerificationStatus.RESUBMISSION_REQUESTED;
      verification.reviewNotes = dto.message;
      verification.reviewerId = adminId;
      verification.processedAt = now;
      verification.metadata = {
        ...(verification.metadata || {}),
        resubmissionFields: dto.resubmissionFields,
        resubmissionMessage: dto.message,
      };

      merchant.kycStatus = KycStatus.RESUBMISSION_REQUESTED;
      merchant.status = MerchantStatus.PENDING;

      await verificationRepo.save(verification);
      await merchantRepo.save(merchant);
    });

    await this.auditService.logAction(
      verification.id,
      AuditAction.STATUS_CHANGED,
      'KYC resubmission requested',
      adminId,
      'admin',
      previousVerification,
      verification,
      {
        resubmissionFields: dto.resubmissionFields,
        merchantBefore: { status: previousMerchant.status, kycStatus: previousMerchant.kycStatus },
        merchantAfter: { status: merchant.status, kycStatus: merchant.kycStatus },
      },
    );

    await this.notificationService.sendNotification(
      merchant.id,
      NotificationType.EMAIL,
      merchant.email,
      `Please resubmit KYC fields: ${dto.resubmissionFields.join(', ')}. ${dto.message}`,
      'KYC Resubmission Requested',
      {
        resubmissionFields: dto.resubmissionFields,
      },
    );

    await this.invalidateMerchantCache(merchant.id);
  }

  private validateKycStatus(
    verification: KycVerification,
    expected: KycVerificationStatus,
  ): void {
    if (verification.status !== expected) {
      throw new ConflictException(
        `KYC is currently ${verification.status}. Expected ${expected} to perform this action.`,
      );
    }
  }

  private async findMerchantOrFail(merchantId: string): Promise<Merchant> {
    const merchant = await this.merchantRepository.findOne({
      where: { id: merchantId },
    });
    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }
    return merchant;
  }

  private async findLatestVerification(
    merchantId: string,
    includeDocuments: boolean = false,
  ): Promise<KycVerification> {
    const verification = await this.verificationRepository.findOne({
      where: { merchantId },
      relations: includeDocuments ? ['documents'] : [],
      order: { createdAt: 'DESC' },
    });

    if (!verification) {
      throw new NotFoundException('KYC verification not found for merchant');
    }

    return verification;
  }

  private async invalidateMerchantCache(merchantId: string): Promise<void> {
    try {
      await this.cacheManager.del(`merchant_detail_${merchantId}`);
    } catch (error) {
      this.logger.warn(
        `Failed to invalidate merchant cache for ${merchantId}: ${(error as Error).message}`,
      );
    }
  }
}
