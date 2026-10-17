// index.ts — входна точка на Edge Function "send-emails".
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { handle } from "./handler.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

Deno.serve((req) =>
  handle(req, {
    env: (k) => Deno.env.get(k),
    fetch,
    rpc: (name, args) => admin.rpc(name, args),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    signedUrls: async (paths, expiresIn) => {
      const { data, error } = await admin.storage.from("report-photos").createSignedUrls(paths, expiresIn);
      if (error || !data) return { urls: null, error: { message: error?.message ?? "няма данни" } };
      const urls = data.map((d) => d.signedUrl).filter((u): u is string => !!u);
      return { urls, error: null };
    },
  })
);
