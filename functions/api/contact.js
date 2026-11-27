const MAX_BODY_BYTES = 8_000;
const MAX_MESSAGE_LENGTH = 5_000;
const MAX_EMAIL_LENGTH = 254;
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_SECONDS = 60 * 60;
const RATE_LIMIT_RETENTION_SECONDS = 24 * 60 * 60;
const ALLOWED_CATEGORIES = new Set(['suggestion', 'bug', 'other']);

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function hashIp(ip, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function verifyTurnstile(token, secret, hostname) {
  const formData = new URLSearchParams({ secret, response: token });
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData,
  });
  if (!response.ok) return false;
  const result = await response.json();
  return result.success === true && result.hostname === hostname && result.action === 'contact';
}

async function consumeRateLimit(db, ipHash, now) {
  const result = await db.batch([
    db.prepare('DELETE FROM contact_rate_limits WHERE last_seen < ?').bind(now - RATE_LIMIT_RETENTION_SECONDS),
    db.prepare(`
      INSERT INTO contact_rate_limits (ip_hash, window_started, request_count, last_seen)
      VALUES (?, ?, 1, ?)
      ON CONFLICT(ip_hash) DO UPDATE SET
        window_started = CASE
          WHEN contact_rate_limits.window_started <= ? THEN excluded.window_started
          ELSE contact_rate_limits.window_started
        END,
        request_count = CASE
          WHEN contact_rate_limits.window_started <= ? THEN 1
          ELSE contact_rate_limits.request_count + 1
        END,
        last_seen = excluded.last_seen
      WHERE contact_rate_limits.window_started <= ? OR contact_rate_limits.request_count < ?
      RETURNING request_count
    `).bind(ipHash, now, now, now - RATE_LIMIT_WINDOW_SECONDS, now - RATE_LIMIT_WINDOW_SECONDS, now - RATE_LIMIT_WINDOW_SECONDS, RATE_LIMIT_MAX),
  ]);
  return result[1]?.results?.[0]?.request_count ?? null;
}

export async function onRequestPost({ request, env }) {
  if (!env.CONTACT_DB || !env.TURNSTILE_SECRET) return json({ error: '문의 기능을 사용할 수 없습니다.' }, 503);

  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return json({ error: '잘못된 요청입니다.' }, 403);

  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.toLowerCase().startsWith('application/json')) return json({ error: '잘못된 요청입니다.' }, 415);

  const declaredLength = Number(request.headers.get('Content-Length'));
  if (declaredLength > MAX_BODY_BYTES) return json({ error: '입력 내용이 너무 깁니다.' }, 413);

  let form;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return json({ error: '입력 내용이 너무 깁니다.' }, 413);
    form = JSON.parse(raw);
  } catch {
    return json({ error: '잘못된 요청입니다.' }, 400);
  }

  if (!form || typeof form !== 'object' || Array.isArray(form)) return json({ error: '잘못된 요청입니다.' }, 400);
  if (typeof form.website === 'string' && form.website.trim()) return json({ ok: true });

  const category = typeof form.category === 'string' ? form.category : '';
  const message = typeof form.message === 'string' ? form.message.trim() : '';
  const email = typeof form.email === 'string' ? form.email.trim() : '';
  if (!ALLOWED_CATEGORIES.has(category) || !message || message.length > MAX_MESSAGE_LENGTH) {
    return json({ error: '문의 종류와 내용을 확인해 주세요.' }, 400);
  }
  if (email.length > MAX_EMAIL_LENGTH || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: '이메일 주소를 확인해 주세요.' }, 400);
  }

  const turnstileToken = typeof form['cf-turnstile-response'] === 'string' ? form['cf-turnstile-response'] : '';
  if (!turnstileToken || turnstileToken.length > 2_048) return json({ error: '보안 확인을 완료해 주세요.' }, 400);

  let verified;
  try {
    verified = await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET, new URL(request.url).hostname);
  } catch {
    return json({ error: '보안 확인에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, 503);
  }
  if (!verified) return json({ error: '보안 확인에 실패했습니다. 확인을 다시 완료해 주세요.' }, 400);

  const clientIp = request.headers.get('CF-Connecting-IP');
  if (!clientIp) return json({ error: '요청을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.' }, 503);

  try {
    const now = Math.floor(Date.now() / 1_000);
    const ipHash = await hashIp(clientIp, env.TURNSTILE_SECRET);
    const requestCount = await consumeRateLimit(env.CONTACT_DB, ipHash, now);
    if (requestCount === null) {
      return json({ error: '한 IP에서 문의를 1시간에 5회까지 보낼 수 있습니다. 잠시 후 다시 시도해 주세요.' }, 429);
    }

    await env.CONTACT_DB.prepare(
      'INSERT INTO contact_submissions (id, category, message, email) VALUES (?, ?, ?, ?)',
    ).bind(crypto.randomUUID(), category, message, email || null).run();
    return json({ ok: true }, 201);
  } catch {
    return json({ error: '문의 접수 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.' }, 503);
  }
}
