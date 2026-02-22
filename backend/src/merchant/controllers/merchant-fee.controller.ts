import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../../auth/guards/jwt.guard';
import { RequirePermissionGuard } from '../../auth/guards/require-permission.guard';
import { SuperAdminGuard } from '../../auth/guards/super-admin.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { MerchantFeeService } from '../services/merchant-fee.service';
import {
  UpdateMerchantFeesDto,
  UpdatePlatformFeeDefaultsDto,
} from '../dto/merchant-fee.dto';

@ApiTags('Merchant Fees')
@Controller('api/v1')
@UseGuards(JwtGuard, RequirePermissionGuard)
@ApiBearerAuth()
export class MerchantFeeController {
  constructor(private readonly merchantFeeService: MerchantFeeService) {}

  @Get('merchants/:id/fees')
  @RequirePermission('merchants:read')
  @ApiOperation({ summary: 'Get merchant fee configuration' })
  async getMerchantFees(@Param('id') merchantId: string) {
    return this.merchantFeeService.getMerchantFeeConfig(merchantId);
  }

  @Put('merchants/:id/fees')
  @RequirePermission('merchants:write')
  @ApiOperation({ summary: 'Update merchant fee configuration' })
  async updateMerchantFees(
    @Param('id') merchantId: string,
    @Body() dto: UpdateMerchantFeesDto,
    @Req() req: any,
  ) {
    const adminUser = await this.merchantFeeService.getAdminUserSummary(req.user.id);
    return this.merchantFeeService.updateMerchantFeeConfig(merchantId, dto, adminUser);
  }

  @Post('merchants/:id/fees/reset-to-defaults')
  @RequirePermission('merchants:write')
  @ApiOperation({ summary: 'Reset merchant fee configuration to tier defaults' })
  async resetToDefaults(@Param('id') merchantId: string, @Req() req: any) {
    const adminUser = await this.merchantFeeService.getAdminUserSummary(req.user.id);
    return this.merchantFeeService.resetMerchantFeesToDefaults(merchantId, adminUser);
  }

  @Get('config/fees/defaults')
  @RequirePermission('config:read')
  @ApiOperation({ summary: 'Get platform fee defaults by merchant tier' })
  async getPlatformFeeDefaults(): Promise<Record<string, unknown>> {
    return this.merchantFeeService.getPlatformFeeDefaults();
  }

  @Put('config/fees/defaults')
  @UseGuards(SuperAdminGuard)
  @RequirePermission('config:write')
  @ApiOperation({ summary: 'Update platform fee defaults for a tier (SUPER_ADMIN only)' })
  async updatePlatformFeeDefaults(
    @Body() dto: UpdatePlatformFeeDefaultsDto,
    @Req() req: any,
  ): Promise<Record<string, unknown>> {
    const adminUser = await this.merchantFeeService.getAdminUserSummary(req.user.id);
    return this.merchantFeeService.updatePlatformFeeDefaults(dto, adminUser);
  }
}
