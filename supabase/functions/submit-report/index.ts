// index.ts — входна точка на Edge Function "submit-report".
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { handle } from "./handler.ts";

// SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY се подават автоматично от Supabase.
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

Deno.serve((req) =>
  handle(req, {
    env: (k) => Deno.env.get(k),
    fetch,
    // deno-lint-ignore no-explicit-any
    admin: admin as any,
  })
);
