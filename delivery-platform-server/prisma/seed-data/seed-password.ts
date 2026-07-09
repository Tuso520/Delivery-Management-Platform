export type SeedPasswordKey =
  | 'admin'
  | 'delivery_mgr'
  | 'pm'
  | 'elec'
  | 'sw'
  | 'purchase'
  | 'finance'
  | 'standard'
  | 'partner';

const passwordEnvKeys: Record<SeedPasswordKey, string> = {
  admin: 'SEED_ADMIN_PASSWORD',
  delivery_mgr: 'SEED_DELIVERY_PASSWORD',
  pm: 'SEED_PM_PASSWORD',
  elec: 'SEED_ELEC_PASSWORD',
  sw: 'SEED_SW_PASSWORD',
  purchase: 'SEED_PURCHASE_PASSWORD',
  finance: 'SEED_FINANCE_PASSWORD',
  standard: 'SEED_STANDARD_PASSWORD',
  partner: 'SEED_PARTNER_PASSWORD',
};

const developmentPasswords: Record<SeedPasswordKey, string> = {
  admin: 'Admin@123',
  delivery_mgr: 'Delivery@123',
  pm: 'Pm@123456',
  elec: 'Elec@123',
  sw: 'Sw@123456',
  purchase: 'Purch@123',
  finance: 'Fin@12345',
  standard: 'Std@12345',
  partner: 'Partner@1',
};

export function resolveSeedPassword(
  key: SeedPasswordKey,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const environmentKey = passwordEnvKeys[key];
  const value =
    environment[environmentKey] ??
    (key === 'admin' ? undefined : environment.SEED_DEFAULT_PASSWORD);
  const placeholder = !value || value.startsWith('CHANGE_ME');
  if (environment.NODE_ENV === 'production' && placeholder) {
    throw new Error(`生产环境首次初始化必须配置 ${environmentKey}`);
  }
  return placeholder ? developmentPasswords[key] : value;
}

export function shouldResetExistingSeedUserPasswords(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  const configured = environment.SEED_RESET_EXISTING_USER_PASSWORDS
    ?.trim()
    .toLowerCase();

  if (configured === 'true' || configured === '1' || configured === 'yes') {
    return true;
  }

  if (configured === 'false' || configured === '0' || configured === 'no') {
    return false;
  }

  return environment.NODE_ENV !== 'production';
}
