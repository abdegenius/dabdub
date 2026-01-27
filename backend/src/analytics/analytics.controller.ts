import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { AnalyticsService } from './analytics.service';
import { ReportService } from './report.service';

@Controller('analytics')
export class AnalyticsController {
    constructor(
        private readonly analyticsService: AnalyticsService,
        private readonly reportService: ReportService,
    ) { }

    @Get('reports/export')
    async exportReport(
        @Query('merchantId') merchantId: string,
        @Query('startDate') startDate: string,
        @Query('endDate') endDate: string,
        @Res() res: Response,
    ) {
        const csv = await this.reportService.generateMerchantReportCsv(merchantId, new Date(startDate), new Date(endDate));
        res.header('Content-Type', 'text/csv');
        res.header('Content-Disposition', `attachment; filename=report-${merchantId}-${startDate}.csv`);
        res.send(csv);
    }

    @Get('merchants/:merchantId/volume')
    async getPaymentVolume(
        @Param('merchantId') merchantId: string,
        @Query('startDate') startDate: string,
        @Query('endDate') endDate: string,
    ) {
        return this.analyticsService.getPaymentVolume(merchantId, new Date(startDate), new Date(endDate));
    }

    @Get('merchants/:merchantId/settlements/rate')
    async getSettlementSuccessRate(@Param('merchantId') merchantId: string) {
        return this.analyticsService.getSettlementSuccessRate(merchantId);
    }

    @Get('merchants/:merchantId/revenue')
    async getMerchantRevenue(@Param('merchantId') merchantId: string) {
        return this.analyticsService.getMerchantRevenue(merchantId);
    }

    @Get('merchants/:merchantId/trends')
    async getTransactionTrends(
        @Param('merchantId') merchantId: string,
        @Query('startDate') startDate: string,
        @Query('endDate') endDate: string,
        @Query('interval') interval: 'day' | 'week' | 'month' = 'day',
    ) {
        return this.analyticsService.getTransactionTrends(merchantId, new Date(startDate), new Date(endDate), interval);
    }

    @Get('merchants/:merchantId/fees')
    async getFeeAnalysis(
        @Param('merchantId') merchantId: string,
        @Query('startDate') startDate: string,
        @Query('endDate') endDate: string,
    ) {
        return this.analyticsService.getFeeAnalysis(merchantId, new Date(startDate), new Date(endDate));
    }

    @Get('merchants/:merchantId/growth')
    async getMerchantGrowth(
        @Param('merchantId') merchantId: string,
        @Query('startDate') startDate: string,
        @Query('endDate') endDate: string,
    ) {
        return this.analyticsService.getMerchantGrowth(merchantId, new Date(startDate), new Date(endDate));
    }
}
