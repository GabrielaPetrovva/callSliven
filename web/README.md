# CallSliven — сайт (frontend)

Чист HTML, CSS и JavaScript, без фреймуърк и без пакетиране. Всяка страница работи с истински данни от Supabase
(проектът `callsliven-dev`). В `web/` няма примерни или тестови данни.

Сайтът се отваря през локален сървър (напр. VS Code Live Server), не с двоен клик върху файла:
сървърите на картата, Turnstile и Supabase не приемат заявки от `file://` страници.

## Страници

| Файл | Какво е | Достъп | Данни |
|---|---|---|---|
| `index.html` | Начална страница | всички | `search_public_reports` (4 най-нови), `categories` за чиповете |
| `auth.html` | Вход, регистрация с код, забравена парола, втори фактор (`#login`, `#register`, `#forgot`) | всички | Supabase Auth |
| `reports.html` | Всички сигнали: търсене, категория, период, сортиране + карта. Филтрите са в адреса, напр. `reports.html?cat=3&period=30` | всички | `search_public_reports`, `public_map_points` |
| `report.html` | Един сигнал: `report.html?number=12` | всички | `get_public_report` |
| `submit.html` | Подаване на сигнал на 4 стъпки | влязъл | `categories`, `subcategories`, `find_nearby_reports`, Storage `report-photos`, Edge Function `submit-report` |
| `my-reports.html` | Моите сигнали, оттегляне | влязъл | `report_private`, `reports`, `report_events` (през RLS), `withdraw_report` |
| `profile.html` | Име, фамилия, телефон | влязъл | `profiles` |
| `mfa-setup.html` | Настройка на втори фактор (TOTP) | администратори | Supabase Auth MFA |
| `admin.html` | Админ панел: броячи „Изискват внимание“, списък с филтри, детайл на сигнал (`admin.html#n=12`) и действия: одобри, отхвърли, статус, класификация, дубликат, ограничи подателя. Изпращането към институция идва в част 3 | администратори с втори фактор | `admin_attention_counts`, `reports` + `report_admin` + `report_private`, `report_events`, `report_photos` (подписани линкове), `report_dispatches`, `institutions` (миграция 021), `staff_get_submitter_name`; действия: `admin_approve_suspicious`, `admin_reject_report`, `admin_change_status`, `admin_set_classification`, `admin_link_duplicate`, `admin_restrict_user` |
| `privacy.html`, `terms.html` | Политика за поверителност и условия (**чернови**) | всички | — |

Страница, която изисква вход, сама праща посетителя към `auth.html?next=<страницата>#login` и го връща обратно след входа.

**Още ги няма** (линковете към тях дават 404): `letters.html`, `help.html`.

## Файлове

```
css/
  fonts.css      Rubik (самохостнат, fonts/)
  base.css       общо: цветове, бутони, навигация, футър, статуси, падащи менюта, менюто на профила
  home.css       начална страница
  auth.css       вход и регистрация (и основата на mfa-setup, privacy, terms)
  pages.css      общи елементи на страниците без основна навигация (mfa-setup, privacy, terms)
  legal.css      privacy и terms
  profile.css    полета, карти, съобщения (profile, submit, my-reports)
  submit.css     формата за сигнал
  my-reports.css моите сигнали
  reports.css    списък и карта
  report.css     един сигнал
  admin.css      админ панел
js/
  config.js      настройки — единственият файл, който се редактира (виж по-долу)
  sb.js          единственият Supabase клиент за сайта (window.SB)
  common.js      общо: език BG/EN, навигация, менюто на профила, кой е влязъл, падащо меню, плочки на картата (window.CS)
  public-data.js статуси, цветове и иконки за публичните страници (window.PUB)
  otp.js         полето за 6-цифрен код (auth, mfa-setup)
  legal.js       privacy и terms (бутон „нагоре“)
  home.js, auth.js, reports.js, report.js, submit.js, my-reports.js, profile.js, mfa-setup.js, admin.js — по един за страница
vendor/          самохостнати библиотеки с фиксирани версии: Leaflet 1.9.4, supabase-js 2.118.0
assets/          снимки: gerb.png, slide-1..3.jpg, why-bg.jpg, auth.jpg
fonts/           Rubik (latin, cyrillic; 400–700)
```

Страниците с основната навигация не зареждат supabase-js сами: `common.js` го зарежда, когато потрябва
(запазена сесия или страница, която чете от базата).

## Настройки (`js/config.js`)

Всичко в този файл е **публично по замисъл** — браузърът има нужда от него. Тайните ключове
(`service_role`, Turnstile secret, Resend) са само в Supabase и никога не са тук.

| Ключ | Какво е |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Project Settings → API. Сега `callsliven-dev`; при пускане — production проектът |
| `TURNSTILE_SITE_KEY` | Публичният ключ на Turnstile; тайният е в Supabase → Authentication → Attack Protection |
| `MAPTILER_KEY`, `MAPTILER_STYLE` | Плочки на картата. Празен ключ = CARTO без ключ. Преди пускане ограничи ключа до домейна в MapTiler |
| `POLICY_VERSION` | Версия на политиката, записва се при регистрация. Вдигни я, когато `privacy.html` се промени |

Картата: MapTiler (ако има ключ) → CARTO → OpenStreetMap. Ако един доставчик не отговаря, автоматично се пробва следващият.

## Правила в кода

- Текст от базата или от потребителя се слага с `textContent`, никога като HTML (SEC-5).
- Без inline скриптове и `onerror` атрибути, за да може CSP да ги забрани (SEC-3).
- Проверките в браузъра са само за удобство. Истинските правила са в базата (RLS) и в Edge Functions.
- Снимките на сигналите никога не се показват публично, а мястото е приблизително.