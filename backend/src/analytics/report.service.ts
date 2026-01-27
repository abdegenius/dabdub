import { Injectable } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { SettlementStatus } from '../settlement/entities/settlement.entity';

@Injectable()
export class ReportService {
    constructor(private readonly analyticsService: AnalyticsService) { }

    async generateMerchantReportCsv(merchantId: string, startDate: Date, endDate: Date): Promise<string> {
        const volume = await this.analyticsService.getPaymentVolume(merchantId, startDate, endDate);
        const revenue = await this.analyticsService.getMerchantRevenue(merchantId);
        const trends = await this.analyticsService.getTransactionTrends(merchantId, startDate, endDate, 'day');

        // Simple CSV construction
        let csv = 'Report Type,Merchant Report\n';
        csv += `Period,${startDate.toISOString()} - ${endDate.toISOString()}\n\n`;

        csv += 'Summary Metrics\n';
        csv += 'Metric,Currency,Value\n';
        volume.forEach((v: any) => {
            csv += `Payment Volume,${v.currency},${v.totalVolume}\n`;
        });
        revenue.forEach((r: any) => {
            csv += `Net Revenue,${r.currency},${r.totalRevenue}\n`;
        });
        csv += '\n';

        csv += 'Daily Trends\n';
        csv += 'Date,Currency,Volume,Count\n';
        trends.forEach((t: any) => {
            csv += `${t.period},${t.currency},${t.volume},${t.count}\n`;
        });

        return csv;
    }
}
