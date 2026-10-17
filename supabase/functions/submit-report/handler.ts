// handler.ts — целият ход на подаване на сигнал. Зависимостите се подават отвън, за да се тества без мрежа.
import { PhotoError, type Processed, processPhoto } from "./photo.ts";
import {
  addressesFrom,
  buildPublicText,
  type GeoResult,
  LIMITS,
  mapDbError,
  validateInput,
} from "./lib.ts";

// Минимумът от Supabase клиента, който ползваме.
// deno-lint-ignore no-explicit-any
type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: { message: string } | null }>;
interface Query {
  eq: (col: string, v: unknown) => Query;
  // deno-lint-ignore no-explicit-any
  maybeSingle: () => PromiseLike<{ data: any; error: { message: string } | null }>;
}
interface Bucket {
  download: (path: string) => PromiseLike<{ data: Blob | null; error: { message: string } | null }>;
  upload: (
    path: string,
    body: Uint8Array,
    opts: { contentType: string; upsert: boolean },
  ) => PromiseLike<{ error: { message: string } | null }>;
  remove: (paths: string[]) => PromiseLike<{ error: { message: string } | null }>;
}
export interface Admin {
  auth: { getUser: (jwt: string) => PromiseLike<{ data: { user: { id: string } | null }; error: unknown }> };
  rpc: Rpc;
  from: (table: string) => { select: (cols: string) => Query };
  storage: { from: (bucket: string) => Bucket };
}

const BUCKET = "report-photos";

export interface Deps {
  env: (key: string) => string | undefined;
  fetch: typeof fetch;
  admin: Admin;
}

const DEFAULT_ORIGINS = ["http://localhost:5500", "http://127.0.0.1:5500", "http://localhost:3000", "http://localhost:8080"];

function allowedOrigins(deps: Deps): string[] {
  const v = deps.env("ALLOWED_ORIGINS");
  return v ? v.split(",").map((s) => s.trim()).filter(Boolean) : DEFAULT_ORIGINS;
}

