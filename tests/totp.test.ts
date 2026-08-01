import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  base32Decode,
  generateTotpCode,
  parseTotpInput,
  totpRemainingSeconds,
} from '../src/utils/totp.ts';

// RFC 6238 test secret: ASCII "12345678901234567890"
const RFC_SECRET_BASE32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('base32Decode', () => {
  it('decodes RFC secret to ASCII bytes', () => {
    const bytes = base32Decode(RFC_SECRET_BASE32);
    assert.ok(bytes);
    assert.equal(new TextDecoder().decode(bytes), '12345678901234567890');
  });

  it('ignores spaces, dashes and padding', () => {
    const bytes = base32Decode('gezd gnbv-gy3t qojq====');
    assert.ok(bytes);
    assert.equal(new TextDecoder().decode(bytes), '1234567890');
  });

  it('rejects non-base32 input', () => {
    assert.equal(base32Decode('not base32 !!'), null);
    assert.equal(base32Decode(''), null);
  });
});

describe('parseTotpInput', () => {
  it('parses a bare base32 secret with defaults', () => {
    const config = parseTotpInput(RFC_SECRET_BASE32);
    assert.ok(config);
    assert.equal(config.period, 30);
    assert.equal(config.digits, 6);
    assert.equal(config.algorithm, 'SHA-1');
  });

  it('parses otpauth URI parameters', () => {
    const config = parseTotpInput(
      `otpauth://totp/Example:user?secret=${RFC_SECRET_BASE32}&digits=8&period=60&algorithm=SHA256`
    );
    assert.ok(config);
    assert.equal(config.period, 60);
    assert.equal(config.digits, 8);
    assert.equal(config.algorithm, 'SHA-256');
  });

  it('returns null for empty or invalid values', () => {
    assert.equal(parseTotpInput(''), null);
    assert.equal(parseTotpInput('   '), null);
    assert.equal(parseTotpInput('otpauth://totp/x?secret='), null);
  });
});

describe('generateTotpCode', () => {
  it('matches RFC 6238 SHA-1 test vectors', async () => {
    const config = parseTotpInput(
      `otpauth://totp/Test?secret=${RFC_SECRET_BASE32}&digits=8`
    );
    assert.ok(config);
    assert.equal(await generateTotpCode(config, 59_000), '94287082');
    assert.equal(await generateTotpCode(config, 1_111_111_109_000), '07081804');
    assert.equal(await generateTotpCode(config, 20_000_000_000_000), '65353130');
  });
});

describe('totpRemainingSeconds', () => {
  it('counts down within the period', () => {
    assert.equal(totpRemainingSeconds(30, 0), 30);
    assert.equal(totpRemainingSeconds(30, 29_000), 1);
    assert.equal(totpRemainingSeconds(30, 30_000), 30);
  });
});
