export async function onRequest() {
  try {
    return await fetch('https://fetena-hub.onrender.com/health');
  } catch (error) {
    return new Response(JSON.stringify({ status: 'error', error: error.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
