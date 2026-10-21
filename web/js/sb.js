/* CallSliven — the one Supabase client for the whole site: window.SB.
   Needs vendor/supabase-js-2.118.0/supabase.js and js/config.js loaded first.
   Pages with the main navigation don't include it themselves: js/common.js loads it when it is needed. */
(() => {
  const c = window.CS_CONFIG || {};
  window.SB = window.SB || window.supabase.createClient(c.SUPABASE_URL, c.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
})();
