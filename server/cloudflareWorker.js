export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Proxy API requests and health checks directly to the production backend
    if (url.pathname.startsWith('/api') || url.pathname === '/health') {
      const backendUrl = new URL(url.pathname + url.search, 'https://fetena-hub.onrender.com');
      const headers = new Headers(request.headers);
      headers.set('Host', 'fetena-hub.onrender.com');

      const proxyRequest = new Request(backendUrl.toString(), {
        method: request.method,
        headers,
        body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
        redirect: 'follow',
      });

      return fetch(proxyRequest);
    }

    // Serve built frontend assets from dist/ with automatic SPA fallback
    return env.ASSETS.fetch(request);
  },
};
