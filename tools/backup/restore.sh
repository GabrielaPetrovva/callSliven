#!/usr/bin/env bash
# restore.sh — възстановява шифрован архив от backup.sh в ПРАЗЕН Supabase проект (SEC-9).
# Не пуска върху работещата база: целта се подава изрично и се потвърждава с ръчно въведен текст.
#
# Нужно е:  psql (PostgreSQL 17), gpg, tar, sha256sum
# Променливи:
#   RESTORE_DB_URL      връзка към НОВИЯ, празен проект (Session pooler, порт 5432)
#   BACKUP_PASSPHRASE   паролата, с която е шифрован архивът
# Употреба:
#   tools/backup/restore.sh ~/callsliven-backups/callsliven-weekly-20261109-021700.tar.gz.gpg
#   tools/backup/restore.sh <архив> --check     # само разшифрова и проверява, без да пипа база
set -euo pipefail
umask 077

archive="${1:?Подай пътя до .tar.gz.gpg}"
mode="${2:-restore}"
: "${BACKUP_PASSPHRASE:?Липсва BACKUP_PASSPHRASE}"
[[ -f "$archive" ]] || { echo "Няма такъв файл: $archive" >&2; exit 2; }

work="$(mktemp -d)"
cleanup() { rm -rf "$work"; }
trap cleanup EXIT

gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 3 \
    -d "$archive" 3<<<"$BACKUP_PASSPHRASE" | tar -C "$work" -xzf -
dir="$(find "$work" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
(cd "$dir" && sha256sum --quiet -c SHA256SUMS)
echo "Архивът е цял:"
sed 's/^/  /' "$dir/README.txt"

if [[ "$mode" == "--check" ]]; then
  echo "Проверката мина. База не е пипана."
  exit 0
fi

: "${RESTORE_DB_URL:?Липсва RESTORE_DB_URL (новият, празен проект)}"
command -v psql >/dev/null || { echo "Липсва psql" >&2; exit 2; }
host="$(sed -E 's#^[a-z]+://[^@]*@([^/:?]+).*#\1#' <<<"$RESTORE_DB_URL")"
echo
echo "ЩЕ ВЪЗСТАНОВЯ В: $host"
echo "Базата трябва да е нов, празен проект. В работеща база ще има конфликти и данни ще се смесят."
read -r -p "Напиши ВЪЗСТАНОВИ, за да продължиш: " answer
[[ "$answer" == "ВЪЗСТАНОВИ" ]] || { echo "Отказано."; exit 1; }

# Ред от документацията на Supabase: роли, схема, данни (без тригери), после историята на миграциите
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file "$dir/roles.sql" \
  --file "$dir/schema.sql" \
  --command 'SET session_replication_role = replica' \
  --file "$dir/data.sql" \
  --dbname "$RESTORE_DB_URL"
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file "$dir/history_schema.sql" \
  --file "$dir/history_data.sql" \
  --dbname "$RESTORE_DB_URL"

echo "Базата е възстановена. Остават ръчно: снимките в Storage, Edge Functions и тайните им,"
echo "Vault (project_url, cron_secret), настройките на Auth (SMTP, шаблони, Site URL)."
