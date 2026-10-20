export async function onRequest(context) {
  const url = new URL(context.request.url);
  const backendUrl = new URL(url.pathname + url.search, 'https://fetena-hub.onrender.com');

  const headers = new Headers(context.request.headers);
  headers.set('Host', 'fetena-hub.onrender.com');

  const clientIp = context.request.headers.get('cf-connecting-ip');
  if (clientIp) {
    headers.set('x-forwarded-for', clientIp);
  }

  const options = {
    method: context.request.method,
    headers,
    redirect: 'follow',
  };

  if (!['GET', 'HEAD'].includes(context.request.method)) {
    options.body = context.request.body;
    // @ts-ignore
    options.duplex = 'half';
  }

  try {
    return await fetch(backendUrl.toString(), options);
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Backend unreachable: ' + error.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
