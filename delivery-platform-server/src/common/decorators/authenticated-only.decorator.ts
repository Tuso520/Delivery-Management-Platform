import { SetMetadata } from '@nestjs/common';

export const AUTHENTICATED_ONLY_KEY = 'authenticated_only';

/**
 * Marks an endpoint whose only authorization requirement is a valid session.
 * JwtAuthGuard remains the enforcing boundary; the marker makes the contract
 * explicit and prevents an empty permission array from looking accidental.
 */
export const AuthenticatedOnly = () => SetMetadata(AUTHENTICATED_ONLY_KEY, true);
