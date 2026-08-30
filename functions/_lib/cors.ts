import { CORS_HEADERS } from "./response";

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
