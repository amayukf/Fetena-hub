export async function onRequest(context) {
  const url = new URL(context.request.url);
  const backendUrl = new URL(url.pathname + url.search, 'https://fetena-hub.onrender.com');

  const headers = new Headers(context.request.headers);
  headers.set('Host', 'fetena-hub.onrender.com');

  const clientIp = context.request.headers.get('cf-connecting-ip');
  if (clientIp) {
    headers.set('x-forwarded-for', clientIp);
    headers.set('cf-connecting-ip', clientIp);
  }

  const proxySecret = context.env.PROXY_SECRET || 'fetena-cf-proxy';
  headers.set('x-proxy-secret', proxySecret);

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
    const response = await fetch(backendUrl.toString(), options);
    // If backend returns 404 for a solution query (e.g. backend pending redeploy),
    // return a clean 200 JSON payload so students never see endpoint errors
    if (response.status === 404 && url.pathname.endsWith('/solution') && context.request.method === 'GET') {
      return new Response(JSON.stringify({ hasSolution: false, message: 'No verified solution attached for this paper yet.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return response;
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Backend unreachable: ' + error.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
