import { buildSelectUrl, checkCallback, createPkce, parseCallback, T3K_ORIGIN, type CallbackParams, type SelectOptions } from './oauth';
import type { T3kList, T3kModel, T3kTokens, T3kTone } from './types';

const KEY_STORE = 'web-tones:t3k-key';
const TOKEN_STORE = 'web-tones:t3k-tokens';
const PKCE_STORE = 'web-tones:t3k-pkce';
const POPUP_FLAG = 'web-tones:t3k-popup';
const PENDING_STORE = 'web-tones:t3k-pending';
const CHANNEL = 'web-tones-t3k';
const MSG = 'web-tones:t3k-callback';

const envKey = (import.meta.env?.VITE_T3K_PUBLISHABLE_KEY as string | undefined)?.trim() ?? '';

// ------------------------------------------------------------------- config

/** Publishable key: baked in at build time, or pasted by the user for self-hosted copies. */
export function getKey(): string {
  if (envKey) return envKey;
  try {
    return localStorage.getItem(KEY_STORE) ?? '';
  } catch {
    return '';
  }
}
export const keyIsBuiltIn = () => !!envKey;
export function setKey(key: string) {
  const k = key.trim();
  if (k) localStorage.setItem(KEY_STORE, k);
  else localStorage.removeItem(KEY_STORE);
  clearTokens();
}
/** Must be registered on the publishable key at tone3000.com. */
export const redirectUri = () => location.origin + location.pathname;

// ------------------------------------------------------------------- tokens
// sessionStorage, as in TONE3000's own examples: tokens die with the tab.

function readTokens(): T3kTokens | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_STORE);
    return raw ? (JSON.parse(raw) as T3kTokens) : null;
  } catch {
    return null;
  }
}
function writeTokens(t: T3kTokens) {
  sessionStorage.setItem(TOKEN_STORE, JSON.stringify(t));
}
export function clearTokens() {
  sessionStorage.removeItem(TOKEN_STORE);
}
export const isSignedIn = () => readTokens() !== null;

