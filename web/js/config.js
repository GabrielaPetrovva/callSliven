/* CallSliven — site settings. Edit this file only.
   Everything here is PUBLIC by design (the browser needs it). Secret keys — service_role, Turnstile secret,
   Resend — live only in Supabase (Edge Function secrets / Auth settings), never here (SEC-4). */
window.CS_CONFIG = {
  /* Map tiles.
     Leave MAPTILER_KEY empty to use the free CARTO light map (no key needed).
     To use MapTiler: create a free account at https://cloud.maptiler.com,
     copy your key from "API keys" and paste it below, e.g. 'AbC123xyz...'. */
  MAPTILER_KEY: 'gPE3pMQ9GSPxwGp5pKf6',
  MAPTILER_STYLE: 'streets-v2',  // other options: 'basic-v2', 'bright-v2', 'dataviz', 'outdoor-v2'

  /* Supabase: Project Settings → API. callsliven-dev now; the production project when you publish. */
  SUPABASE_URL: 'https://mrqqzgatxrnaeqdsummo.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ycXF6Z2F0eHJuYWVxZHN1bW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4MDEyNTQsImV4cCI6MjEwNzM3NzI1NH0.RiSDNqj5SdvORQSCW_S0uYuTS38RRDvV8V0X83nVbcg',       // anon / public key

  /* Cloudflare Turnstile: the Site key (public) of the widget whose Secret key is in Supabase → Attack Protection */
  TURNSTILE_SITE_KEY: '0x4AAAAAAFYmf1nodSzjQ7e6',

  /* AUTH-2: saved in profiles.consent_version at sign-up. Raise it when privacy.html changes. */
  POLICY_VERSION: 'v1'
};
