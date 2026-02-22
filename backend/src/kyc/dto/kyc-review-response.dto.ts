import { KycVerificationStatus } from '../entities/kyc-verification.entity';

export interface KycReviewDocumentResponseDto {
  id: string;
  documentType: string;
  status: string;
  fileName: string;
  uploadedAt: Date;
  downloadUrl: string;
  expiresAt: Date;
}

export interface KycSubmissionResponseDto {
  id: string;
  merchantId: string;
  status: KycVerificationStatus;
  submissionVersion: number;
  businessInfo?: Record<string, any>;
  reviewedById?: string;
  reviewedAt?: Date;
  reviewNote?: string;
  rejectionReason?: string;
  resubmissionFields?: string[];
  submittedAt?: Date;
  documents: KycReviewDocumentResponseDto[];
}
