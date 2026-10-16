import nodeAssert from "node:assert/strict";
import { handle } from "./handler.ts";

const assert = (v: unknown, msg?: string) => nodeAssert.ok(v, msg);
const assertEquals = (a: unknown, b: unknown, msg?: string) => nodeAssert.deepStrictEqual(a, b, msg);
const SECRET = "0123456789abcdef0123";

function setup(opts: { rounds?: string[][]; removeError?: boolean; healthError?: boolean; env?: Record<string, string | undefined> } = {}) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const removed: string[][] = [];
  let round = 0;
  const env: Record<string, string | undefined> = { CRON_SECRET: SECRET, ...opts.env };
  const deps = {
    env: (k: string) => env[k],
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "health_check") return Promise.resolve(opts.healthError ? { data: null, error: { message: "db down" } } : { data: "now", error: null });
      if (name === "storage_tmp_stale") {
        const names = opts.rounds?.[round++] ?? [];
        return Promise.resolve({ data: names.map((n) => ({ out_name: n })), error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    removeFiles: (paths: string[]) => {
      removed.push(paths);
      return Promise.resolve({ error: opts.removeError ? { message: "storage down" } : null });
    },
  };
  return { deps, calls, removed };
}
const post = (secret?: string) => new Request("https://x.test/maintenance", { method: "POST", headers: secret ? { "x-cron-secret": secret } : {} });

Deno.test("достъп: тайна, метод, настройка", async () => {
  const { deps, calls } = setup();
  assertEquals((await handle(post(), deps)).status, 401);
  assertEquals((await handle(post("wrong-secret-123456"), deps)).status, 401);
  assertEquals((await handle(new Request("https://x.test", { method: "GET" }), deps)).status, 405);
  assertEquals((await handle(post(SECRET), setup({ env: { CRON_SECRET: undefined } }).deps)).status, 500);
  assertEquals(calls.length, 0);
});

Deno.test("няма остарели файлове: само проверка на живост, без запис в журнала", async () => {
  const { deps, calls, removed } = setup();
  const res = await handle(post(SECRET), deps);
  assertEquals(await res.json(), { ok: true, removed: 0 });
  assertEquals(removed.length, 0);
  assert(!calls.some((c) => c.name === "log_system_event"));
});

Deno.test("остарели файлове се трият на части и се записва резюме", async () => {
  const many = Array.from({ length: 250 }, (_, i) => `tmp/u/k/${i}.jpg`);
  const { deps, calls, removed } = setup({ rounds: [many, ["tmp/u/k/x.jpg"], []] });
  const res = await handle(post(SECRET), deps);
  assertEquals((await res.json()).removed, 251);
  assertEquals(removed.map((r) => r.length), [100, 100, 50, 1]);
  const log = calls.find((c) => c.name === "log_system_event")!;
  assertEquals(log.args.p_level, "info");
});

Deno.test("никога не трие извън tmp/", async () => {
  const { deps, removed } = setup({ rounds: [["reports/abc/1.jpg", "tmp/u/k/a.jpg"], []] });
  await handle(post(SECRET), deps);
  assertEquals(removed, [["tmp/u/k/a.jpg"]]);
});

Deno.test("грешка в хранилището спира цикъла и се записва", async () => {
  const { deps, calls, removed } = setup({ rounds: [["tmp/a/b/c.jpg"], ["tmp/a/b/c.jpg"], ["tmp/a/b/c.jpg"]], removeError: true });
  const res = await handle(post(SECRET), deps);
  assertEquals((await res.json()).removed, 0);
  assertEquals(removed.length, 1);
  assert(calls.some((c) => c.name === "log_system_event" && c.args.p_level === "error"));
});

Deno.test("базата не отговаря: 500", async () => {
  const { deps } = setup({ healthError: true });
  assertEquals((await handle(post(SECRET), deps)).status, 500);
});
