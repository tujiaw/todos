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
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase Auth is not configured on the server.');
  }
  return { supabaseUrl, supabaseAnonKey };
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
