export type ApiHeaders = Record<string, string | string[] | undefined>;

export function getHeader(headers: ApiHeaders, name: string): string | undefined {
  const target = name.toLowerCase();
  const direct = headers[target] ?? headers[name];
  if (direct !== undefined) {
    return Array.isArray(direct) ? direct[0] : direct;
  }
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) {
      return Array.isArray(value) ? value[0] : value;
    }
  }
  return undefined;
}

export function getSupabaseAuthConfig(): {
  supabaseUrl: string;
  supabaseAnonKey: string;
} {
  // Prefer VITE_* so the serverless runtime matches the browser bundle.
  // SUPABASE_* remains a fallback when VITE_* is not set.
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey =
    process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase Auth is not configured on the server.');
  }
  return {
    supabaseUrl: supabaseUrl.replace(/\/$/, ''),
    supabaseAnonKey,
  };
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const segment = token.split('.')[1];
  if (!segment) return null;
  try {
    const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const json =
      typeof atob === 'function'
        ? atob(padded)
        : Buffer.from(padded, 'base64').toString('utf8');
    const payload = JSON.parse(json) as unknown;
    if (!payload || typeof payload !== 'object') return null;
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

function assertTokenMatchesProject(accessToken: string, supabaseUrl: string) {
  const payload = decodeJwtPayload(accessToken);
  if (!payload) return;

  const exp = typeof payload.exp === 'number' ? payload.exp : 0;
  if (exp > 0 && exp * 1000 <= Date.now()) {
    throw new Error('Your session is invalid or expired.');
  }

  const issuer = typeof payload.iss === 'string' ? payload.iss : '';
  if (!issuer) return;

  const expectedIssuer = `${supabaseUrl}/auth/v1`;
  if (issuer.replace(/\/$/, '') !== expectedIssuer) {
    throw new Error(
      'Supabase project mismatch between the browser session and the AI server. Check VITE_SUPABASE_URL / SUPABASE_URL on Vercel.'
    );
  }
}

export async function authenticate(
  headers: ApiHeaders,
  supabaseUrl: string,
  supabaseAnonKey: string
): Promise<{ id: string; accessToken: string }> {
  const authorization = getHeader(headers, 'authorization');
  if (!authorization?.startsWith('Bearer ')) {
    throw new Error('Authentication is required.');
  }

  const accessToken = authorization.slice('Bearer '.length).trim();
  if (!accessToken) {
    throw new Error('Authentication is required.');
  }

  assertTokenMatchesProject(accessToken, supabaseUrl);

  let authResponse: Response;
  try {
    authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: supabaseAnonKey,
      },
    });
  } catch {
    throw new Error('Authentication service is temporarily unavailable.');
  }

  if (!authResponse.ok) {
    let detail = '';
    try {
      detail = await authResponse.text();
    } catch {
      detail = '';
    }
    if (/invalid api key|no api key/i.test(detail)) {
      throw new Error('Supabase Auth is not configured on the server.');
    }
    throw new Error('Your session is invalid or expired.');
  }

  const user = (await authResponse.json()) as {
    id?: string;
    is_anonymous?: boolean;
  };
  if (!user?.id || user.is_anonymous) {
    throw new Error('Authentication is required.');
  }
  return { id: user.id, accessToken };
}
