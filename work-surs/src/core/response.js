// ========================================================
// 📨 طبقة الردود الموحدة + CORS ديناميكي
// ========================================================

// ⚠️ أمان: بدل ما يكون Access-Control-Allow-Origin ثابت على '*' لكل الحالات،
// نقرأ قائمة الدومينات المسموحة من env.ALLOWED_ORIGINS (مفصولة بفواصل).
// لو ما ضُبطت بعد، نرجع لسلوك '*' القديم مؤقتاً حتى لا ينكسر شيء بالتطوير.
export function buildCorsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Internal-Key',
    Vary: 'Origin',
  };

  if (allowed.length === 0) {
    headers['Access-Control-Allow-Origin'] = '*';
    return headers;
  }

  if (allowed.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

export function jsonResponse(data, status, corsHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

export function successResponse(data = {}, corsHeaders, status = 200) {
  return jsonResponse({ status: 'success', ...data }, status, corsHeaders);
}

export function errorResponse(message, corsHeaders, status = 400) {
  return jsonResponse({ status: 'error', message }, status, corsHeaders);
}
