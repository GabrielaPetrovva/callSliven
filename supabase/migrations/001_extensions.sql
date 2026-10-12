-- Географски данни: граница на общината, дубликати в радиус, закръгляне на място
create extension if not exists postgis with schema extensions;

-- Търсене по триграми в публичния списък
create extension if not exists pg_trgm with schema extensions;

-- Планирани задачи (изтриване на неподтвърдени акаунти, срокове, чистене)
create extension if not exists pg_cron with schema pg_catalog;