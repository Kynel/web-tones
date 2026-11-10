// OAuth 2.0 Authorization Code + PKCE against TONE3000, as pure helpers.
// The publishable key (t3k_pub_...) is the OAuth client_id and is safe to ship in the browser.

export const T3K_ORIGIN = 'https://www.tone3000.com';

export function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface Pkce {
  verifier: string;
  challenge: string;
  state: string;
}

export async function createPkce(): Promise<Pkce> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const state = base64url(crypto.getRandomValues(new Uint8Array(16)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, state, challenge: base64url(new Uint8Array(digest)) };
}

export interface SelectOptions {
  /** Restrict the catalog to what the requesting block can load. */
  format: 'nam' | 'ir';
  /** NAM architecture: '2' = A2 only. Omitted = A1 + custom (TONE3000 default). */
  architecture?: '1' | '2';
}

/** URL of the "Select" flow: the user browses TONE3000, picks a tone, and comes back with code + tone_id. */
export function buildSelectUrl(key: string, redirectUri: string, pkce: Pick<Pkce, 'challenge' | 'state'>, opts: SelectOptions): string {
  const url = new URL(`${T3K_ORIGIN}/api/v1/oauth/authorize`);
  const q = url.searchParams;
  q.set('client_id', key);
  q.set('redirect_uri', redirectUri);
  q.set('response_type', 'code');
  q.set('code_challenge', pkce.challenge);
  q.set('code_challenge_method', 'S256');
  q.set('state', pkce.state);
  q.set('prompt', 'select_tone');
  q.set('format', opts.format);
  if (opts.format === 'nam' && opts.architecture) q.set('architecture', opts.architecture);
  q.set('preview', 'true');
  q.set('menubar', 'true');
  return url.toString();
}

export interface CallbackParams {
  code: string | null;
  state: string | null;
  error: string | null;
  toneId: string | null;
  canceled: boolean;
}

/** Read OAuth callback params from a query string; null when it is not a callback. */
export function parseCallback(search: string): CallbackParams | null {
  const q = new URLSearchParams(search);
  if (!q.has('state') || !(q.has('code') || q.has('error') || q.has('canceled'))) return null;
  return {
    code: q.get('code'),
    state: q.get('state'),
    error: q.get('error'),
    toneId: q.get('tone_id'),
    canceled: q.get('canceled') === 'true',
  };
}

export type CallbackCheck = { ok: true; code: string; toneId: string | null } | { ok: false; reason: 'state_mismatch' | 'canceled' | 'missing_code' | string };

/** Validate a callback against the state we issued. State is checked before anything else. */
export function checkCallback(p: CallbackParams, expectedState: string | null): CallbackCheck {
  if (!expectedState || p.state !== expectedState) return { ok: false, reason: 'state_mismatch' };
  if (p.canceled && !p.code) return { ok: false, reason: 'canceled' };
  if (p.error) return { ok: false, reason: p.error };
  if (!p.code) return { ok: false, reason: 'missing_code' };
  return { ok: true, code: p.code, toneId: p.toneId };
}
