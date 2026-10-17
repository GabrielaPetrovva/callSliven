import nodeAssert from "node:assert/strict";

const assert = (v: unknown, msg?: string) => nodeAssert.ok(v, msg);
const assertEquals = (a: unknown, b: unknown, msg?: string) => nodeAssert.deepStrictEqual(a, b, msg);
import { handle } from "./handler.ts";
import { addressesFrom, sanitize, validateInput } from "./lib.ts";

const USER = "a1000000-0000-4000-8000-000000000001";
const KEY = "10000000-0000-4000-8000-000000000001";

interface Calls { rpc: { name: string; args: Record<string, unknown> }[]; fetchUrls: string[]; uploads: string[]; removed: string[] }

function setup(opts: {
  turnstile?: "ok" | "failed" | "down";
  geo?: "ok" | "down";
  rpcError?: string;
  hide?: boolean;
  env?: Record<string, string | undefined>;
  user?: string | null;
  replay?: boolean;
  files?: Record<string, Uint8Array>;
  uploadFails?: boolean;
  ipCount?: number | null;
  ipError?: boolean;
} = {}) {
  const calls: Calls = { rpc: [], fetchUrls: [], uploads: [], removed: [] };
  const env: Record<string, string | undefined> = {
    TURNSTILE_SECRET_KEY: "secret", IP_HASH_SALT: "salt", GEOAPIFY_API_KEY: "gk", ...opts.env,
  };
  const user = opts.user === undefined ? USER : opts.user;
  const deps = {
    env: (k: string) => env[k],
    fetch: ((url: string | URL | Request) => {
      const u = String(url);
      calls.fetchUrls.push(u);
      if (u.includes("turnstile")) {
        if (opts.turnstile === "down") return Promise.reject(new Error("net"));
        return Promise.resolve(new Response(JSON.stringify({ success: opts.turnstile !== "failed" })));
      }
      if (opts.geo === "down") return Promise.reject(new Error("net"));
      return Promise.resolve(new Response(JSON.stringify({
        results: [{ formatted: "ул. Хаджи Димитър 12, Сливен", street: "ул. Хаджи Димитър", housenumber: "12", suburb: "Клуцохор", city: "Сливен" }],
      })));
    }) as typeof fetch,
    admin: {
      auth: { getUser: () => Promise.resolve({ data: { user: user ? { id: user } : null }, error: user ? null : "bad" }) },
      rpc: (name: string, args: Record<string, unknown>) => {
        calls.rpc.push({ name, args });
        if (name === "create_report") {
          if (opts.rpcError) return Promise.resolve({ data: null, error: { message: opts.rpcError } });
          return Promise.resolve({ data: [{ out_report_id: "r-1", out_number: 42, out_status: "new", out_needs_review: (args.p_suspicious_reasons as string[]).length > 0 }], error: null });
        }
        if (name === "ip_recent_report_count") {
          if (opts.ipError) return Promise.resolve({ data: null, error: { message: "boom" } });
          return Promise.resolve({ data: opts.ipCount ?? 0, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      from: (table: string) => {
        const q = {
          eq: () => q,
          maybeSingle: () => {
            if (table === "subcategories") return Promise.resolve({ data: { hide_exact_address: opts.hide ?? false }, error: null });
            if (table === "report_private") return Promise.resolve({ data: opts.replay ? { report_id: "r-0" } : null, error: null });
            if (table === "reports") return Promise.resolve({ data: { number: 7, status: "new", needs_review: false }, error: null });
            return Promise.resolve({ data: null, error: null });
          },
        };
        return { select: () => q };
      },
      storage: {
        from: () => ({
          download: (p: string) => {
            const f = opts.files?.[p];
            return Promise.resolve(f ? { data: new Blob([f.slice().buffer as ArrayBuffer]), error: null } : { data: null, error: { message: "not found" } });
          },
          upload: (p: string) => {
            if (opts.uploadFails) return Promise.resolve({ error: { message: "boom" } });
            calls.uploads.push(p);
            return Promise.resolve({ error: null });
          },
          remove: (ps: string[]) => { calls.removed.push(...ps); return Promise.resolve({ error: null }); },
        }),
      },
    },
  };
  return { deps, calls };
}

function req(body: unknown, headers: Record<string, string> = {}, method = "POST") {
  return new Request("https://x.test/submit-report", {
    method,
    headers: { authorization: "Bearer tok", "content-type": "application/json", ...headers },
    body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });
}

const good = {
  subcategory_id: 1, title: "Дупка на улицата", description: "Голяма дупка пред блока, опасна за колите.",
  lat: 42.6824, lng: 26.3229, idempotency_key: KEY, turnstile_token: "t",
};

Deno.test("успешно подаване: пречистен текст, адреси от сървъра, идентичност от токена", async () => {
  const { deps, calls } = setup();
  const res = await handle(req({ ...good, user_id: "evil", p_user_id: "evil" }), deps);
  assertEquals(res.status, 201);
  assertEquals(await res.json(), { number: 42, status: "new", needs_review: false, photos_saved: 0, photos_failed: 0 });
  const a = calls.rpc.find((c) => c.name === "create_report")!.args;
  assertEquals(a.p_user_id, USER);
  assertEquals(a.p_public_address, "ул. Хаджи Димитър, Сливен");
  assertEquals(a.p_exact_address, "ул. Хаджи Димитър 12, Сливен");
  assertEquals(a.p_photo_count, 0);
  assert(typeof a.p_ip_hash === "string" && (a.p_ip_hash as string).length === 64);
});

Deno.test("скрит адрес: публично само квартал и град", async () => {
  const { deps, calls } = setup({ hide: true });
  await handle(req(good), deps);
  assertEquals(calls.rpc.find((c) => c.name === "create_report")!.args.p_public_address, "Клуцохор, Сливен");
});

Deno.test("геокодерът не работи: сигналът минава без адреси", async () => {
  const { deps, calls } = setup({ geo: "down" });
  const res = await handle(req(good), deps);
  assertEquals(res.status, 201);
  const a = calls.rpc.find((c) => c.name === "create_report")!.args;
  assertEquals(a.p_public_address, null);
  assertEquals(a.p_exact_address, null);
});

Deno.test("без токен или с невалиден токен: 401", async () => {
  const { deps } = setup();
  const r1 = await handle(new Request("https://x.test", { method: "POST", body: "{}" }), deps);
  assertEquals(r1.status, 401);
  const { deps: d2 } = setup({ user: null });
  assertEquals((await handle(req(good), d2)).status, 401);
});

Deno.test("Turnstile: отказ -> 400 и запис в журнала; недостъпен -> 503", async () => {
  const { deps, calls } = setup({ turnstile: "failed" });
  const res = await handle(req(good), deps);
  assertEquals(res.status, 400);
  assertEquals((await res.json()).code, "captcha_failed");
  assert(calls.rpc.some((c) => c.name === "log_security_event" && c.args.p_type === "captcha_failed"));
  assert(!calls.rpc.some((c) => c.name === "create_report"));
  const { deps: d2 } = setup({ turnstile: "down" });
  assertEquals((await handle(req(good), d2)).status, 503);
});

Deno.test("липсваща настройка: 500, не се създава сигнал", async () => {
  const { deps, calls } = setup({ env: { IP_HASH_SALT: undefined } });
  assertEquals((await handle(req(good), deps)).status, 500);
  assert(!calls.rpc.some((c) => c.name === "create_report"));
});

Deno.test("грешки от базата се превеждат", async () => {
  for (
    const [msg, status, code] of [
      ["rate_limited", 429, "rate_limited"],
      ["outside_municipality", 422, "outside_municipality"],
      ["photo_required", 422, "photo_required"],
      ["account_restricted", 403, "account_restricted"],
      ["нещо непознато", 500, "internal"],
    ] as const
  ) {
    const { deps, calls } = setup({ rpcError: msg });
    const res = await handle(req(good), deps);
    assertEquals(res.status, status, msg);
    assertEquals((await res.json()).code, code);
    if (code === "internal") assert(calls.rpc.some((c) => c.name === "log_system_event"));
    if (code === "rate_limited") assert(calls.rpc.some((c) => c.name === "log_security_event" && c.args.p_type === "rate_limited"));
  }
});

Deno.test("невалиден вход", async () => {
  const { deps } = setup();
  const cases: [Record<string, unknown>, string][] = [
    [{ ...good, title: "ab" }, "invalid_title"],
    [{ ...good, description: "къс" }, "invalid_description"],
    [{ ...good, lat: 91 }, "invalid_location"],
    [{ ...good, lat: "42" }, "invalid_location"],
    [{ ...good, subcategory_id: "1" }, "invalid_subcategory"],
    [{ ...good, subcategory_id: 1.5 }, "invalid_subcategory"],
    [{ ...good, idempotency_key: "x" }, "invalid_request"],
    [{ ...good, turnstile_token: "" }, "captcha_failed"],
    [{ ...good, photo_paths: ["a", "b", "c", "d"] }, "invalid_photo"],
    [{ ...good, photo_paths: ["a", "a"] }, "invalid_photo"],
    [{ ...good, photo_paths: "tmp/x" }, "invalid_photo"],
  ];
  for (const [b, code] of cases) {
    const res = await handle(req(b), deps);
    assertEquals(res.status, 400, code);
    assertEquals((await res.json()).code, code);
  }
  assertEquals((await handle(req("не е json"), deps)).status, 400);
  assertEquals((await handle(req("[]"), deps)).status, 400);
  assertEquals((await handle(req("x".repeat(30000)), deps)).status, 413);
});

Deno.test("CORS и методи", async () => {
  const { deps } = setup();
  const pre = await handle(req(null, { origin: "http://localhost:5500" }, "OPTIONS"), deps);
  assertEquals(pre.status, 204);
  assertEquals(pre.headers.get("access-control-allow-origin"), "http://localhost:5500");
  const bad = await handle(req(good, { origin: "https://evil.example" }), deps);
  assertEquals(bad.status, 403);
  assertEquals((await handle(req(null, {}, "GET"), deps)).status, 405);
});

Deno.test("пречистване на личните данни", () => {
  const cases: [string, string, string[]][] = [
    ["Звънете на 0888 123 456 спешно", "Звънете на [номер] спешно", ["phone_or_id"]],
    ["тел. +359 888-123-456", "тел. [номер]", ["phone_or_id"]],
    ["ЕГН 8001011234 е мое", "ЕГН [номер] е мое", ["phone_or_id"]],
    ["пишете на ivan.petrov@abv.bg", "пишете на [имейл]", ["email"]],
    ["вижте https://example.com/x?y=1 там", "вижте [връзка] там", ["url"]],
    ["вижте www.sliven.bg/news", "вижте [връзка]", ["url"]],
    ["Дупка на ул. Хаджи Димитър 12, вх. 3", "Дупка на ул. Хаджи Димитър 12, вх. 3", []],
    ["Сигнал за 25 кв.м. и 3 дървета", "Сигнал за 25 кв.м. и 3 дървета", []],
    ["Номер 2026-10-16 е дата", "Номер 2026-10-16 е дата", []],
    ["Колата СА 1234 АВ е на пътя", "Колата [рег. номер] е на пътя", ["plate"]],
    ["паркирана ВТ0001ВТ пред входа", "паркирана [рег. номер] пред входа", ["plate"]],
    ["автомобил CH 5678 PK и ОВ-1234-ТХ", "автомобил [рег. номер] и [рег. номер]", ["plate"]],
    ["дупката е на 1000 м от блока", "дупката е на 1000 м от блока", []],
    ["на 1000 м. има светофар", "на 1000 м. има светофар", []],
    ["има 3 дървета и 2500 кв.м. площ", "има 3 дървета и 2500 кв.м. площ", []],
    ["блок 12, вх. А 1234 нататък", "блок 12, вх. А 1234 нататък", []],
  ];
  for (const [inp, out, reasons] of cases) {
    const r = sanitize(inp);
    assertEquals(r.text, out, inp);
    assertEquals(r.reasons, reasons, inp);
  }
  assert(sanitize("ИМА ГОЛЯМА ДУПКА ПРЕД БЛОКА И НИКОЙ НЕ ЯЖДА ДА Я ЗАКРИЕ ВЕЧЕ МЕСЕЦИ").reasons.includes("caps"));
  assert(sanitize("аааааааааааааа").reasons.includes("repeat"));
});

Deno.test("подозрителен текст -> needs_review и оригиналът е запазен", async () => {
  const { deps, calls } = setup();
  const res = await handle(req({ ...good, description: "Дупка. Звънете на 0888123456 за подробности." }), deps);
  assertEquals((await res.json()).needs_review, true);
  const a = calls.rpc.find((c) => c.name === "create_report")!.args;
  assertEquals(a.p_description, "Дупка. Звънете на [номер] за подробности.");
  assertEquals(a.p_original_description, "Дупка. Звънете на 0888123456 за подробности.");
  assertEquals(a.p_suspicious_reasons, ["phone_or_id"]);
});

Deno.test("невидими знаци и излишни интервали се чистят", () => {
  const v = validateInput({ ...good, title: "  Дупка‮   на​ улицата  " });
  assert(v.ok);
  if (v.ok) assertEquals(v.value.title, "Дупка на улицата");
});

Deno.test("addressesFrom без резултат", () => {
  assertEquals(addressesFrom(null, false), { publicAddress: null, exactAddress: null });
});

// --- снимки ---
function tinyJpeg(): Uint8Array {
  const seg = (m: number, d: number[]) => [0xff, m, (d.length + 2) >> 8, (d.length + 2) & 255, ...d];
  return new Uint8Array([
    0xff, 0xd8,
    ...seg(0xc0, [8, 0, 64, 0, 64, 1, 1, 0x11, 0]),
    ...seg(0xda, [1, 1, 0, 0, 63, 0]),
    0x12, 0x34, 0x56,
    0xff, 0xd9,
  ]);
}
const P1 = `tmp/${USER}/${KEY}/a.jpg`;
const P2 = `tmp/${USER}/${KEY}/b.jpg`;

Deno.test("снимки: проверяват се, слагат се на постоянно място, временните се трият", async () => {
  const { deps, calls } = setup({ files: { [P1]: tinyJpeg(), [P2]: tinyJpeg() } });
  const res = await handle(req({ ...good, photo_paths: [P1, P2] }), deps);
  assertEquals(res.status, 201);
  const body = await res.json();
  assertEquals([body.photos_saved, body.photos_failed], [2, 0]);
  assertEquals(calls.rpc.find((c) => c.name === "create_report")!.args.p_photo_count, 2);
  assertEquals(calls.uploads, ["reports/r-1/1.jpg", "reports/r-1/2.jpg"]);
  assertEquals(calls.rpc.filter((c) => c.name === "report_add_photo").length, 2);
  assertEquals(calls.removed, [P1, P2]);
});

Deno.test("снимки: чужд или невалиден път се отхвърля преди да се създаде сигнал", async () => {
  for (
    const p of [
      `tmp/другият-потребител/${KEY}/a.jpg`,
      `tmp/${USER}/20000000-0000-4000-8000-000000000002/a.jpg`,
      `reports/r-1/1.jpg`,
      `tmp/${USER}/${KEY}/../x.jpg`,
      `tmp/${USER}/${KEY}/a b.jpg`,
    ]
  ) {
    const { deps, calls } = setup({ files: { [p]: tinyJpeg() } });
    const res = await handle(req({ ...good, photo_paths: [p] }), deps);
    assertEquals(res.status, 400, p);
    assertEquals((await res.json()).code, "invalid_photo");
    assert(!calls.rpc.some((c) => c.name === "create_report"));
  }
});

Deno.test("снимки: липсващ файл и файл, който не е снимка", async () => {
  const { deps } = setup();
  const r1 = await handle(req({ ...good, photo_paths: [P1] }), deps);
  assertEquals((await r1.json()).code, "photo_missing");
  const { deps: d2, calls } = setup({ files: { [P1]: new TextEncoder().encode("това не е снимка, а текст") } });
  const r2 = await handle(req({ ...good, photo_paths: [P1] }), d2);
  assertEquals(r2.status, 400);
  assertEquals((await r2.json()).code, "invalid_photo");
  assert(!calls.rpc.some((c) => c.name === "create_report"));
});

Deno.test("снимки: грешка при качване не отменя сигнала, но се отчита", async () => {
  const { deps, calls } = setup({ files: { [P1]: tinyJpeg() }, uploadFails: true });
  const res = await handle(req({ ...good, photo_paths: [P1] }), deps);
  assertEquals(res.status, 201);
  const body = await res.json();
  assertEquals([body.photos_saved, body.photos_failed], [0, 1]);
  assert(calls.rpc.some((c) => c.name === "log_system_event"));
});

Deno.test("повторно изпращане със същия ключ връща сигнала без нов Turnstile и без нови снимки", async () => {
  const { deps, calls } = setup({ replay: true, turnstile: "failed" });
  const res = await handle(req(good), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { number: 7, status: "new", needs_review: false, replay: true });
  assert(calls.fetchUrls.length === 0);
  assert(!calls.rpc.some((c) => c.name === "create_report"));
});

Deno.test("лимит по IP: под прага нищо, над първия праг - преглед, над втория - отказ", async () => {
  const run = async (ipCount: number) => {
    const { deps, calls } = setup({ ipCount });
    const res = await handle(req(good), deps);
    return { res, calls };
  };
  const a = await run(5);
  assertEquals(a.res.status, 201);
  assertEquals((await a.res.json()).needs_review, false);
  assertEquals(a.calls.rpc.find((c) => c.name === "create_report")!.args.p_suspicious_reasons, []);

  const b = await run(6);
  assertEquals(b.res.status, 201);
  assertEquals((await b.res.json()).needs_review, true);
  assertEquals(b.calls.rpc.find((c) => c.name === "create_report")!.args.p_suspicious_reasons, ["ip_burst"]);

  const c = await run(15);
  assertEquals(c.res.status, 429);
  assertEquals((await c.res.json()).code, "ip_limited");
  assert(!c.calls.rpc.some((x) => x.name === "create_report"));
  assert(c.calls.rpc.some((x) => x.name === "log_security_event" && x.args.p_type === "ip_limited"));
});

Deno.test("лимит по IP: прагът се сменя от настройка; грешка в проверката не спира подаването", async () => {
  const { deps } = setup({ ipCount: 3, env: { IP_BLOCK_AT: "3" } });
  assertEquals((await handle(req(good), deps)).status, 429);
  const { deps: d2, calls } = setup({ ipError: true });
  assertEquals((await handle(req(good), d2)).status, 201);
  assert(calls.rpc.some((c) => c.name === "log_system_event" && c.args.p_level === "warning"));
});
