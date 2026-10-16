// handler.ts — изпразва опашките за писма: към институции (report_dispatches) и към потребители (email_outbox).
// Вика се на всяка минута от pg_cron през pg_net. Достъпът е със споделена тайна, не с потребителски токен.
import { type DispatchPayload, dispatchMail, type Mail, type OutboxPayload, outboxMail, safeEqual } from "./lib.ts";

// deno-lint-ignore no-explicit-any
type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: { message: string } | null }>;
export interface Deps {
  env: (k: string) => string | undefined;
  fetch: typeof fetch;
  rpc: Rpc;
  sleep: (ms: number) => Promise<void>;
}

const BATCH = 10;
const GAP_MS = 600; // Resend позволява около 2 заявки в секунда

interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
}

async function sendViaResend(deps: Deps, to: string, mail: Mail, idemKey: string): Promise<SendResult> {
  const body: Record<string, unknown> = {
    from: deps.env("RESEND_FROM"),
    to: [to],
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  };
  const replyTo = deps.env("REPLY_TO");
  if (replyTo) body.reply_to = replyTo;
  try {
    const res = await deps.fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${deps.env("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idemKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && typeof data?.id === "string") return { ok: true, id: data.id };
    return { ok: false, error: `Resend ${res.status}: ${String(data?.message ?? data?.name ?? "грешка").slice(0, 300)}` };
  } catch (e) {
    return { ok: false, error: `мрежова грешка: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300) };
  }
}

async function logSystem(deps: Deps, level: "warning" | "error", message: string) {
  try {
    await deps.rpc("log_system_event", { p_source: "send-emails", p_level: level, p_message: message, p_details: {} });
  } catch { /* журналът не бива да чупи работата */ }
}

async function processDispatches(deps: Deps) {
  const r = { sent: 0, failed: 0 };
  const { data: claimed, error } = await deps.rpc("dispatch_claim", { p_limit: BATCH });
  if (error) { await logSystem(deps, "error", `dispatch_claim: ${error.message}`); return r; }
  for (const row of (claimed ?? []) as { out_id: number }[]) {
    const id = row.out_id;
    try {
      const { data, error: perr } = await deps.rpc("dispatch_get_payload", { p_dispatch_id: id });
      const p = (Array.isArray(data) ? data[0] : data) as DispatchPayload | undefined;
      if (perr || !p) throw new Error(perr?.message ?? "няма данни за писмото");
      if (!p.out_to_email) throw new Error("липсва получател");
      const res = await sendViaResend(deps, p.out_to_email, dispatchMail(p, deps.env("SITE_URL")), `dispatch-${id}`);
      if (res.ok) {
        await deps.rpc("dispatch_mark_result", { p_dispatch_id: id, p_status: "sent", p_provider_message_id: res.id });
        r.sent++;
      } else {
        await deps.rpc("dispatch_mark_result", { p_dispatch_id: id, p_status: "failed", p_error: res.error });
        await logSystem(deps, "error", `писмо към институция (изпращане ${id}): ${res.error}`);
        r.failed++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await deps.rpc("dispatch_mark_result", { p_dispatch_id: id, p_status: "failed", p_error: msg.slice(0, 300) });
      await logSystem(deps, "error", `писмо към институция (изпращане ${id}): ${msg}`);
      r.failed++;
    }
    await deps.sleep(GAP_MS);
  }
  return r;
}

async function processOutbox(deps: Deps) {
  const r = { sent: 0, failed: 0 };
  const { data: claimed, error } = await deps.rpc("outbox_claim", { p_limit: BATCH });
  if (error) { await logSystem(deps, "error", `outbox_claim: ${error.message}`); return r; }
  for (const row of (claimed ?? []) as { out_id: number }[]) {
    const id = row.out_id;
    try {
      const { data, error: perr } = await deps.rpc("outbox_get_payload", { p_id: id });
      const p = (Array.isArray(data) ? data[0] : data) as OutboxPayload | undefined;
      if (perr || !p) throw new Error(perr?.message ?? "няма данни за писмото");
      const mail = outboxMail(p);
      if (!mail) {
        // вид писмо, който не познаваме: приключваме го, за да не се върти
        await deps.rpc("outbox_mark_result", { p_id: id, p_ok: true });
        continue;
      }
      const res = await sendViaResend(deps, p.out_to_email, mail, `outbox-${id}`);
      await deps.rpc("outbox_mark_result", { p_id: id, p_ok: res.ok, p_error: res.ok ? null : res.error });
      if (res.ok) r.sent++; else r.failed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await deps.rpc("outbox_mark_result", { p_id: id, p_ok: false, p_error: msg.slice(0, 300) });
      r.failed++;
    }
    await deps.sleep(GAP_MS);
  }
  return r;
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
  const out = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });

  if (req.method !== "POST") return out(405, { code: "method_not_allowed" });

  const secret = deps.env("CRON_SECRET");
  if (!secret || secret.length < 16) {
    await logSystem(deps, "error", "CRON_SECRET липсва или е твърде къса");
    return out(500, { code: "misconfigured" });
  }
  const given = req.headers.get("x-cron-secret") ?? "";
  if (!safeEqual(given, secret)) return out(401, { code: "unauthorized" });

  // без ключ за Resend опашките не се пипат: писмата изчакват
  if (!deps.env("RESEND_API_KEY") || !deps.env("RESEND_FROM")) {
    await logSystem(deps, "error", "Липсва RESEND_API_KEY или RESEND_FROM");
    return out(500, { code: "misconfigured" });
  }

  const dispatches = await processDispatches(deps);
  const outbox = await processOutbox(deps);
  return out(200, { dispatches, outbox });
}