async function tokenRequest(body: Record<string, string>): Promise<T3kTokens> {
  const res = await fetch(`${T3K_ORIGIN}/api/v1/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...body, client_id: getKey() }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) throw new T3kError(json.error_description ?? json.error ?? 'token_exchange_failed', res.status);
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + (Number(json.expires_in) || 3600) * 1000,
  };
}

let refreshing: Promise<T3kTokens> | null = null;
/** A valid access token, refreshed ~60 s before expiry. Refreshes are serialized. */
async function accessToken(force = false): Promise<string> {
  const t = readTokens();
  if (!t) throw new T3kError('TONE3000에 로그인되어 있지 않습니다', 401);
  if (!force && t.expiresAt - Date.now() > 60_000) return t.accessToken;
  refreshing ??= tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refreshToken })
    .then((next) => {
      writeTokens(next);
      return next;
    })
    .catch((e) => {
      clearTokens(); // refresh token expired: the user has to sign in again
      throw e;
    })
    .finally(() => (refreshing = null));
  return (await refreshing).accessToken;
}

// ---------------------------------------------------------------------- api

export class T3kError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function authed(url: string): Promise<Response> {
  const go = async (force: boolean) => fetch(url, { headers: { Authorization: `Bearer ${await accessToken(force)}` } });
  let res = await go(false);
  if (res.status === 401) res = await go(true); // retry once with a fresh token
  if (!res.ok) {
    const msg =
      res.status === 429
        ? 'TONE3000 요청 한도를 초과했습니다. 잠시 후 다시 시도하세요.'
        : res.status === 403
          ? '이 톤에 접근할 권한이 없습니다.'
          : res.status === 404
            ? '톤을 찾을 수 없습니다.'
            : `TONE3000 요청 실패 (${res.status})`;
    throw new T3kError(msg, res.status);
  }
  return res;
}
const getJson = async <T>(path: string): Promise<T> => (await authed(`${T3K_ORIGIN}/api/v1${path}`)).json();

export const getTone = (id: string | number) => getJson<T3kTone>(`/tones/${encodeURIComponent(id)}`);

/**
 * Files of a tone. TONE3000 returns A1 + custom unless architecture=2 is
 * passed, so NAM tones are queried both ways and merged (A2 first).
 */
export async function listModels(tone: Pick<T3kTone, 'id' | 'format'>): Promise<T3kModel[]> {
  const page = (arch?: string) =>
    getJson<{ data: T3kModel[] }>(`/models?tone_id=${tone.id}&page_size=100${arch ? `&architecture=${arch}` : ''}`).then((r) => r.data ?? []);
  if (tone.format !== 'nam') return page();
  const [a2, rest] = await Promise.all([page('2'), page()]);
  const seen = new Set<number>();
  return [...a2, ...rest].filter((m) => !seen.has(m.id) && seen.add(m.id));
}

/** Bounded list endpoints (the ones TONE3000's free tier allows; search is not). */
export async function listTones(list: T3kList): Promise<T3kTone[]> {
  const path = list === 'trending' || list === 'latest' ? `/tones/${list}` : `/tones/${list}?page_size=50`;
  return (await getJson<{ data: T3kTone[] }>(path)).data ?? [];
}

/** model_url needs the Bearer header, so it cannot be used as a plain link. */
export async function fetchModelFile(model: T3kModel): Promise<ArrayBuffer> {
  const url = new URL(model.model_url, T3K_ORIGIN);
  // Never send the token anywhere but TONE3000.
  if (url.origin !== T3K_ORIGIN) throw new T3kError('예상하지 못한 다운로드 주소입니다', 0);
  return (await authed(url.toString())).arrayBuffer();
}

// --------------------------------------------------------------- select flow

export type FlowResult = { status: 'ok'; toneId: string | null } | { status: 'canceled' } | { status: 'error'; error: string } | { status: 'redirecting' };

async function complete(params: CallbackParams): Promise<FlowResult> {
  const saved = sessionStorage.getItem(PKCE_STORE);
  sessionStorage.removeItem(PKCE_STORE); // single use, whatever the outcome
  const pkce = saved ? (JSON.parse(saved) as { verifier: string; state: string }) : null;
  const check = checkCallback(params, pkce?.state ?? null);
  if (!check.ok) return check.reason === 'canceled' ? { status: 'canceled' } : { status: 'error', error: check.reason };
  try {
    writeTokens(
      await tokenRequest({ grant_type: 'authorization_code', code: check.code, code_verifier: pkce!.verifier, redirect_uri: redirectUri() }),
    );
  } catch (e) {
    return { status: 'error', error: e instanceof Error ? e.message : String(e) };
  }
  // Signed in but closed the picker without choosing.
  return params.canceled && !check.toneId ? { status: 'canceled' } : { status: 'ok', toneId: check.toneId };
}

/**
 * Open TONE3000's tone picker. Uses a popup so audio keeps playing; falls back
 * to a full-page redirect when popups are blocked (`pending` is restored by
 * resumeRedirect() after the round trip).
 */
export async function selectTone(opts: SelectOptions, pending: unknown, beforeRedirect: () => void = () => {}): Promise<FlowResult> {
  const key = getKey();
  if (!key) return { status: 'error', error: 'TONE3000 publishable key가 설정되지 않았습니다' };

  // Open synchronously (inside the click) or popup blockers step in. The popup
  // inherits a copy of sessionStorage, including the flag that tells the page
  // loaded at redirect_uri to relay the callback instead of booting the app.
  sessionStorage.setItem(POPUP_FLAG, '1');
  const w = 480;
  const h = 720;
  const popup = window.open(
    'about:blank',
    'web-tones-t3k',
    `width=${w},height=${h},left=${Math.round(screenX + (outerWidth - w) / 2)},top=${Math.round(screenY + (outerHeight - h) / 2)},resizable=yes,scrollbars=yes`,
  );
  sessionStorage.removeItem(POPUP_FLAG);

  const pkce = await createPkce();
  sessionStorage.setItem(PKCE_STORE, JSON.stringify({ verifier: pkce.verifier, state: pkce.state }));
  const url = buildSelectUrl(key, redirectUri(), pkce, opts);

  if (!popup) {
    sessionStorage.setItem(PENDING_STORE, JSON.stringify(pending ?? null));
    beforeRedirect();
    location.assign(url);
    return { status: 'redirecting' };
  }
  popup.location.href = url;

  const params = await new Promise<CallbackParams | null>((resolve) => {
    const channel = new BroadcastChannel(CHANNEL);
    const done = (p: CallbackParams | null) => {
      window.removeEventListener('message', onMessage);
      channel.close();
      clearInterval(poll);
      resolve(p);
    };
    const accept = (data: unknown) => {
      const d = data as { type?: string; params?: CallbackParams };
      if (d?.type === MSG && d.params) done(d.params);
    };
    const onMessage = (e: MessageEvent) => e.origin === location.origin && accept(e.data);
    window.addEventListener('message', onMessage);
    channel.onmessage = (e) => accept(e.data);
    // Closed by hand: give a relayed message a moment to arrive first.
    const poll = setInterval(() => popup.closed && setTimeout(() => done(null), 400), 500);
  });
  if (!popup.closed) popup.close();
  return params ? complete(params) : { status: 'canceled' };
}

/**
 * Runs in the popup when TONE3000 redirects back: hand the callback to the
 * opener and close. Returns true when this page load was such a relay (the app
 * should not boot).
 */
export function relayPopupCallback(): boolean {
  let flagged = false;
  try {
    flagged = sessionStorage.getItem(POPUP_FLAG) === '1';
  } catch { /* storage blocked */ }
  const params = flagged ? parseCallback(location.search) : null;
  if (!params) return false;
  const msg = { type: MSG, params };
  try {
    window.opener?.postMessage(msg, location.origin);
  } catch { /* opener gone */ }
  const channel = new BroadcastChannel(CHANNEL);
  channel.postMessage(msg);
  setTimeout(() => {
    channel.close();
    window.close();
  }, 150);
  return true;
}

/** Finish a full-page redirect round trip (popup-blocked fallback). Null when this load is not a callback. */
export async function resumeRedirect<P>(): Promise<{ result: FlowResult; pending: P | null } | null> {
  const params = parseCallback(location.search);
  if (!params || !sessionStorage.getItem(PKCE_STORE)) return null;
  history.replaceState(null, '', location.pathname + location.hash);
  const raw = sessionStorage.getItem(PENDING_STORE);
  sessionStorage.removeItem(PENDING_STORE);
  return { result: await complete(params), pending: raw ? (JSON.parse(raw) as P) : null };
}
