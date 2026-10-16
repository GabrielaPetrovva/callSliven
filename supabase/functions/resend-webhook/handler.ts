// handler.ts — приема събития от Resend (доставено, върнато, отказано) и обновява статуса на изпращането.
// Всяко събитие е подписано (Svix): без валиден подпис заявката се отхвърля.

// deno-lint-ignore no-explicit-any
type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: { message: string } | null }>;
export interface Deps {
  env: (k: string) => string | undefined;
  rpc: Rpc;
  now: () => number; // милисекунди
}

const TOLERANCE_SECONDS = 5 * 60;

function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  const n = Math.max(ea.length, eb.length);
  for (let i = 0; i < n; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function b64encode(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}

export async function verifySignature(secret: string, id: string, timestamp: string, body: string, header: string, nowMs: number): Promise<boolean> {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > TOLERANCE_SECONDS) return false;
  let keyBytes: Uint8Array;
  try {
    keyBytes = b64decode(secret.startsWith("whsec_") ? secret.slice(6) : secret);
  } catch {
    return false;
  }
  const key = await crypto.subtle.importKey("raw", keyBytes.slice().buffer as ArrayBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)));
  const expected = b64encode(sig);
  // в заглавието може да има няколко подписа: "v1,<sig> v1,<sig>"
  return header.split(" ").some((part) => {
    const [ver, value] = part.split(",");
    return ver === "v1" && !!value && safeEqual(value, expected);
  });
}

const FAILED_EVENTS = new Set(["email.bounced", "email.failed", "email.complained", "email.suppressed"]);

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
  const out = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });

  if (req.method !== "POST") return out(405, { code: "method_not_allowed" });
  const secret = deps.env("RESEND_WEBHOOK_SECRET");
  if (!secret) return out(500, { code: "misconfigured" });

  const raw = await req.text();
  if (raw.length > 100_000) return out(413, { code: "too_large" });
  const ok = await verifySignature(
    secret,
    req.headers.get("svix-id") ?? "",
    req.headers.get("svix-timestamp") ?? "",
    raw,
    req.headers.get("svix-signature") ?? "",
    deps.now(),
  );
  if (!ok) return out(401, { code: "bad_signature" });

  let evt: { type?: unknown; data?: { email_id?: unknown; bounce?: { message?: unknown; type?: unknown }; reason?: unknown } };
  try { evt = JSON.parse(raw); } catch { return out(400, { code: "invalid_request" }); }

  const type = typeof evt.type === "string" ? evt.type : "";
  const emailId = evt.data?.email_id;
  if (typeof emailId !== "string" || emailId.length === 0) return out(200, { ignored: true });

  let event: "delivered" | "failed" | null = null;
  let error: string | null = null;
  if (type === "email.delivered") event = "delivered";
  else if (FAILED_EVENTS.has(type)) {
    event = "failed";
    const detail = evt.data?.bounce?.message ?? evt.data?.reason ?? evt.data?.bounce?.type ?? "";
    error = `${type}${detail ? ": " + String(detail) : ""}`.slice(0, 300);
  }
  if (!event) return out(200, { ignored: true }); // изпратено, отворено, забавено и т.н. не ни интересуват

  const { data, error: dberr } = await deps.rpc("dispatch_apply_webhook", { p_provider_message_id: emailId, p_event: event, p_error: error });
  if (dberr) return out(500, { code: "internal" }); // Resend ще опита пак
  return out(200, { applied: data === true });
}
