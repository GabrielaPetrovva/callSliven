import nodeAssert from "node:assert/strict";
import { handle } from "./handler.ts";
import { dispatchMail, esc, outboxMail, safeEqual } from "./lib.ts";

const assert = (v: unknown, msg?: string) => nodeAssert.ok(v, msg);
const assertEquals = (a: unknown, b: unknown, msg?: string) => nodeAssert.deepStrictEqual(a, b, msg);

const SECRET = "0123456789abcdef0123";

const dispatchRow = {
  out_number: 12, out_title: "Дупка <b>на</b> улицата", out_description: "Голяма дупка & опасна\nвтори ред",
  out_category: "Пътища", out_subcategory: "Дупки", out_address: "ул. Хаджи Димитър 12, Сливен",
  out_lat: 42.6824, out_lng: 26.3229, out_institution: "Община Сливен", out_to_email: "demo@example.invalid",
  out_is_demo: true, out_role: "to", out_attempt: 1, out_created_at: "2026-10-16T17:00:00Z",
};
const outboxRow = {
  out_kind: "report_rejected", out_to_email: "anna@example.invalid", out_first_name: "Анна <script>",
  out_report_number: 12, out_reject_reason: "insufficient_info", out_reject_note: "Липсва адрес", out_data: {}, out_created_at: "2026-10-16T17:00:00Z",
};

function setup(opts: {
  env?: Record<string, string | undefined>;
  dispatchIds?: number[];
  outboxIds?: number[];
  resend?: (n: number) => Response;
  dispatchRow?: unknown;
  outboxRow?: unknown;
} = {}) {
  const env: Record<string, string | undefined> = {
    CRON_SECRET: SECRET, RESEND_API_KEY: "re_x", RESEND_FROM: "CallSliven <onboarding@resend.dev>", ...opts.env,
  };
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const sent: { to: string[]; subject: string; html: string; text: string; idem: string }[] = [];
  let n = 0;
  const deps = {
    env: (k: string) => env[k],
    sleep: () => Promise.resolve(),
    fetch: ((_u: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      sent.push({ ...body, idem: (init?.headers as Record<string, string>)["Idempotency-Key"] });
      n++;
      return Promise.resolve(opts.resend ? opts.resend(n) : new Response(JSON.stringify({ id: `msg-${n}` }), { status: 200 }));
    }) as typeof fetch,
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      switch (name) {
        case "dispatch_claim": return Promise.resolve({ data: (opts.dispatchIds ?? []).map((id) => ({ out_id: id })), error: null });
        case "outbox_claim": return Promise.resolve({ data: (opts.outboxIds ?? []).map((id) => ({ out_id: id })), error: null });
        case "dispatch_get_payload": return Promise.resolve({ data: [opts.dispatchRow ?? dispatchRow], error: null });
        case "outbox_get_payload": return Promise.resolve({ data: [opts.outboxRow ?? outboxRow], error: null });
        default: return Promise.resolve({ data: null, error: null });
      }
    },
  };
  return { deps, rpcCalls, sent };
}

const post = (secret?: string) =>
  new Request("https://x.test/send-emails", { method: "POST", headers: secret ? { "x-cron-secret": secret } : {}, body: "{}" });

Deno.test("без или с грешна тайна: 401, нищо не се взема от опашката", async () => {
  const { deps, rpcCalls } = setup({ dispatchIds: [1] });
  assertEquals((await handle(post(), deps)).status, 401);
  assertEquals((await handle(post("wrong-secret-123456"), deps)).status, 401);
  assertEquals((await handle(new Request("https://x.test", { method: "GET" }), deps)).status, 405);
  assert(!rpcCalls.some((c) => c.name.endsWith("_claim")));
});

Deno.test("липсваща или къса тайна, или липсващ ключ на Resend: 500 и опашките не се пипат", async () => {
  for (const env of [{ CRON_SECRET: undefined }, { CRON_SECRET: "къса" }, { RESEND_API_KEY: undefined }, { RESEND_FROM: undefined }]) {
    const { deps, rpcCalls } = setup({ env, dispatchIds: [1] });
    assertEquals((await handle(post(SECRET), deps)).status, 500);
    assert(!rpcCalls.some((c) => c.name.endsWith("_claim")), JSON.stringify(env));
  }
});

Deno.test("писмо към институция: изпраща се, отбелязва се като изпратено с id от Resend", async () => {
  const { deps, rpcCalls, sent } = setup({ dispatchIds: [5] });
  const res = await handle(post(SECRET), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { dispatches: { sent: 1, failed: 0 }, outbox: { sent: 0, failed: 0 } });
  assertEquals(sent.length, 1);
  assertEquals(sent[0].to, ["demo@example.invalid"]);
  assertEquals(sent[0].idem, "dispatch-5");
  assert(sent[0].subject.startsWith("[ДЕМО] Сигнал №12"));
  const mark = rpcCalls.find((c) => c.name === "dispatch_mark_result")!.args;
  assertEquals(mark, { p_dispatch_id: 5, p_status: "sent", p_provider_message_id: "msg-1" });
});

