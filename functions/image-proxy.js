const ALLOWED_HOST = 'init.n-e.kr';
const ALLOWED_PORT = '8081';
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

export async function onRequest(context) {
  const requestUrl = new URL(context.request.url);
  const source = requestUrl.searchParams.get('url');
  if (!source) return new Response('Missing image URL', { status: 400 });

  let imageUrl;
  try {
    imageUrl = new URL(source);
  } catch {
    return new Response('Invalid image URL', { status: 400 });
  }

  if (
    imageUrl.protocol !== 'http:' ||
    imageUrl.hostname !== ALLOWED_HOST ||
    imageUrl.port !== ALLOWED_PORT ||
    !imageUrl.pathname.startsWith('/Images/') ||
    imageUrl.username ||
    imageUrl.password
  ) {
    return new Response('Image host is not allowed', { status: 403 });
  }

  try {
    const upstream = await fetch(imageUrl, { redirect: 'manual' });
    if (!upstream.ok) return new Response('Image could not be loaded', { status: upstream.status });

    const contentType = upstream.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() || '';
    if (!contentType.startsWith('image/')) return new Response('Response is not an image', { status: 415 });

    const declaredSize = Number(upstream.headers.get('content-length'));
    if (declaredSize > MAX_IMAGE_BYTES) return new Response('Image is too large', { status: 413 });

    const bytes = await upstream.arrayBuffer();
    if (bytes.byteLength > MAX_IMAGE_BYTES) return new Response('Image is too large', { status: 413 });

    return new Response(bytes, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Image server is unavailable', { status: 502 });
  }
}
