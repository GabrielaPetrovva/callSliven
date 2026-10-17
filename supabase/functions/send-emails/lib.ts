// lib.ts — шаблони на писмата и малки помощни функции. Без мрежа и без база.

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Сравнение на тайни за константно време (против отгатване по времето на отговора).
export function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  const n = Math.max(ea.length, eb.length);
  for (let i = 0; i < n; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

export interface Mail {
  subject: string;
  text: string;
  html: string;
}

const STYLE = "font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a;max-width:640px";

function wrap(bodyHtml: string): string {
  return `<div style="${STYLE}">${bodyHtml}<hr style="border:none;border-top:1px solid #ddd;margin:24px 0 8px"><p style="color:#666;font-size:12px">Това писмо е изпратено автоматично от CallSliven.</p></div>`;
}

const REPORT_PATH = "/report.html?number="; // ще се нагласи, когато сайтът е готов

export interface DispatchPayload {
  out_number: number;
  out_title: string;
  out_description: string;
  out_category: string;
  out_subcategory: string;
  out_address: string | null;
  out_lat: number;
  out_lng: number;
  out_institution: string;
  out_to_email: string | null;
  out_is_demo: boolean;
  out_role: string;
  out_attempt: number;
  out_created_at: string;
}

export const PHOTO_LINK_DAYS = 7;

export function dispatchMail(p: DispatchPayload, siteUrl?: string, photoUrls: string[] = [], photosUnavailable = false): Mail {
  const n = p.out_number;
  const prefix = (p.out_is_demo ? "[ДЕМО] " : "") + (p.out_attempt > 1 ? "Повторно: " : "");
  const subject = `${prefix}Сигнал №${n} от гражданин: ${p.out_title}`.slice(0, 200);
  const osm = `https://www.openstreetmap.org/?mlat=${p.out_lat}&mlon=${p.out_lng}#map=18/${p.out_lat}/${p.out_lng}`;
  const link = siteUrl ? `${siteUrl.replace(/\/$/, "")}${REPORT_PATH}${n}` : null;
  const when = new Date(p.out_created_at).toLocaleString("bg-BG", { timeZone: "Europe/Sofia" });

  const lines: string[] = [];
  if (p.out_is_demo) {
    lines.push(`ДЕМО РЕЖИМ: това е тестово писмо. При реално изпращане получател щеше да бъде: ${p.out_institution}.`, "");
  }
  lines.push(
    `До: ${p.out_institution}`,
    p.out_role === "cc" ? "(копие за информация)" : "",
    p.out_attempt > 1 ? `Това е повторно изпращане (опит ${p.out_attempt}).` : "",
    "",
    `Сигнал №${n}, подаден на ${when}`,
    `Категория: ${p.out_category} / ${p.out_subcategory}`,
    `Заглавие: ${p.out_title}`,
    "",
    p.out_description,
    "",
    `Адрес: ${p.out_address ?? "не е определен автоматично"}`,
    `Координати: ${p.out_lat.toFixed(6)}, ${p.out_lng.toFixed(6)}`,
    `Карта: ${osm}`,
  );
  if (link) lines.push(`Публична страница на сигнала: ${link}`);
  if (photoUrls.length > 0) {
    lines.push("", `Снимки (линковете важат ${PHOTO_LINK_DAYS} дни):`, ...photoUrls.map((u, i) => `${i + 1}. ${u}`));
  } else if (photosUnavailable) {
    lines.push("", "Към сигнала има снимки, но линковете към тях не можаха да бъдат създадени. Моля, поискайте ги от администратора.");
  }
  const text = lines.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");

  const html = wrap(
    (p.out_is_demo
      ? `<p style="background:#fff3cd;padding:8px 12px;border-radius:6px"><strong>ДЕМО РЕЖИМ:</strong> това е тестово писмо. При реално изпращане получател щеше да бъде: ${esc(p.out_institution)}.</p>`
      : "") +
      `<p>До: <strong>${esc(p.out_institution)}</strong>${p.out_role === "cc" ? " <em>(копие за информация)</em>" : ""}</p>` +
      (p.out_attempt > 1 ? `<p><em>Повторно изпращане (опит ${p.out_attempt}).</em></p>` : "") +
      `<h2 style="font-size:18px;margin:16px 0 4px">Сигнал №${n}: ${esc(p.out_title)}</h2>` +
      `<p style="color:#555;margin:0">Подаден на ${esc(when)} · ${esc(p.out_category)} / ${esc(p.out_subcategory)}</p>` +
      `<p style="white-space:pre-wrap">${esc(p.out_description)}</p>` +
      `<p><strong>Адрес:</strong> ${esc(p.out_address ?? "не е определен автоматично")}<br>` +
      `<strong>Координати:</strong> ${p.out_lat.toFixed(6)}, ${p.out_lng.toFixed(6)}<br>` +
      `<a href="${esc(osm)}">Покажи на картата</a>` +
      (link ? `<br><a href="${esc(link)}">Публична страница на сигнала</a>` : "") + `</p>` +
      (photoUrls.length > 0
        ? `<p><strong>Снимки</strong> (линковете важат ${PHOTO_LINK_DAYS} дни):<br>` +
          photoUrls.map((u, i) => `<a href="${esc(u)}">Снимка ${i + 1}</a>`).join("<br>") + `</p>`
        : photosUnavailable
        ? `<p><em>Към сигнала има снимки, но линковете към тях не можаха да бъдат създадени. Моля, поискайте ги от администратора.</em></p>`
        : ""),
  );
  return { subject, text, html };
}

export interface OutboxPayload {
  out_kind: string;
  out_to_email: string;
  out_first_name: string | null;
  out_report_number: number | null;
  out_reject_reason: string | null;
  out_reject_note: string | null;
  out_data: Record<string, unknown> | null;
  out_created_at: string;
}

const REASONS: Record<string, string> = {
  insufficient_info: "в сигнала няма достатъчно информация, за да бъде обработен",
  out_of_scope: "въпросът е извън компетенциите на общината и институциите, към които изпращаме сигнали",
  inappropriate: "съдържанието на сигнала не отговаря на правилата на платформата",
  spam: "сигналът е разпознат като нежелано или повторно съобщение",
};

export function outboxMail(p: OutboxPayload): Mail | null {
  const name = p.out_first_name ? esc(p.out_first_name) : "";
  const hello = p.out_first_name ? `Здравейте, ${p.out_first_name},` : "Здравейте,";
  const helloHtml = name ? `Здравейте, ${name},` : "Здравейте,";

  if (p.out_kind === "report_rejected" && p.out_report_number != null) {
    const reason = REASONS[p.out_reject_reason ?? ""] ?? "сигналът не може да бъде приет";
    const note = p.out_reject_note?.trim();
    const subject = `Сигнал №${p.out_report_number} не е приет`;
    const text = [
      hello,
      `Вашият сигнал №${p.out_report_number} не беше приет, защото ${reason}.`,
      note ? `Бележка от администратора: ${note}` : null,
      "Можете да подадете нов сигнал с повече подробности по всяко време.",
    ].filter((x): x is string => x !== null).join("\n\n");
    const html = wrap(
      `<p>${helloHtml}</p><p>Вашият сигнал <strong>№${p.out_report_number}</strong> не беше приет, защото ${esc(reason)}.</p>` +
        (note ? `<p><strong>Бележка от администратора:</strong> ${esc(note)}</p>` : "") +
        `<p>Можете да подадете нов сигнал с повече подробности по всяко време.</p>`,
    );
    return { subject, text, html };
  }

  if (p.out_kind === "security_notice") {
    const action = String(p.out_data?.action ?? "");
    let line: string;
    if (action === "user.role_changed") line = "Ролята или статусът на вашия акаунт в CallSliven беше променен. Ако не очаквате това, свържете се със Super Admin.";
    else if (action === "contact.accessed") line = "Super Admin прегледа контактните данни на потребител. Подробностите са в одитния журнал.";
    else return null;
    const subject = "Известие за сигурност от CallSliven";
    return { subject, text: `${hello}\n\n${line}`, html: wrap(`<p>${helloHtml}</p><p>${esc(line)}</p>`) };
  }
  return null;
}
