import 'reflect-metadata';
import { MerchantFeeController } from './merchant-fee.controller';
import { JwtGuard } from '../../auth/guards/jwt.guard';
import { RequirePermissionGuard, REQUIRE_PERMISSION_KEY } from '../../auth/guards/require-permission.guard';
import { SuperAdminGuard } from '../../auth/guards/super-admin.guard';

describe('MerchantFeeController metadata', () => {
  it('enforces class guards for merchant fee routes', () => {
    const guards = Reflect.getMetadata('__guards__', MerchantFeeController) || [];
    const guardNames = guards.map((g: any) => g?.name ?? g?.constructor?.name);

    expect(guardNames).toContain(JwtGuard.name);
    expect(guardNames).toContain(RequirePermissionGuard.name);
  });

  it('enforces SUPER_ADMIN guard and config:write permission on platform defaults update route', () => {
    const method = MerchantFeeController.prototype.updatePlatformFeeDefaults;

    const methodGuards = Reflect.getMetadata('__guards__', method) || [];
    const methodGuardNames = methodGuards.map((g: any) => g?.name ?? g?.constructor?.name);
    expect(methodGuardNames).toContain(SuperAdminGuard.name);

    const permission = Reflect.getMetadata(REQUIRE_PERMISSION_KEY, method);
    expect(permission).toBe('config:write');
  });
});
