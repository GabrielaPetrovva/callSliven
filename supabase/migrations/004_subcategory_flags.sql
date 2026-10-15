-- 004_subcategory_flags.sql
-- Подкатегории, които изискват снимка и/или скриват точния адрес публично

update public.subcategories
set requires_photo = true
where name in (
  'Нерегламентирано сметище',
  'Незаконно строителство или гараж',
  'Неправилно паркиране, синя зона',
  'Нехуманно отношение към животни'
);

update public.subcategories
set hide_exact_address = true
where name in (
  'Незаконно строителство или гараж',
  'Нехуманно отношение към животни',
  'Нарушаване на обществения ред',
  'Безопасност на храните',
  'Хигиена, заразни болести, тютюнопушене',
  'Дезинсекция, дератизация'
);

-- Защита: ако име не съвпадне, редът се пропуска тихо, затова броим
do $$
begin
  if (select count(*) from public.subcategories where requires_photo) <> 4 then
    raise exception 'Очаквани 4 подкатегории със снимка';
  end if;
  if (select count(*) from public.subcategories where hide_exact_address) <> 6 then
    raise exception 'Очаквани 6 подкатегории със скрит адрес';
  end if;
end $$;