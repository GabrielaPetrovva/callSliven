import nodeAssert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { handle, verifySignature } from "./handler.ts";

const assert = (v: unknown, msg?: string) => nodeAssert.ok(v, msg);
const assertEquals = (a: unknown, b: unknown, msg?: string) => nodeAssert.deepStrictEqual(a, b, msg);

const RAW_KEY = Buffer.from("super-secret-key-for-tests-12345");
const SECRET = "whsec_" + RAW_KEY.toString("base64");
const NOW = 1_800_000_000_000;

function sign(id: string, ts: string, body: string, key = RAW_KEY) {
  return "v1," + createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
}

function setup(rpcResult: { data: unknown; error: { message: string } | null } = { data: true, error: null }) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const deps = {
    env: (k: string) => (k === "RESEND_WEBHOOK_SECRET" ? SECRET : undefined),
    rpc: (name: string, args: Record<string, unknown>) => { calls.push({ name, args }); return Promise.resolve(rpcResult); },
    now: () => NOW,
  };
  return { deps, calls };
}

function req(body: unknown, opts: { sig?: string; ts?: string; id?: string } = {}) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const id = opts.id ?? "msg_1";
  const ts = opts.ts ?? String(NOW / 1000);
  return new Request("https://x.test/resend-webhook", {
    method: "POST",
    headers: { "svix-id": id, "svix-timestamp": ts, "svix-signature": opts.sig ?? sign(id, ts, raw) },
    body: raw,
  });
}

Deno.test("доставено: подписът е валиден, статусът се прилага", async () => {
  const { deps, calls } = setup();
  const res = await handle(req({ type: "email.delivered", data: { email_id: "abc-123" } }), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { applied: true });
  assertEquals(calls[0], { name: "dispatch_apply_webhook", args: { p_provider_message_id: "abc-123", p_event: "delivered", p_error: null } });
});

Deno.test("върнато и отказано: неуспех с причина", async () => {
  for (const type of ["email.bounced", "email.failed", "email.complained", "email.suppressed"]) {
    const { deps, calls } = setup();
    await handle(req({ type, data: { email_id: "abc", bounce: { message: "mailbox full" } } }), deps);
    assertEquals(calls[0].args.p_event, "failed", type);
    assert(String(calls[0].args.p_error).startsWith(type), type);
  }
});

Deno.test("другите събития се пренебрегват, без да се вика базата", async () => {
  for (const type of ["email.sent", "email.opened", "email.clicked", "email.delivery_delayed", "domain.created"]) {
    const { deps, calls } = setup();
    const res = await handle(req({ type, data: { email_id: "abc" } }), deps);
    assertEquals(res.status, 200);
    assertEquals(calls.length, 0, type);
  }
});

Deno.test("лош или липсващ подпис, стар или бъдещ час: 401 и нищо не се прилага", async () => {
  const body = { type: "email.delivered", data: { email_id: "abc" } };
  const cases = [
    { sig: "v1,AAAA" },
    { sig: "" },
    { sig: sign("msg_1", String(NOW / 1000), JSON.stringify(body), Buffer.from("друг ключ")) },
    { ts: String(NOW / 1000 - 3600) },
    { ts: String(NOW / 1000 + 3600) },
    { ts: "abc" },
  ];
  for (const c of cases) {
    const { deps, calls } = setup();
    const res = await handle(req(body, c), deps);
    assertEquals(res.status, 401, JSON.stringify(c));
    assertEquals(calls.length, 0);
  }
});

Deno.test("променено тяло след подписването се отхвърля", async () => {
  const { deps, calls } = setup();
  const good = JSON.stringify({ type: "email.delivered", data: { email_id: "abc" } });
  const sig = sign("msg_1", String(NOW / 1000), good);
  const res = await handle(req(JSON.stringify({ type: "email.delivered", data: { email_id: "друг" } }), { sig }), deps);
  assertEquals(res.status, 401);
  assertEquals(calls.length, 0);
});

Deno.test("няколко подписа в заглавието: достатъчен е един верен", async () => {
  const raw = JSON.stringify({ type: "email.delivered", data: { email_id: "abc" } });
  const ts = String(NOW / 1000);
  const ok = await verifySignature(SECRET, "msg_1", ts, raw, `v1,AAAA ${sign("msg_1", ts, raw)}`, NOW);
  assert(ok);
  assert(!(await verifySignature(SECRET, "msg_1", ts, raw, `v2,${sign("msg_1", ts, raw).slice(3)}`, NOW)));
});

Deno.test("липсваща настройка, грешка в базата, непознато съобщение", async () => {
  const noSecret = { env: () => undefined, rpc: () => Promise.resolve({ data: null, error: null }), now: () => NOW };
  assertEquals((await handle(req({ type: "email.delivered", data: { email_id: "a" } }), noSecret)).status, 500);
  const { deps } = setup({ data: null, error: { message: "boom" } });
  assertEquals((await handle(req({ type: "email.delivered", data: { email_id: "a" } }), deps)).status, 500);
  const { deps: d2 } = setup({ data: false, error: null });
  const r = await handle(req({ type: "email.delivered", data: { email_id: "непознато" } }), d2);
  assertEquals(await r.json(), { applied: false });
  assertEquals((await handle(new Request("https://x.test", { method: "GET" }), deps)).status, 405);
  assertEquals((await handle(req("{не е json"), setup().deps)).status, 400);
});
