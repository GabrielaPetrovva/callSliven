/* CallSliven — Help page: how to report, statuses, what can be reported (categories and subcategories from the
   database), what is public, FAQ. The rules in the texts are the ones in MVP.md; the categories are read live from
   the `categories` and `subcategories` tables (public read, only active ones). */
(() => {
  const { $, $$ } = CS;

  CS.addStrings({
    bg: {
      docTitle:'Помощ', hEyebrow:'Помощ', hTitle:'Как работи <em>CallSliven</em>',
      hLead:'Подаваш сигнал за проблем в община Сливен, администратор го изпраща до отговорната институция, а ти и всички останали следите как се решава.',
      tocHow:'Как се подава', tocStatus:'Статуси', tocWhat:'Какво мога да подам', tocPrivacy:'Лични данни', tocFaq:'Въпроси',
      howT:'Как се подава <em>сигнал</em>',
      s1T:'Влез в профила си', s1X:'Трябва ти профил с потвърден имейл. Регистрацията отнема минута, а разглеждането на сигналите е свободно.',
      s2T:'Избери категория', s2X:'Категорията и подкатегорията определят коя институция ще получи сигнала.',
      s3T:'Отбележи мястото', s3X:'Напиши адрес, премести маркера или ползвай GPS. Мястото трябва да е в община Сливен.',
      s4T:'Опиши и изпрати', s4X:'Заглавие (5–100 знака), описание (20–2000) и до 3 снимки. Преди изпращане ще видиш дали наблизо няма същия сигнал.',
      afterT:'Какво става после',
      afterX:'Администратор на общината преглежда сигнала и го изпраща до отговорната институция. Всяка промяна в статуса се вижда на страницата на сигнала и в „Моите сигнали“. Ако сигналът бъде отхвърлен, получаваш имейл с причината.',
      ctaSubmit:'Подай сигнал', ctaReports:'Разгледай сигналите',
      stT:'Статуси на <em>сигнала</em>',
      st_new:'Сигналът е приет и чака администратор да го изпрати до отговорната институция.',
      st_sent:'Изпратен е до институцията.',
      st_in_progress:'Институцията работи по проблема.',
      st_resolved:'Проблемът е решен.',
      st_closed:'Сигналът е приключен без решение, например институцията не е компетентна или не отговаря. Кратката причина се вижда в хронологията.',
      stNote:'Отхвърлените и оттеглените сигнали не са публични. Виждаш ги само ти, в „Моите сигнали“.',
      whatT:'Какво мога да <em>подам</em>', whatX:'Категориите и подкатегориите са същите като във формата за сигнал.',
      tagPhoto:'нужна е снимка', tagPhotoX:'Тук трябва да добавиш поне една снимка.',
      tagHidden:'мястото се показва по-общо', tagHiddenX:'Публично се показва само улицата или кварталът, без точната точка.',
      catsErr:'Категориите не се заредиха. Опитай пак по-късно.',
      urgentT:'Спешно?', urgentX:'Пожар, авария, паднал кабел или опасност за живота — звънни на <a href="tel:112">112</a>. CallSliven не заменя спешните служби.',
      privT:'Какво се вижда <em>публично</em>',
      pubT:'Вижда се публично', pub1:'Заглавие и описание, без лични данни (телефони, имейли, ЕГН, номера на коли се махат)', pub2:'Категория, дата и статус', pub3:'Приблизително място и адрес без номер', pub4:'Хронологията на сигнала',
      privHT:'Не се публикува', priv1:'Твоите име, имейл и телефон', priv2:'Снимките (вижда ги само общината и институцията)', priv3:'Точното място (получава го само институцията)', priv4:'Причини за отхвърляне, вътрешни бележки и приоритет',
      faqT:'Често задавани <em>въпроси</em>',
      q1:'Трябва ли ми профил?', a1:'За да подадеш сигнал — да, с потвърден имейл. Сигналите и картата се разглеждат и без профил.',
      q2:'Кой вижда името и телефона ми?', a2:'Публично — никой. Името ти виждат администраторите на общината. Имейлът и телефонът се показват само на Super Admin, след като запише причина. Институцията получава сигнала без твоите данни.',
      q3:'Защо сигналът ми не се вижда на картата?', a3:'Някои сигнали се проверяват от администратор, преди да станат публични, например ако в текста има линк или лични данни. Дотогава го виждаш само ти, в „Моите сигнали“.',
      q4:'Мога ли да оттегля сигнал?', a4:'Да, от „Моите сигнали“, докато администратор не е направил нищо по него.',
      q5:'Какво става, ако сигналът е отхвърлен?', a5:'Получаваш имейл с причината. Тя се вижда и в „Моите сигнали“. Отхвърлените сигнали не се публикуват.',
      q6:'Защо мястото на картата е приблизително?', a6:'За да не може да се разбере кой е подал сигнала. Точното място получава само институцията.',
      q7:'Колко сигнала мога да подам?', a7:'Нов профил — до 3 през първите 24 часа. След това до 5 на час и до 20 на ден. Лимитите пазят от злоупотреби.',
      q8:'Мога ли да пратя официално писмо, жалба или заявление по ЗДОИ?', a8:'Не през CallSliven. Те се подават направо в Община Сливен — виж <a href="letters.html">„Писма, жалби, ЗДОИ“</a>.',
      contactT:'Не намери отговор?', contactX:'Пиши ни на <a href="mailto:contact@callsliven.bg">contact@callsliven.bg</a>.'
    },
    en: {
      docTitle:'Help', hEyebrow:'Help', hTitle:'How <em>CallSliven</em> works',
      hLead:'You report a problem in Sliven Municipality, an administrator sends it to the responsible institution, and you and everyone else can follow how it gets fixed.',
      tocHow:'How to report', tocStatus:'Statuses', tocWhat:'What I can report', tocPrivacy:'Personal data', tocFaq:'Questions',
      howT:'How to send a <em>report</em>',
      s1T:'Log in', s1X:'You need a profile with a confirmed email. Signing up takes a minute, and browsing reports is open to everyone.',
      s2T:'Choose a category', s2X:'The category and subcategory decide which institution receives the report.',
      s3T:'Mark the place', s3X:'Type an address, move the marker or use GPS. The place must be in Sliven Municipality.',
      s4T:'Describe and send', s4X:'A title (5–100 characters), a description (20–2000) and up to 3 photos. Before sending you see if the same report already exists nearby.',
      afterT:'What happens next',
      afterX:'A municipal administrator reviews the report and sends it to the responsible institution. Every status change is shown on the report page and in My reports. If the report is rejected, you get an email with the reason.',
      ctaSubmit:'Submit a report', ctaReports:'Browse reports',
      stT:'Report <em>statuses</em>',
      st_new:'The report is received and waits for an administrator to send it to the responsible institution.',
      st_sent:'It has been sent to the institution.',
      st_in_progress:'The institution is working on the problem.',
      st_resolved:'The problem is solved.',
      st_closed:'The report is closed without a fix, for example the institution is not responsible or does not answer. The short reason is shown in the timeline.',
      stNote:'Rejected and withdrawn reports are not public. Only you see them, in My reports.',
      whatT:'What I can <em>report</em>', whatX:'The categories and subcategories are the same as in the report form.',
      tagPhoto:'photo needed', tagPhotoX:'You must add at least one photo here.',
      tagHidden:'place shown roughly', tagHiddenX:'Only the street or area is shown publicly, not the exact point.',
      catsErr:"The categories didn't load. Try again later.",
      urgentT:'Emergency?', urgentX:'Fire, an accident, a fallen cable or danger to life — call <a href="tel:112">112</a>. CallSliven does not replace emergency services.',
      privT:'What is <em>public</em>',
      pubT:'Shown publicly', pub1:'Title and description without personal data (phones, emails, ID and number plates are removed)', pub2:'Category, date and status', pub3:'Approximate place and an address without a number', pub4:'The report timeline',
      privHT:'Never published', priv1:'Your name, email and phone', priv2:'The photos (only the municipality and the institution see them)', priv3:'The exact place (only the institution gets it)', priv4:'Rejection reasons, internal notes and priority',
      faqT:'Frequently asked <em>questions</em>',
      q1:'Do I need a profile?', a1:'To send a report — yes, with a confirmed email. Reports and the map are open to everyone.',
      q2:'Who sees my name and phone?', a2:'Publicly — no one. Municipal administrators see your name. Email and phone are shown only to a Super Admin after they write down a reason. The institution gets the report without your details.',
      q3:"Why can't I see my report on the map?", a3:'Some reports are checked by an administrator before they become public, for example when the text has a link or personal data. Until then only you see it, in My reports.',
      q4:'Can I withdraw a report?', a4:'Yes, from My reports, as long as no administrator has acted on it yet.',
      q5:'What if my report is rejected?', a5:'You get an email with the reason. It is also shown in My reports. Rejected reports are not published.',
      q6:'Why is the place on the map approximate?', a6:'So that nobody can tell who sent the report. Only the institution gets the exact place.',
      q7:'How many reports can I send?', a7:'A new profile — up to 3 in the first 24 hours. After that up to 5 an hour and 20 a day. The limits prevent abuse.',
      q8:'Can I send an official letter, complaint or a request for public information?', a8:'Not through CallSliven. They go straight to Sliven Municipality — see <a href="letters.html">Letters, complaints, FOI</a>.',
      contactT:"Didn't find an answer?", contactX:'Write to us at <a href="mailto:contact@callsliven.bg">contact@callsliven.bg</a>.'
    }
  });

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  /* ═════════ Statuses (only the public ones, PUB-5) ═════════ */
  function renderStatuses() {
    const ul = $('#st-list'); ul.innerHTML = '';
    PUB.STATUSES.forEach((s, i) => {
      const li = el('li', 'st-row');
      li.style.setProperty('--c', PUB.COLORS[s]);
      const n = el('span', 'st-n', String(i + 1));
      li.append(n, PUB.pill(s), el('p', null, CS.t('st_' + s)));
      ul.append(li);
    });
  }

  /* ═════════ Categories from the database ═════════ */
  let cats = null, subs = null;
  async function loadCategories() {
    try {
      const sb = await CS.client();
      const [c, s] = await Promise.all([
        sb.from('categories').select('id, name, sort_order').order('sort_order').order('name'),
        sb.from('subcategories').select('id, category_id, name, requires_photo, hide_exact_address, sort_order').order('sort_order').order('name')
      ]);
      if (c.error || s.error) throw c.error || s.error;
      cats = c.data || []; subs = s.data || [];
    } catch (e) {
      console.warn('[CallSliven] help categories:', e);
      cats = null;
    }
    renderCategories();
  }
  function renderCategories() {
    const grid = $('#cats');
    $('#cats-loading').hidden = true;
    grid.innerHTML = '';
    $('#cats-err').hidden = !!cats;
    if (!cats) return;
    cats.forEach(c => {
      const card = el('article', 'cat-card');
      const head = el('header', 'cat-head');
      const ico = el('span', 'cat-ico'); ico.innerHTML = PUB.icon(c.name);
      head.append(ico, el('h3', null, c.name));
      const ul = el('ul', 'cat-subs');
      subs.filter(s => s.category_id === c.id).forEach(s => {
        const li = el('li', null, s.name);
        if (s.requires_photo) { const t = el('span', 'tag photo', CS.t('tagPhoto')); t.title = CS.t('tagPhotoX'); li.append(t); }
        if (s.hide_exact_address) { const t = el('span', 'tag hidden-place', CS.t('tagHidden')); t.title = CS.t('tagHiddenX'); li.append(t); }
        ul.append(li);
      });
      const a = el('a', 'cat-link'); a.href = 'reports.html?cat=' + c.id;
      a.setAttribute('aria-label', CS.t('ctaReports') + ': ' + c.name);
      a.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
      head.append(a);
      card.append(head, ul);
      grid.append(card);
    });
    CS.initReveal(grid);
  }

  /* ═════════ FAQ: one open at a time (same as the home page) ═════════ */
  $$('.faq-item').forEach(item => {
    const q = $('.faq-question', item);
    q.addEventListener('click', () => {
      const open = !item.classList.contains('open');
      $$('.faq-item').forEach(o => { o.classList.remove('open'); $('.faq-question', o).setAttribute('aria-expanded', 'false'); });
      if (open) { item.classList.add('open'); q.setAttribute('aria-expanded', 'true'); }
    });
  });

  document.addEventListener('cs:lang', () => {
    document.title = CS.t('docTitle') + ' · CallSliven';
    renderStatuses();
    if ($('#cats-loading').hidden) renderCategories();      // only once the categories have loaded (or failed)
  });
  CS.start();
  loadCategories();
})();
