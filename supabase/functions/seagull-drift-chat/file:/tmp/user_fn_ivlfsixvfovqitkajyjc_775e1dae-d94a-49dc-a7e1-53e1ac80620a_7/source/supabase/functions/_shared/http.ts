export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}
export function errorResponse(message, status, endpoint, extras) {
  return jsonResponse({
    error: message,
    endpoint,
    timestamp: new Date().toISOString(),
    ...extras
  }, status);
}
export function handleAbortError(error, endpoint) {
  if (error instanceof DOMException && error.name === "AbortError" || error instanceof Error && (error.name === "AbortError" || error.message === "Request aborted by client")) {
    return errorResponse("Request aborted", 499, endpoint, {
      aborted: true
    });
  }
  const message = error instanceof Error ? error.message : "Unknown error";
  return errorResponse(message, 500, endpoint);
}
export function ensurePostMethod(req, endpoint) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }
  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405, endpoint);
  }
  return null;
}
