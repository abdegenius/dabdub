import { Injectable, Inject } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Settlement, SettlementStatus } from '../settlement/entities/settlement.entity';
import { Merchant } from '../database/entities/merchant.entity';
import { PaymentRequest, PaymentRequestStatus } from '../database/entities/payment-request.entity';

@Injectable()
export class AnalyticsService {
    constructor(
        @InjectRepository(Settlement)
        private settlementRepository: Repository<Settlement>,
        @InjectRepository(Merchant)
        private merchantRepository: Repository<Merchant>,
        @InjectRepository(PaymentRequest)
        private paymentRequestRepository: Repository<PaymentRequest>,
        @Inject('CACHE_MANAGER') private cacheManager: Cache,
    ) { }

    async getPaymentVolume(merchantId: string, startDate: Date, endDate: Date): Promise<any> {
        const cacheKey = `volume:${merchantId}:${startDate.getTime()}:${endDate.getTime()}`;
        const cached = await this.cacheManager.get(cacheKey);
        if (cached) return cached;

        const rawData = await this.paymentRequestRepository
            .createQueryBuilder('pr')
            .select('SUM(pr.amount)', 'totalVolume')
            .addSelect('pr.currency', 'currency')
            .where('pr.merchant_id = :merchantId', { merchantId })
            .andWhere('pr.created_at BETWEEN :startDate AND :endDate', { startDate, endDate })
            .andWhere('pr.status = :status', { status: PaymentRequestStatus.COMPLETED })
            .groupBy('pr.currency')
            .getRawMany();

        const result = rawData.map(d => ({ currency: d.currency, totalVolume: parseFloat(d.totalVolume) || 0 }));
        await this.cacheManager.set(cacheKey, result, 600000); // 10 minutes cache
        return result;
    }

    async getSettlementSuccessRate(merchantId: string): Promise<any> {
        const totalSettlements = await this.settlementRepository.count({
            where: { merchantId },
        });

        const successfulSettlements = await this.settlementRepository.count({
            where: { merchantId, status: SettlementStatus.COMPLETED },
        });

        return {
            total: totalSettlements,
            successful: successfulSettlements,
            rate: totalSettlements > 0 ? (successfulSettlements / totalSettlements) * 100 : 0,
        };
    }

    async getMerchantRevenue(merchantId: string): Promise<any> {
        const rawData = await this.settlementRepository
            .createQueryBuilder('s')
            .select('SUM(s.net_amount)', 'totalRevenue')
            .addSelect('s.currency', 'currency')
            .where('s.merchant_id = :merchantId', { merchantId })
            .andWhere('s.status = :status', { status: SettlementStatus.COMPLETED })
            .groupBy('s.currency')
            .getRawMany();

        return rawData.map(d => ({ currency: d.currency, totalRevenue: parseFloat(d.totalRevenue) || 0 }));
    }

    async getTransactionTrends(merchantId: string, startDate: Date, endDate: Date, interval: 'day' | 'week' | 'month'): Promise<any> {
        let truncDate = 'day';
        if (interval === 'week') truncDate = 'week';
        if (interval === 'month') truncDate = 'month';

        const rawData = await this.paymentRequestRepository
            .createQueryBuilder('pr')
            .select(`DATE_TRUNC('${truncDate}', pr.created_at) as period`)
            .addSelect('SUM(pr.amount)', 'volume')
            .addSelect('COUNT(pr.id)', 'count')
            .addSelect('pr.currency', 'currency')
            .where('pr.merchant_id = :merchantId', { merchantId })
            .andWhere('pr.created_at BETWEEN :startDate AND :endDate', { startDate, endDate })
            .andWhere('pr.status = :status', { status: PaymentRequestStatus.COMPLETED })
            .groupBy('period')
            .addGroupBy('pr.currency')
            .orderBy('period', 'ASC')
            .getRawMany();

        return rawData.map(d => ({
            period: d.period,
            volume: parseFloat(d.volume) || 0,
            count: parseInt(d.count, 10) || 0,
            currency: d.currency
        }));
    }

    async getFeeAnalysis(merchantId: string, startDate: Date, endDate: Date): Promise<any> {
        const rawData = await this.settlementRepository
            .createQueryBuilder('s')
            .select('SUM(s.fee_amount)', 'totalFees')
            .addSelect('AVG(s.fee_percentage)', 'averageFeePercentage')
            .addSelect('s.currency', 'currency')
            .where('s.merchant_id = :merchantId', { merchantId })
            .andWhere('s.processed_at BETWEEN :startDate AND :endDate', { startDate, endDate })
            .groupBy('s.currency')
            .getRawMany();

        return rawData.map(d => ({
            currency: d.currency,
            totalFees: parseFloat(d.totalFees) || 0,
            averageFeePercentage: parseFloat(d.averageFeePercentage) || 0
        }));
    }

    async getMerchantGrowth(merchantId: string, startDate: Date, endDate: Date): Promise<any> {
        // Growth in terms of volume compared to previous period?
        // Or simple transaction count growth?
        // Let's implement transaction count growth for now
        const currentPeriod = await this.paymentRequestRepository.count({
            where: {
                merchantId,
                createdAt: Between(startDate, endDate),
                status: PaymentRequestStatus.COMPLETED
            }
        });

        // Calculate previous period
        const duration = endDate.getTime() - startDate.getTime();
        const prevStartDate = new Date(startDate.getTime() - duration);
        const prevEndDate = startDate;

        const previousPeriod = await this.paymentRequestRepository.count({
            where: {
                merchantId,
                createdAt: Between(prevStartDate, prevEndDate),
                status: PaymentRequestStatus.COMPLETED
            }
        });

        const growth = previousPeriod > 0 ? ((currentPeriod - previousPeriod) / previousPeriod) * 100 : 0;
        return {
            currentPeriodCount: currentPeriod,
            previousPeriodCount: previousPeriod,
            growthPercentage: growth
        };
    }
}