Deno.test("грешка от Resend: изпращането се отбелязва като неуспешно и се записва в журнала", async () => {
  const { deps, rpcCalls } = setup({
    dispatchIds: [5],
    resend: () => new Response(JSON.stringify({ message: "domain not verified" }), { status: 403 }),
  });
  const res = await handle(post(SECRET), deps);
  assertEquals((await res.json()).dispatches, { sent: 0, failed: 1 });
  const mark = rpcCalls.find((c) => c.name === "dispatch_mark_result")!.args;
  assertEquals(mark.p_status, "failed");
  assert(String(mark.p_error).includes("domain not verified"));
  assert(rpcCalls.some((c) => c.name === "log_system_event" && c.args.p_level === "error"));
});

Deno.test("писмо към потребител: отхвърлен сигнал", async () => {
  const { deps, rpcCalls, sent } = setup({ outboxIds: [3] });
  const res = await handle(post(SECRET), deps);
  assertEquals((await res.json()).outbox, { sent: 1, failed: 0 });
  assertEquals(sent[0].to, ["anna@example.invalid"]);
  assertEquals(sent[0].idem, "outbox-3");
  assert(sent[0].subject.includes("№12"));
  assert(sent[0].text.includes("Липсва адрес"));
  assert(!sent[0].html.includes("<script>"));
  assertEquals(rpcCalls.find((c) => c.name === "outbox_mark_result")!.args, { p_id: 3, p_ok: true, p_error: null });
});

Deno.test("писмо към потребител: неуспех се подава към базата за повторен опит", async () => {
  const { deps, rpcCalls } = setup({ outboxIds: [3], resend: () => new Response("{}", { status: 500 }) });
  const res = await handle(post(SECRET), deps);
  assertEquals((await res.json()).outbox, { sent: 0, failed: 1 });
  const mark = rpcCalls.find((c) => c.name === "outbox_mark_result")!.args;
  assertEquals(mark.p_ok, false);
});

Deno.test("непознат вид писмо се приключва без изпращане", async () => {
  const { deps, rpcCalls, sent } = setup({ outboxIds: [3], outboxRow: { ...outboxRow, out_kind: "нещо ново" } });
  await handle(post(SECRET), deps);
  assertEquals(sent.length, 0);
  assertEquals(rpcCalls.find((c) => c.name === "outbox_mark_result")!.args.p_ok, true);
});

Deno.test("няколко писма: всяко се отбелязва поотделно, грешка в едно не спира другите", async () => {
  const { deps, sent } = setup({
    dispatchIds: [1, 2, 3],
    resend: (n) => n === 2 ? new Response("{}", { status: 500 }) : new Response(JSON.stringify({ id: `m${n}` }), { status: 200 }),
  });
  const res = await handle(post(SECRET), deps);
  assertEquals((await res.json()).dispatches, { sent: 2, failed: 1 });
  assertEquals(sent.length, 3);
});

Deno.test("шаблони: HTML се екранира, демо режимът е ясен, повторното изпращане се вижда", () => {
  const m = dispatchMail({ ...dispatchRow, out_attempt: 2, out_role: "cc" }, "https://callsliven.example/");
  assert(m.subject.startsWith("[ДЕМО] Повторно: Сигнал №12"));
  assert(m.html.includes("Дупка &lt;b&gt;на&lt;/b&gt; улицата"));
  assert(!m.html.includes("<b>на</b>"));
  assert(m.text.includes("ДЕМО РЕЖИМ"));
  assert(m.text.includes("копие за информация"));
  assert(m.text.includes("https://callsliven.example/report.html?number=12"));
  assert(m.html.includes("openstreetmap.org"));
  const real = dispatchMail({ ...dispatchRow, out_is_demo: false });
  assert(!real.subject.includes("ДЕМО") && !real.text.includes("ДЕМО"));
});

Deno.test("шаблони за потребители", () => {
  assert(outboxMail({ ...outboxRow, out_data: { action: "user.role_changed" }, out_kind: "security_notice" })!.text.includes("променен"));
  assert(outboxMail({ ...outboxRow, out_data: { action: "contact.accessed" }, out_kind: "security_notice" })!.text.includes("контактните данни"));
  assertEquals(outboxMail({ ...outboxRow, out_data: { action: "друго" }, out_kind: "security_notice" }), null);
  for (const r of ["insufficient_info", "out_of_scope", "inappropriate", "spam"]) {
    assert(outboxMail({ ...outboxRow, out_reject_reason: r, out_reject_note: null })!.text.includes("не беше приет"), r);
  }
});

Deno.test("помощни функции", () => {
  assertEquals(esc(`<a href="x">&'</a>`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
  assert(safeEqual("abc", "abc"));
  assert(!safeEqual("abc", "abd"));
  assert(!safeEqual("abc", "abcd"));
  assert(!safeEqual("", "x"));
});
