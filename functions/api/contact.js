const MAX_BODY_BYTES = 8_000;
const MAX_MESSAGE_LENGTH = 5_000;
const MAX_EMAIL_LENGTH = 254;
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

export async function onRequestPost({ request, env }) {
  if (!env.CONTACT_DB) return json({ error: '문의 기능을 사용할 수 없습니다.' }, 503);

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

  try {
    await env.CONTACT_DB.prepare(
      'INSERT INTO contact_submissions (id, category, message, email) VALUES (?, ?, ?, ?)',
    ).bind(crypto.randomUUID(), category, message, email || null).run();
    return json({ ok: true }, 201);
  } catch {
    return json({ error: '문의 접수 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.' }, 503);
  }
}