function corsHeaders(origin: string | null, deps: Deps): Record<string, string> {
  const h: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  };
  if (origin && allowedOrigins(deps).includes(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

function json(status: number, body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function clientIp(req: Request): string {
  const xff = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "";
  return xff.split(",")[0].trim() || "unknown";
}

async function verifyTurnstile(deps: Deps, secret: string, token: string, ip: string): Promise<"ok" | "failed" | "unavailable"> {
  try {
    const form = new URLSearchParams({ secret, response: token });
    if (ip !== "unknown") form.set("remoteip", ip);
    const res = await deps.fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return "unavailable";
    const data = await res.json();
    return data?.success === true ? "ok" : "failed";
  } catch {
    return "unavailable";
  }
}

// Грешка при геокодирането не спира сигнала: адресите остават празни.
async function reverseGeocode(deps: Deps, lat: number, lng: number): Promise<GeoResult | null> {
  const key = deps.env("GEOAPIFY_API_KEY");
  if (!key) return null;
  try {
    const url = `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lng}&lang=bg&format=json&apiKey=${encodeURIComponent(key)}`;
    const res = await deps.fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const data = await res.json();
    const r = data?.results?.[0] ?? data?.features?.[0]?.properties;
    return r && typeof r === "object" ? (r as GeoResult) : null;
  } catch {
    return null;
  }
}

async function logSecurity(deps: Deps, type: string, userId: string | null, ipHash: string | null) {
  try {
    await deps.admin.rpc("log_security_event", { p_type: type, p_user_id: userId, p_ip_hash: ipHash, p_details: {} });
  } catch { /* журналът не бива да чупи заявката */ }
}

async function logSystem(deps: Deps, level: "warning" | "error", message: string) {
  try {
    await deps.admin.rpc("log_system_event", { p_source: "submit-report", p_level: level, p_message: message, p_details: {} });
  } catch { /* същото */ }
}

async function findExisting(deps: Deps, userId: string, key: string) {
  const { data: p } = await deps.admin.from("report_private").select("report_id").eq("user_id", userId).eq("idempotency_key", key).maybeSingle();
  if (!p?.report_id) return null;
  const { data: r } = await deps.admin.from("reports").select("number,status,needs_review").eq("id", p.report_id).maybeSingle();
  return r ? { number: r.number, status: r.status, needs_review: r.needs_review } : null;
}

// Сваля временните файлове, проверява ги и маха метаданните. Нищо не се създава, ако някоя снимка е лоша.
async function preparePhotos(deps: Deps, userId: string, key: string, paths: string[]): Promise<Processed[] | { error: string }> {
  const prefix = `tmp/${userId}/${key}/`;
  for (const p of paths) {
    if (!p.startsWith(prefix) || !/^[A-Za-z0-9._-]{1,100}$/.test(p.slice(prefix.length))) return { error: "invalid_photo" };
  }
  const out: Processed[] = [];
  for (const p of paths) {
    const { data, error } = await deps.admin.storage.from(BUCKET).download(p);
    if (error || !data) return { error: "photo_missing" };
    if (data.size > 5 * 1024 * 1024) return { error: "invalid_photo" };
    try {
      out.push(processPhoto(new Uint8Array(await data.arrayBuffer())));
    } catch (e) {
      if (e instanceof PhotoError) return { error: e.code };
      throw e;
    }
  }
  return out;
}

// Слага проверените снимки на постоянното място. Грешка тук не отменя вече създадения сигнал.
async function storePhotos(deps: Deps, reportId: string, photos: Processed[], tmpPaths: string[]): Promise<number> {
  let saved = 0;
  for (let i = 0; i < photos.length; i++) {
    const ph = photos[i];
    const path = `reports/${reportId}/${i + 1}.${ph.ext}`;
    const up = await deps.admin.storage.from(BUCKET).upload(path, ph.bytes, { contentType: ph.contentType, upsert: false });
    if (up.error) { await logSystem(deps, "error", `качване на снимка: ${up.error.message}`); continue; }
    const rec = await deps.admin.rpc("report_add_photo", { p_report_id: reportId, p_path: path, p_content_type: ph.contentType, p_size_bytes: ph.bytes.length });
    if (rec.error) {
      await logSystem(deps, "error", `запис на снимка: ${rec.error.message}`);
      await deps.admin.storage.from(BUCKET).remove([path]);
      continue;
    }
    saved++;
  }
  try { await deps.admin.storage.from(BUCKET).remove(tmpPaths); } catch { /* ще ги изчисти задачата за остарели файлове */ }
  return saved;
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin, deps);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { code: "method_not_allowed" }, cors);
  if (origin && !cors["Access-Control-Allow-Origin"]) return json(403, { code: "origin_not_allowed" }, cors);

  // 1) Кой е потребителят. Идентичността идва само от токена, никога от тялото на заявката.
  const auth = req.headers.get("authorization") ?? "";
  const jwt = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!jwt) return json(401, { code: "unauthorized" }, cors);
  const { data: u, error: uerr } = await deps.admin.auth.getUser(jwt);
  const userId = u?.user?.id;
  if (uerr || !userId) return json(401, { code: "unauthorized" }, cors);

  try {
    // 2) Тяло
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > LIMITS.bodyMaxBytes) return json(413, { code: "too_large" }, cors);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return json(400, { code: "invalid_request" }, cors); }
    const v = validateInput(body);
    if (!v.ok) return json(400, { code: v.code }, cors);
    const input = v.value;

    // повторно изпращане на същия сигнал (изгубен отговор): връщаме вече създадения, без нова проверка и без нови снимки
    const existing = await findExisting(deps, userId, input.idempotencyKey);
    if (existing) return json(200, { ...existing, replay: true }, cors);

    // 3) Настройки: липсата им е грешка на мен, не на потребителя
    const turnstileSecret = deps.env("TURNSTILE_SECRET_KEY");
    const salt = deps.env("IP_HASH_SALT");
    if (!turnstileSecret || !salt) {
      await logSystem(deps, "error", "Липсва TURNSTILE_SECRET_KEY или IP_HASH_SALT");
      return json(500, { code: "misconfigured" }, cors);
    }
    const ip = clientIp(req);
    const ipHash = await sha256Hex(`${salt}:${ip}`);

    // 4) Защита от ботове
    const captcha = await verifyTurnstile(deps, turnstileSecret, input.turnstileToken, ip);
    if (captcha === "failed") {
      await logSecurity(deps, "captcha_failed", userId, ipHash);
      return json(400, { code: "captcha_failed" }, cors);
    }
    if (captcha === "unavailable") return json(503, { code: "captcha_unavailable" }, cors);

    // 4а) Мек лимит по IP: много сигнали от една мрежа отиват за преглед, а при още повече се отказват временно
    const flagAt = Number(deps.env("IP_FLAG_AT") ?? 6);
    const blockAt = Number(deps.env("IP_BLOCK_AT") ?? 15);
    let ipBurst = false;
    const ipc = await deps.admin.rpc("ip_recent_report_count", { p_ip_hash: ipHash });
    if (ipc.error) {
      await logSystem(deps, "warning", `ip_recent_report_count: ${ipc.error.message}`);
    } else if (typeof ipc.data === "number") {
      if (ipc.data >= blockAt) {
        await logSecurity(deps, "ip_limited", userId, ipHash);
        return json(429, { code: "ip_limited" }, cors);
      }
      ipBurst = ipc.data >= flagAt;
    }

    // 4б) Снимките се проверяват преди сигналът да бъде създаден
    let photos: Processed[] = [];
    if (input.photoPaths.length > 0) {
      const prepared = await preparePhotos(deps, userId, input.idempotencyKey, input.photoPaths);
      if ("error" in prepared) return json(400, { code: prepared.error }, cors);
      photos = prepared;
    }

    // 5) Адреси от координатите: сървърът решава, не потребителят
    const { data: sub } = await deps.admin.from("subcategories").select("hide_exact_address").eq("id", input.subcategoryId).maybeSingle();
    const hideExact = sub?.hide_exact_address ?? true;
    const geo = await reverseGeocode(deps, input.lat, input.lng);
    const { publicAddress, exactAddress } = addressesFrom(geo, hideExact);

    // 6) Пречистен текст и причини за преглед
    const pub = buildPublicText(input.title, input.description);

    // 7) Всичко останало (граница, лимити, права) решава базата в една транзакция
    const { data, error } = await deps.admin.rpc("create_report", {
      p_user_id: userId,
      p_idempotency_key: input.idempotencyKey,
      p_subcategory_id: input.subcategoryId,
      p_title: pub.title,
      p_description: pub.description,
      p_original_title: input.title,
      p_original_description: input.description,
      p_lat: input.lat,
      p_lng: input.lng,
      p_public_address: publicAddress,
      p_exact_address: exactAddress,
      p_ip_hash: ipHash,
      p_suspicious_reasons: ipBurst ? [...pub.reasons, "ip_burst"] : pub.reasons,
      p_photo_count: photos.length,
    });
    if (error) {
      const mapped = mapDbError(error.message);
      if (mapped) {
        if (mapped.code === "rate_limited") await logSecurity(deps, "rate_limited", userId, ipHash);
        return json(mapped.status, { code: mapped.code }, cors);
      }
      await logSystem(deps, "error", `create_report: ${error.message}`);
      return json(500, { code: "internal" }, cors);
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      await logSystem(deps, "error", "create_report върна празен отговор");
      return json(500, { code: "internal" }, cors);
    }
    const saved = photos.length > 0 ? await storePhotos(deps, row.out_report_id, photos, input.photoPaths) : 0;
    return json(201, {
      number: row.out_number,
      status: row.out_status,
      needs_review: row.out_needs_review,
      photos_saved: saved,
      photos_failed: photos.length - saved,
    }, cors);
  } catch (e) {
    await logSystem(deps, "error", `непредвидена грешка: ${e instanceof Error ? e.message : String(e)}`);
    return json(500, { code: "internal" }, cors);
  }
}
