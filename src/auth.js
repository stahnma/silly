// Signing in with GitHub, and signed cookies for the session.
//
// Cookies are base64url(JSON) + "." + an HMAC of it with SILLY_SESSION_SECRET,
// so they can't be forged or edited; nothing about sessions is stored on the
// server. The OAuth "state" goes in its own short-lived cookie and must come
// back from GitHub unchanged, which stops someone signing you in as them.
// No OAuth scopes are requested: silly only needs the public profile.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const SESSION_COOKIE = 'silly_session';
const STATE_COOKIE = 'silly_oauth_state';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const STATE_MS = 10 * 60 * 1000;

export const parseCookies = header =>
  Object.fromEntries(
    (header || '')
      .split(';')
      .map(part => part.trim().split('='))
      .filter(([name, value]) => name && value !== undefined)
      .map(([name, ...rest]) => [name, rest.join('=')])
  );

export const createAuth = ({
  clientId,
  clientSecret,
  secret,
  publicUrl,
  fetch = globalThis.fetch,
  now = () => Date.now(),
}) => {
  const base = publicUrl.replace(/\/+$/, '');
  const secure = base.startsWith('https://');
  const callbackUrl = `${base}/auth/github/callback`;

  const sign = value => createHmac('sha256', secret).update(value).digest('base64url');

  const seal = (payload, ttlMs) => {
    const body = Buffer.from(JSON.stringify({ ...payload, exp: now() + ttlMs })).toString(
      'base64url'
    );
    return `${body}.${sign(body)}`;
  };

  const unseal = cookie => {
    const [body, mac] = (cookie || '').split('.');
    if (!body || !mac) return null;
    const expected = Buffer.from(sign(body));
    const given = Buffer.from(mac);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    try {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      return payload.exp > now() ? payload : null;
    } catch {
      return null;
    }
  };

  const cookie = (name, value, maxAgeMs) =>
    [
      `${name}=${value}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
      ...(secure ? ['Secure'] : []),
    ].join('; ');

  return {
    // The signed-in user, {githubId, login}, or null.
    session(req) {
      const payload = unseal(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
      return payload && { githubId: payload.githubId, login: payload.login };
    },

    // Where to send the browser to sign in, and the state cookie to set.
    startLogin() {
      const state = randomBytes(16).toString('base64url');
      const url = new URL('https://github.com/login/oauth/authorize');
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('redirect_uri', callbackUrl);
      url.searchParams.set('state', state);
      url.searchParams.set('allow_signup', 'true');
      return {
        location: url.href,
        setCookie: cookie(STATE_COOKIE, seal({ state }, STATE_MS), STATE_MS),
      };
    },

    // Finish signing in from GitHub's redirect. Resolves with the user and the
    // cookies to set; rejects with a message for the user if anything's off.
    async finishLogin(req, query) {
      const saved = unseal(parseCookies(req.headers.cookie)[STATE_COOKIE]);
      if (!saved || !query.get('state') || saved.state !== query.get('state')) {
        throw new Error('That sign-in link expired or was not started here. Try again.');
      }
      if (query.get('error')) throw new Error('GitHub sign-in was cancelled.');
      const code = query.get('code');
      if (!code) throw new Error('GitHub did not send a sign-in code. Try again.');

      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: callbackUrl,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const token = await tokenRes.json().catch(() => ({}));
      if (!token.access_token) throw new Error('GitHub did not accept the sign-in. Try again.');

      const userRes = await fetch('https://api.github.com/user', {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token.access_token}`,
          'User-Agent': 'silly',
        },
        signal: AbortSignal.timeout(10_000),
      });
      const user = await userRes.json().catch(() => ({}));
      if (!userRes.ok || !Number.isInteger(user.id)) {
        throw new Error('Could not read your GitHub profile. Try again.');
      }

      const session = { githubId: String(user.id), login: user.login };
      return {
        user: session,
        setCookies: [
          cookie(SESSION_COOKIE, seal(session, SESSION_MS), SESSION_MS),
          cookie(STATE_COOKIE, '', 0),
        ],
      };
    },

    logoutCookie() {
      return cookie(SESSION_COOKIE, '', 0);
    },
  };
};
