// index.ts — входна точка на Edge Function "maintenance" (пуска се с --no-verify-jwt; пази се със CRON_SECRET).
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
    rpc: (name, args) => admin.rpc(name, args),
    removeFiles: (paths) => admin.storage.from("report-photos").remove(paths),
  })
);
