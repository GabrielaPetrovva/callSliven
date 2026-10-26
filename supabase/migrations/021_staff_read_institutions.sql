-- 021_staff_read_institutions.sql
-- Админ панелът (admin.html) показва на кого отива сигналът и историята на изпращанията,
-- затова персоналът (с MFA, is_staff()) трябва да чете институциите.
-- Гражданите и анонимните посетители продължават да не ги виждат: политиката е само за персонала.
-- Колоните са изброени: служебните полета за проучването (source, verification_note и др.) не се отварят.

create policy institutions_staff_read on public.institutions
  for select to authenticated
  using ((select public.is_staff()));

grant select (id, name, email, phone, note, real_send, active, kind, verification_status)
  on public.institutions to authenticated;