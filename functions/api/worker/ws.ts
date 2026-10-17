interface Env {
  MERCHANT_SESSION: DurableObjectNamespace;
  APP_SECRET_KEY?: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  // التحقق من ترقية الاتصال إلى WebSocket
  if (request.headers.get('Upgrade') !== 'websocket') {
    return new Response('Expected Upgrade: websocket', { status: 426 });
  }

  const token = url.searchParams.get('token') || url.searchParams.get('ticket');
  const merchantId = url.searchParams.get('merchant_id') || url.searchParams.get('m');

  if (!token || !merchantId) {
    return new Response('Unauthorized: Missing Token or Merchant ID', { status: 401 });
  }

  if (!env.MERCHANT_SESSION) {
    return new Response('Durable Object binding (MERCHANT_SESSION) not found', { status: 500 });
  }

  // الاتصال المباشر بـ Durable Object
  const id = env.MERCHANT_SESSION.idFromName(`merchant_${merchantId}`);
  const stub = env.MERCHANT_SESSION.get(id);

  return stub.fetch(request);
};
