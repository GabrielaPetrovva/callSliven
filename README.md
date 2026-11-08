# CallSliven

Платформа за граждански сигнали за Община Сливен (дипломен проект). Гражданинът подава сигнал с място и снимки,
администраторът го преглежда и го изпраща към отговорната институция, а всеки следи статуса на публична карта.

Как работи системата и докъде е стигнала работата: [`docs/PROJECT.md`](docs/PROJECT.md).
Сайтът и страниците му: [`web/README.md`](web/README.md).

## Структура

```
web/                     сайтът: HTML, CSS, JS без фреймуърк (виж web/README.md)
firebase.json            Firebase Hosting: публикува web/ със CSP и защитните заглавки
supabase/
  migrations/            001–029: схема, RLS, функции, планирани задачи (пускат се по ред)
  functions/
    submit-report/       подаване на сигнал: Turnstile, лимити, снимки без EXIF, адрес, пречистване на текста
    send-emails/         опашките с писма към институции и граждани (pg_cron всяка минута)
    resend-webhook/      статус на доставката от Resend (подписът се проверява)
    maintenance/         нощна поддръжка: стари временни снимки, снимки на обезличени сигнали, проверка на базата
  tests/                 SQL тестове за правата и функциите (пускат се в SQL Editor)
  config.toml            настройки за локален Supabase
tools/
  dev-submit.html        ръчен тест на submit-report
  backup/                шифрован експорт и възстановяване на базата (SEC-9)
.github/workflows/
  backup.yml             седмичен шифрован експорт и ръчен експорт преди миграция
docs/PROJECT.md          описание, решения и списък с напредъка
```

## Технологии

Supabase (Postgres 17 с PostGIS, pg_trgm, pg_cron, pgcrypto; Auth; Storage; Edge Functions на Deno),
Cloudflare Turnstile, Resend, Geoapify, Leaflet с MapTiler / CARTO / OpenStreetMap, Firebase Hosting.

## Локално

Сайтът: `firebase emulators:start --only hosting` → `http://localhost:5500` (със същите заглавки като на живо).
Подробности в `web/README.md`.

Тестове на Edge Functions (Deno 2):

```
cd supabase/functions
deno test
```

## База данни

Миграциите се пускат по номер в SQL Editor на проекта. Всяка проверява сама себе си: при грешно име или брой
спира с ясно съобщение и нищо не се записва. **Преди миграция в production** се прави експорт (виж „Резервни копия“).

SQL тестовете в `supabase/tests/` създават тестови данни, проверяват и накрая връщат всичко назад. Затова завършват
с нарочно „ERROR“, в който е резултатът, напр. „33 от 33 са наред“.

| Файл | Проверява |
|---|---|
| `access_tests.sql` | кой какво може да чете и вика (посетител, граждани A и B, администратор, Super Admin) |
| `super_admin_tests.sql` | търсене на акаунти, журнал, спиране на изпращанията |
| `consent_tests.sql` | повторно съгласие с политиката |
| `account_tests.sql` | смяна на имейл и изтриване на профил (026) |
| `retention_tests.sql` | рег. номер в писмото, хеш на IP, обезличаване и снимки (029) |

## Edge Functions

```
npx supabase functions deploy submit-report
npx supabase functions deploy send-emails --no-verify-jwt
npx supabase functions deploy resend-webhook --no-verify-jwt
npx supabase functions deploy maintenance --no-verify-jwt
```

`send-emails` и `maintenance` се викат от pg_cron с `CRON_SECRET`, а `resend-webhook` от Resend с подпис, затова са без
проверка на потребителски токен. `send-emails` ползва филтъра от `submit-report/lib.ts`, затова се публикува с CLI,
а не от редактора в Dashboard. Тайните (Resend, Turnstile, Geoapify, `CRON_SECRET`, `ALLOWED_ORIGINS`) са само в
Supabase → Edge Functions → Secrets; `SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY` Supabase подава сам.
pg_cron чете адреса на проекта и `cron_secret` от Vault.

## Резервни копия (SEC-9)

`tools/backup/backup.sh` прави с Supabase CLI три файла (роли, схема, данни) плюс историята на миграциите,
пакетира ги и ги шифрова с парола (GPG, AES-256). Нешифрованите файлове не остават никъде.
Снимките в Storage не са в архива.

**Автоматично:** `.github/workflows/backup.yml` всяка неделя в 02:17 UTC. Архивът е в Actions → съответното
изпълнение → Artifacts и се пази 90 дни. Нужни са две тайни в GitHub (Settings → Secrets and variables → Actions):

- `SUPABASE_DB_URL` — Dashboard → Connect → **Session pooler** (порт 5432). Директната връзка е само по IPv6 и от GitHub не работи.
- `BACKUP_PASSPHRASE` — поне 16 знака. Пази я и извън GitHub: без нея архивът не може да се отвори.

**Преди миграция в production:** Actions → Backup → Run workflow с етикет, напр. `pre-030`. Миграцията се пуска чак
след като изпълнението е зелено. Локално същото е `tools/backup/backup.sh pre-030` (трябват Supabase CLI и Docker).

**Проверка и възстановяване:**

```
BACKUP_PASSPHRASE=… tools/backup/restore.sh callsliven-weekly-….tar.gz.gpg --check
RESTORE_DB_URL=… BACKUP_PASSPHRASE=… tools/backup/restore.sh callsliven-weekly-….tar.gz.gpg
```

`--check` само разшифрова архива и сверява контролните суми. Истинското възстановяване е само в **нов, празен** проект
и иска да се напише „ВЪЗСТАНОВИ“. След него ръчно остават снимките, Edge Functions с тайните им, Vault и настройките на Auth.

## Лиценз

Виж [`LICENSE`](LICENSE).
