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

export function resolveSeedPassword(
  key: SeedPasswordKey,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const environmentKey = passwordEnvKeys[key];
  const value =
    environment[environmentKey] ??
    (key === 'admin' ? undefined : environment.SEED_DEFAULT_PASSWORD);
  if (!value || !value.trim() || value.trim().toUpperCase().startsWith('CHANGE_ME')) {
    const acceptedEnvironmentKeys =
      key === 'admin' ? environmentKey : `${environmentKey} or SEED_DEFAULT_PASSWORD`;
    throw new Error(
      `Seed password must be explicitly configured through ${acceptedEnvironmentKeys}; placeholder values are rejected`,
    );
  }

  return value;
}

export function shouldResetExistingSeedUserPasswords(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  const configured = environment.SEED_RESET_EXISTING_USER_PASSWORDS?.trim().toLowerCase();

  if (configured === 'true' || configured === '1' || configured === 'yes') {
    return true;
  }

  if (configured === 'false' || configured === '0' || configured === 'no') {
    return false;
  }

  return false;
}
