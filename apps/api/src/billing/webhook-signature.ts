import { hmacSha256, safeEqual } from '../common/utils/crypto';

export const SIGNATURE_HEADER = 'x-launchpad-signature';
const SIGNATURE_PREFIX = 'sha256=';

/** Produces the header value a provider would send: `sha256=<hex hmac of raw body>`. */
export function signWebhookPayload(secret: string, rawBody: string | Buffer): string {
  return `${SIGNATURE_PREFIX}${hmacSha256(secret, rawBody)}`;
}

/** Constant-time verification of a webhook signature header against the raw request body. */
export function verifyWebhookSignature(secret: string, rawBody: string | Buffer | undefined, header: string | undefined): boolean {
  if (!rawBody || !header || !header.startsWith(SIGNATURE_PREFIX)) return false;
  const expected = signWebhookPayload(secret, rawBody);
  return safeEqual(expected, header.trim());
}
