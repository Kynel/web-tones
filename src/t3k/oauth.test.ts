import { describe, expect, it } from 'vitest';
import { base64url, buildSelectUrl, checkCallback, createPkce, parseCallback } from './oauth';

describe('PKCE', () => {
  it('base64url has no padding or URL-unsafe characters', () => {
    expect(base64url(new Uint8Array([251, 255, 254, 62, 63]))).toBe('-__-Pj8');
  });
  it('derives the S256 challenge from the verifier (RFC 7636 appendix B)', async () => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'));
    expect(base64url(new Uint8Array(digest))).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
  it('generates fresh, well-formed secrets', async () => {
    const [a, b] = await Promise.all([createPkce(), createPkce()]);
    expect(a.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.state).not.toBe(b.state);
    expect(a.verifier).not.toBe(b.verifier);
  });
});

describe('select flow URL', () => {
  const pkce = { challenge: 'CH', state: 'ST' };
  it('carries the OAuth and catalog params', () => {
    const url = new URL(buildSelectUrl('t3k_pub_x', 'https://app.example/', pkce, { format: 'nam', architecture: '2' }));
    expect(url.origin + url.pathname).toBe('https://www.tone3000.com/api/v1/oauth/authorize');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: 't3k_pub_x',
      redirect_uri: 'https://app.example/',
      response_type: 'code',
      code_challenge: 'CH',
      code_challenge_method: 'S256',
      state: 'ST',
      prompt: 'select_tone',
      format: 'nam',
      architecture: '2',
    });
  });
  it('does not send an architecture for IRs', () => {
    const url = new URL(buildSelectUrl('k', 'https://a/', pkce, { format: 'ir', architecture: '2' }));
    expect(url.searchParams.has('architecture')).toBe(false);
    expect(url.searchParams.get('format')).toBe('ir');
  });
});

describe('callback handling', () => {
  it('recognises callbacks and ignores ordinary URLs', () => {
    expect(parseCallback('')).toBeNull();
    expect(parseCallback('?code=abc')).toBeNull();
    expect(parseCallback('?state=s&code=abc&tone_id=42')).toEqual({ code: 'abc', state: 's', error: null, toneId: '42', canceled: false });
  });
  it('checks state before anything else', () => {
    const p = parseCallback('?state=evil&code=abc')!;
    expect(checkCallback(p, 'mine')).toEqual({ ok: false, reason: 'state_mismatch' });
    expect(checkCallback(p, null)).toEqual({ ok: false, reason: 'state_mismatch' });
  });
  it('handles cancel, error and success', () => {
    expect(checkCallback(parseCallback('?state=s&canceled=true')!, 's')).toEqual({ ok: false, reason: 'canceled' });
    expect(checkCallback(parseCallback('?state=s&error=access_denied')!, 's')).toEqual({ ok: false, reason: 'access_denied' });
    expect(checkCallback(parseCallback('?state=s&code=c&tone_id=7')!, 's')).toEqual({ ok: true, code: 'c', toneId: '7' });
    // signed in, then closed the picker: still a usable code
    expect(checkCallback(parseCallback('?state=s&code=c&canceled=true')!, 's')).toEqual({ ok: true, code: 'c', toneId: null });
  });
});
