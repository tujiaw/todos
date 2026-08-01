const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const ALGORITHM_MAP: Record<string, TotpAlgorithm> = {
  SHA1: 'SHA-1',
  'SHA-1': 'SHA-1',
  SHA256: 'SHA-256',
  'SHA-256': 'SHA-256',
  SHA512: 'SHA-512',
  'SHA-512': 'SHA-512',
};

export type TotpAlgorithm = 'SHA-1' | 'SHA-256' | 'SHA-512';

export interface TotpConfig {
  secret: Uint8Array;
  period: number;
  digits: number;
  algorithm: TotpAlgorithm;
}

export function base32Decode(input: string): Uint8Array | null {
  const normalized = input.toUpperCase().replace(/[\s=-]/g, '');
  if (!normalized) return null;

  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) return null;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return bytes.length > 0 ? new Uint8Array(bytes) : null;
}

/** Parse an otpauth:// URI or a bare base32 secret. Returns null if unusable. */
export function parseTotpInput(raw?: string | null): TotpConfig | null {
  const value = raw?.trim();
  if (!value) return null;

  if (value.toLowerCase().startsWith('otpauth://')) {
    try {
      const url = new URL(value);
      const secret = base32Decode(url.searchParams.get('secret') || '');
      if (!secret) return null;
      const period = Number(url.searchParams.get('period')) || 30;
      const digits = Number(url.searchParams.get('digits')) || 6;
      const algorithmParam = (url.searchParams.get('algorithm') || 'SHA1').toUpperCase();
      return {
        secret,
        period,
        digits,
        algorithm: ALGORITHM_MAP[algorithmParam] || 'SHA-1',
      };
    } catch {
      return null;
    }
  }

  const secret = base32Decode(value);
  if (!secret) return null;
  return { secret, period: 30, digits: 6, algorithm: 'SHA-1' };
}

/** RFC 6238 TOTP code for the window containing timestampMs. */
export async function generateTotpCode(
  config: TotpConfig,
  timestampMs: number = Date.now()
): Promise<string> {
  const counter = Math.floor(timestampMs / 1000 / config.period);
  const counterBytes = new Uint8Array(8);
  new DataView(counterBytes.buffer).setBigUint64(0, BigInt(counter));

  const hmacKey = await crypto.subtle.importKey(
    'raw',
    config.secret as BufferSource,
    { name: 'HMAC', hash: config.algorithm },
    false,
    ['sign']
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', hmacKey, counterBytes as BufferSource)
  );

  const offset = signature[signature.length - 1] & 0x0f;
  const binary =
    ((signature[offset] & 0x7f) << 24) |
    (signature[offset + 1] << 16) |
    (signature[offset + 2] << 8) |
    signature[offset + 3];
  const code = binary % 10 ** config.digits;
  return String(code).padStart(config.digits, '0');
}

export function totpRemainingSeconds(period: number, timestampMs: number = Date.now()): number {
  const seconds = Math.floor(timestampMs / 1000);
  return period - (seconds % period);
}
