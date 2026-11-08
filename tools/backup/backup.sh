#!/usr/bin/env bash
# backup.sh — шифрован експорт на базата (SEC-9).
# Прави три файла с Supabase CLI (роли, схема, данни) и историята на миграциите, пакетира ги
# и ги шифрова с парола (GPG, AES-256). Нешифрованите файлове се трият веднага.
#
# Нужно е:  Supabase CLI (той ползва Docker за pg_dump), gpg, tar, sha256sum
# Променливи:
#   SUPABASE_DB_URL     връзка към базата (Dashboard → Connect → Session pooler, порт 5432)
#   BACKUP_PASSPHRASE   паролата за шифроване (поне 16 знака; без нея архивът не може да се отвори)
#   BACKUP_DIR          къде да се запише архивът (по подразбиране ~/callsliven-backups, извън хранилището)
# Употреба:
#   tools/backup/backup.sh                 # седмичен експорт
#   tools/backup/backup.sh pre-030         # преди миграция: етикетът влиза в името на файла
set -euo pipefail
umask 077

label="${1:-weekly}"
if [[ ! "$label" =~ ^[a-z0-9-]{1,40}$ ]]; then
  echo "Етикетът може да е само с малки латински букви, цифри и тире (напр. pre-030)." >&2
  exit 2
fi
: "${SUPABASE_DB_URL:?Липсва SUPABASE_DB_URL}"
: "${BACKUP_PASSPHRASE:?Липсва BACKUP_PASSPHRASE}"
if (( ${#BACKUP_PASSPHRASE} < 16 )); then
  echo "BACKUP_PASSPHRASE трябва да е поне 16 знака." >&2
  exit 2
fi
for cmd in supabase gpg tar sha256sum; do
  command -v "$cmd" >/dev/null || { echo "Липсва програмата: $cmd" >&2; exit 2; }
done

out_dir="${BACKUP_DIR:-$HOME/callsliven-backups}"
mkdir -p "$out_dir"
stamp="$(date -u +%Y%m%d-%H%M%S)"
name="callsliven-${label}-${stamp}"

work="$(mktemp -d)"
cleanup() { rm -rf "$work"; }
trap cleanup EXIT

dump() { # $1 = файл, останалото = допълнителни флагове
  local file="$1"; shift
  echo "→ $file"
  supabase db dump --db-url "$SUPABASE_DB_URL" -f "$work/$name/$file" "$@"
  [[ -s "$work/$name/$file" ]] || { echo "Празен файл: $file" >&2; exit 1; }
}

mkdir -p "$work/$name"
dump roles.sql --role-only
dump schema.sql
dump data.sql --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
dump history_schema.sql --schema supabase_migrations
dump history_data.sql --use-copy --data-only --schema supabase_migrations

# Проверка, че в данните наистина има редове (а не само схема)
grep -q '^COPY ' "$work/$name/data.sql" || { echo "data.sql е без данни (няма COPY)" >&2; exit 1; }

{
  echo "CallSliven: експорт на базата"
  echo "етикет: $label"
  echo "час (UTC): $stamp"
  echo "Снимките в Storage (bucket report-photos) не са в този архив."
  echo "Възстановяване: tools/backup/restore.sh <архив>"
} > "$work/$name/README.txt"
(cd "$work/$name" && sha256sum ./*.sql > SHA256SUMS)

tar -C "$work" -czf "$work/$name.tar.gz" "$name"
gpg --batch --yes --pinentry-mode loopback --passphrase-fd 3 \
    --symmetric --cipher-algo AES256 \
    -o "$out_dir/$name.tar.gz.gpg" "$work/$name.tar.gz" 3<<<"$BACKUP_PASSPHRASE"

# Проверка, че архивът се отваря със същата парола
gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 3 \
    -d "$out_dir/$name.tar.gz.gpg" 3<<<"$BACKUP_PASSPHRASE" | tar -tzf - >/dev/null

size="$(du -h "$out_dir/$name.tar.gz.gpg" | cut -f1)"
echo "Готово: $out_dir/$name.tar.gz.gpg ($size)"
echo "ARCHIVE=$out_dir/$name.tar.gz.gpg"
