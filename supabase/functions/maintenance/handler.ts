// handler.ts — ежедневна поддръжка: изтрива остарели временни снимки и пази проекта „жив“.
// Вика се от pg_cron през pg_net със споделена тайна, като send-emails.

// deno-lint-ignore no-explicit-any
type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: { message: string } | null }>;
export interface Deps {
  env: (k: string) => string | undefined;
  rpc: Rpc;
  removeFiles: (paths: string[]) => PromiseLike<{ error: { message: string } | null }>;
}

const CHUNK = 100;
const MAX_ROUNDS = 5; // до 5 x 500 файла на едно изпълнение; остатъкът чака следващия ден

function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  const n = Math.max(ea.length, eb.length);
  for (let i = 0; i < n; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

async function log(deps: Deps, level: "info" | "warning" | "error", message: string, details: Record<string, unknown> = {}) {
  try {
    await deps.rpc("log_system_event", { p_source: "maintenance", p_level: level, p_message: message, p_details: details });
  } catch { /* журналът не бива да чупи работата */ }
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
  const out = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });

  if (req.method !== "POST") return out(405, { code: "method_not_allowed" });
  const secret = deps.env("CRON_SECRET");
  if (!secret || secret.length < 16) return out(500, { code: "misconfigured" });
  if (!safeEqual(req.headers.get("x-cron-secret") ?? "", secret)) return out(401, { code: "unauthorized" });

  // 1) проверка, че базата отговаря
  const health = await deps.rpc("health_check", {});
  if (health.error) {
    await log(deps, "error", `health_check: ${health.error.message}`);
    return out(500, { code: "internal" });
  }

  // 2) остарели временни снимки (не качени докрай или останали от неуспешни подавания)
  let removed = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { data, error } = await deps.rpc("storage_tmp_stale", { p_older_than: "24 hours" });
    if (error) { await log(deps, "error", `storage_tmp_stale: ${error.message}`); break; }
    const names = ((data ?? []) as { out_name: string }[]).map((r) => r.out_name).filter((n) => n.startsWith("tmp/"));
    if (names.length === 0) break;
    let failed = false;
    for (let i = 0; i < names.length; i += CHUNK) {
      const res = await deps.removeFiles(names.slice(i, i + CHUNK));
      if (res.error) { await log(deps, "error", `изтриване на временни снимки: ${res.error.message}`); failed = true; break; }
      removed += Math.min(CHUNK, names.length - i);
    }
    if (failed) break;
  }
  if (removed > 0) await log(deps, "info", "Изтрити са остарели временни снимки", { files: removed });

  return out(200, { ok: true, removed });
}
