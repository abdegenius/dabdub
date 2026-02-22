import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Merchant, MerchantStatus, KycStatus } from '../../../database/entities/merchant.entity';
import {
  KycVerification,
  KycVerificationStatus,
} from '../../entities/kyc-verification.entity';
import { DocumentStatus, DocumentType } from '../../entities/kyc-document.entity';
import { KycReviewService } from '../kyc-review.service';
import { StorageService } from '../storage.service';
import { KycAuditService } from '../kyc-audit.service';
import { NotificationService } from '../../../notification/notification.service';
import { AuditAction } from '../../entities/kyc-audit-log.entity';
import { KycRejectionReason } from '../../enums/kyc-review.enums';

describe('KycReviewService', () => {
  let service: KycReviewService;
  let verificationRepository: any;
  let merchantRepository: any;
  let dataSource: any;
  let storageService: any;
  let auditService: any;
  let notificationService: any;
  let cacheManager: any;

  const merchant: Partial<Merchant> = {
    id: 'merchant-1',
    email: 'merchant@example.com',
    status: MerchantStatus.PENDING,
    kycStatus: KycStatus.PENDING,
  };

  const verification: Partial<KycVerification> = {
    id: 'kyc-1',
    merchantId: 'merchant-1',
    status: KycVerificationStatus.UNDER_REVIEW,
    createdAt: new Date('2026-02-20T10:00:00.000Z'),
    submittedAt: new Date('2026-02-20T10:00:00.000Z'),
    metadata: { submissionVersion: 2 },
    documents: [
      {
        id: 'doc-1',
        documentType: DocumentType.BUSINESS_REGISTRATION,
        status: DocumentStatus.UPLOADED,
        fileName: 'registration.pdf',
        filePath: 'docs/doc-1.pdf',
        createdAt: new Date('2026-02-20T10:00:00.000Z'),
      } as any,
    ],
  };

  const mockManager = {
    getRepository: jest.fn(),
  };

  beforeEach(async () => {
    verificationRepository = {
      findOne: jest.fn(),
    };
    merchantRepository = {
      findOne: jest.fn(),
    };
    dataSource = {
      transaction: jest.fn(),
    };
    storageService = {
      getSignedUrl: jest.fn(),
    };
    auditService = {
      logAction: jest.fn(),
    };
    notificationService = {
      sendNotification: jest.fn(),
    };
    cacheManager = {
      del: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KycReviewService,
        {
          provide: getRepositoryToken(KycVerification),
          useValue: verificationRepository,
        },
        {
          provide: getRepositoryToken(Merchant),
          useValue: merchantRepository,
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: StorageService,
          useValue: storageService,
        },
        {
          provide: KycAuditService,
          useValue: auditService,
        },
        {
          provide: NotificationService,
          useValue: notificationService,
        },
        {
          provide: CACHE_MANAGER,
          useValue: cacheManager,
        },
      ],
    }).compile();

    service = module.get<KycReviewService>(KycReviewService);
  });

  const wireTransaction = () => {
    const txVerificationRepo = { save: jest.fn().mockImplementation(async (v) => v) };
    const txMerchantRepo = { save: jest.fn().mockImplementation(async (m) => m) };
    mockManager.getRepository.mockImplementation((entity: any) => {
      if (entity === KycVerification) return txVerificationRepo;
      if (entity === Merchant) return txMerchantRepo;
      return null;
    });
    dataSource.transaction.mockImplementation(async (cb: any) => cb(mockManager));
    return { txVerificationRepo, txMerchantRepo };
  };

  it('generates pre-signed URLs on getKycSubmission', async () => {
    const sourceVerification = { ...verification, documents: [...(verification.documents || [])] };
    verificationRepository.findOne.mockResolvedValue(sourceVerification);
    storageService.getSignedUrl.mockResolvedValue('https://signed.example/doc-1');

    const result = await service.getKycSubmission('merchant-1');

    expect(storageService.getSignedUrl).toHaveBeenCalledWith('docs/doc-1.pdf', 900);
    expect(result.documents[0].downloadUrl).toBe('https://signed.example/doc-1');
    expect(result.submissionVersion).toBe(2);
    expect((sourceVerification.documents?.[0] as any).downloadUrl).toBeUndefined();
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('starts review successfully', async () => {
    const kycInProcessing = {
      ...verification,
      status: KycVerificationStatus.PROCESSING,
    };
    verificationRepository.findOne.mockResolvedValue(kycInProcessing);
    merchantRepository.findOne.mockResolvedValue({ ...merchant });
    wireTransaction();

    await service.startReview('merchant-1', 'admin-1');

    expect(auditService.logAction).toHaveBeenCalledWith(
      'kyc-1',
      AuditAction.MANUAL_REVIEW_STARTED,
      expect.any(String),
      'admin-1',
      'admin',
      expect.anything(),
      expect.objectContaining({ status: KycVerificationStatus.UNDER_REVIEW }),
      expect.anything(),
    );
    expect(notificationService.sendNotification).toHaveBeenCalled();
    expect(cacheManager.del).toHaveBeenCalledWith('merchant_detail_merchant-1');
  });

  it('approves KYC and syncs merchant status', async () => {
    verificationRepository.findOne.mockResolvedValue({ ...verification });
    merchantRepository.findOne.mockResolvedValue({ ...merchant });
    const { txMerchantRepo } = wireTransaction();

    await service.approveKyc('merchant-1', 'admin-1', {
      reviewNote: 'Everything checks out and can be approved.',
    });

    expect(txMerchantRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: MerchantStatus.ACTIVE,
        kycStatus: KycStatus.APPROVED,
      }),
    );
    expect(auditService.logAction).toHaveBeenCalledWith(
      'kyc-1',
      AuditAction.VERIFICATION_APPROVED,
      expect.any(String),
      'admin-1',
      'admin',
      expect.anything(),
      expect.objectContaining({ status: KycVerificationStatus.APPROVED }),
      expect.objectContaining({
        reviewNote: 'Everything checks out and can be approved.',
      }),
    );
    expect(cacheManager.del).toHaveBeenCalledWith('merchant_detail_merchant-1');
  });

  it('rejects KYC without exposing internal review note to notification', async () => {
    verificationRepository.findOne.mockResolvedValue({ ...verification });
    merchantRepository.findOne.mockResolvedValue({ ...merchant });
    const { txMerchantRepo } = wireTransaction();

    await service.rejectKyc('merchant-1', 'admin-1', {
      reviewNote: 'Document inconsistency found during manual review.',
      rejectionReason: KycRejectionReason.FRAUDULENT_DOCUMENTS,
    });

    expect(txMerchantRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: MerchantStatus.PENDING,
        kycStatus: KycStatus.REJECTED,
      }),
    );
    const notificationCall = notificationService.sendNotification.mock.calls[0];
    expect(notificationCall[3]).not.toContain('Document inconsistency');
    expect(notificationCall[5]).toEqual({
      rejectionReason: KycRejectionReason.FRAUDULENT_DOCUMENTS,
    });
    expect(auditService.logAction).toHaveBeenCalledWith(
      'kyc-1',
      AuditAction.VERIFICATION_REJECTED,
      expect.any(String),
      'admin-1',
      'admin',
      expect.anything(),
      expect.objectContaining({ status: KycVerificationStatus.REJECTED }),
      expect.objectContaining({
        rejectionReason: KycRejectionReason.FRAUDULENT_DOCUMENTS,
        reviewNote: 'Document inconsistency found during manual review.',
      }),
    );
  });

  it('requests resubmission and sets resubmission fields', async () => {
    verificationRepository.findOne.mockResolvedValue({ ...verification });
    merchantRepository.findOne.mockResolvedValue({ ...merchant });
    const { txVerificationRepo, txMerchantRepo } = wireTransaction();

    await service.requestResubmission('merchant-1', 'admin-1', {
      resubmissionFields: ['businessRegistrationNumber', 'addressProof'],
      message: 'Please re-upload the listed documents with higher clarity.',
    });

    expect(txVerificationRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: KycVerificationStatus.RESUBMISSION_REQUESTED,
        metadata: expect.objectContaining({
          resubmissionFields: ['businessRegistrationNumber', 'addressProof'],
        }),
      }),
    );
    expect(txMerchantRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: MerchantStatus.PENDING,
        kycStatus: KycStatus.RESUBMISSION_REQUESTED,
      }),
    );
    expect(auditService.logAction).toHaveBeenCalledWith(
      'kyc-1',
      AuditAction.STATUS_CHANGED,
      expect.any(String),
      'admin-1',
      'admin',
      expect.anything(),
      expect.objectContaining({
        status: KycVerificationStatus.RESUBMISSION_REQUESTED,
      }),
      expect.objectContaining({
        resubmissionFields: ['businessRegistrationNumber', 'addressProof'],
      }),
    );
  });

  it('throws 409 when startReview is called with non-pending merchant KYC status', async () => {
    const kycInProcessing = {
      ...verification,
      status: KycVerificationStatus.PROCESSING,
    };
    verificationRepository.findOne.mockResolvedValue(kycInProcessing);
    merchantRepository.findOne.mockResolvedValue({
      ...merchant,
      kycStatus: KycStatus.REJECTED,
    });

    await expect(service.startReview('merchant-1', 'admin-1')).rejects.toThrow(
      ConflictException,
    );
  });

  it('throws 409 when startReview is called with invalid verification status', async () => {
    verificationRepository.findOne.mockResolvedValue({
      ...verification,
      status: KycVerificationStatus.DOCUMENTS_PENDING,
    });
    merchantRepository.findOne.mockResolvedValue({ ...merchant });

    await expect(service.startReview('merchant-1', 'admin-1')).rejects.toThrow(
      ConflictException,
    );
  });

  it('throws 409 when approving from invalid verification status', async () => {
    verificationRepository.findOne.mockResolvedValue({
      ...verification,
      status: KycVerificationStatus.DOCUMENTS_PENDING,
    });
    merchantRepository.findOne.mockResolvedValue({ ...merchant });

    await expect(
      service.approveKyc('merchant-1', 'admin-1', {
        reviewNote: 'Cannot approve yet.',
      }),
    ).rejects.toThrow(ConflictException);

  });

  it('throws 409 when rejecting from invalid verification status', async () => {
    verificationRepository.findOne.mockResolvedValue({
      ...verification,
      status: KycVerificationStatus.DOCUMENTS_PENDING,
    });
    merchantRepository.findOne.mockResolvedValue({ ...merchant });

    await expect(
      service.rejectKyc('merchant-1', 'admin-1', {
        reviewNote: 'Not enough information in submission.',
        rejectionReason: KycRejectionReason.INCOMPLETE_SUBMISSION,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('throws 409 when requesting resubmission from invalid verification status', async () => {
    verificationRepository.findOne.mockResolvedValue({
      ...verification,
      status: KycVerificationStatus.DOCUMENTS_PENDING,
    });
    merchantRepository.findOne.mockResolvedValue({ ...merchant });

    await expect(
      service.requestResubmission('merchant-1', 'admin-1', {
        resubmissionFields: ['businessRegistrationNumber'],
        message: 'Please submit missing information for validation.',
      }),
    ).rejects.toThrow(ConflictException);
  });
});
