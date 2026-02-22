import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../../auth/guards/jwt.guard';
import { RequirePermissionGuard } from '../../auth/guards/require-permission.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { KycReviewService } from '../services/kyc-review.service';
import { ApproveKycDto } from '../dto/approve-kyc.dto';
import { RejectKycDto } from '../dto/reject-kyc.dto';
import { RequestResubmissionDto } from '../dto/request-resubmission.dto';
import { KycSubmissionResponseDto } from '../dto/kyc-review-response.dto';

@ApiTags('KYC Review')
@Controller('api/v1/merchants/:id/kyc')
@UseGuards(JwtGuard, RequirePermissionGuard)
@ApiBearerAuth()
export class KycReviewController {
  constructor(private readonly kycReviewService: KycReviewService) {}

  @Get()
  @RequirePermission('merchants:kyc:review')
  @ApiOperation({ summary: 'Get merchant KYC submission with pre-signed document URLs' })
  @ApiResponse({ status: HttpStatus.OK, description: 'KYC submission returned' })
  async getKyc(@Param('id') merchantId: string): Promise<KycSubmissionResponseDto> {
    return this.kycReviewService.getKycSubmission(merchantId);
  }

  @Post('start-review')
  @RequirePermission('merchants:kyc:review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start KYC review' })
  async startReview(@Param('id') merchantId: string, @Req() req: any): Promise<void> {
    await this.kycReviewService.startReview(merchantId, req.user.id);
  }

  @Post('approve')
  @RequirePermission('merchants:kyc:review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve KYC' })
  async approve(
    @Param('id') merchantId: string,
    @Req() req: any,
    @Body() dto: ApproveKycDto,
  ): Promise<void> {
    await this.kycReviewService.approveKyc(merchantId, req.user.id, dto);
  }

  @Post('reject')
  @RequirePermission('merchants:kyc:review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject KYC' })
  async reject(
    @Param('id') merchantId: string,
    @Req() req: any,
    @Body() dto: RejectKycDto,
  ): Promise<void> {
    await this.kycReviewService.rejectKyc(merchantId, req.user.id, dto);
  }

  @Post('request-resubmission')
  @RequirePermission('merchants:kyc:review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request KYC resubmission' })
  async requestResubmission(
    @Param('id') merchantId: string,
    @Req() req: any,
    @Body() dto: RequestResubmissionDto,
  ): Promise<void> {
    await this.kycReviewService.requestResubmission(merchantId, req.user.id, dto);
  }
}
