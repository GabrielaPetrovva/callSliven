/* CallSliven — "Letters, complaints, FOI": where official requests go. CallSliven itself takes only reports about
   problems on the spot; letters, complaints, proposals and requests under the Access to Public Information Act (ЗДОИ)
   go straight to Sliven Municipality. This page only explains the channels; nothing is sent or saved here.
   The contacts were taken from mun.sliven.bg on 29.10.2026 (pages "Достъп до обществена информация" and
   "Център за административно обслужване") and from migration 005. Check them again before going live. */
(() => {
  CS.addStrings({
    bg: {
      docTitle:'Писма, жалби, ЗДОИ', lEyebrow:'Писма, жалби, ЗДОИ', lTitle:'Официални искания до <em>общината</em>',
      lLead:'CallSliven е за сигнали за проблеми на място. Писма, жалби, предложения и заявления за достъп до обществена информация се подават направо в Община Сливен. Ето къде и как.',
      r1T:'Проблем на място', r1X:'Дупка, изгоряла лампа, нерегламентирано сметище, паднало дърво, теч на вода…', r1A:'Подай сигнал',
      r2T:'Писмо, жалба или предложение', r2X:'До кмета или общинската администрация, по Административнопроцесуалния кодекс (АПК).', r2A:'Как се подава',
      r3T:'Обществена информация', r3X:'Документи и данни на общината по Закона за достъп до обществена информация (ЗДОИ).', r3A:'Как се иска',
      notHere:'CallSliven не приема писма, жалби и заявления по ЗДОИ и не ги препраща към общината.',
      letT:'Писма, жалби и <em>предложения</em>',
      letX:'Подават се до кмета на Община Сливен на хартия, по имейл или чрез електронните услуги на общината. Посочи име и адрес за отговор: анонимни предложения и сигнали не се разглеждат (АПК).',
      cWhere:'На място', cWhereV:'Център за административно обслужване (ЦАО), бул. „Цар Освободител“ 1, партер',
      cHours:'Работно време', cHoursV:'8:00 – 17:00, без почивка',
      cPhone:'Жалби, сигнали, предложения и ЗДОИ', cMail:'Имейл за сигнали', cDuty:'Денонощен дежурен на общината',
      cOnline:'Електронно', cOnlineV:'Електронни услуги на общината (Egov.bg, Акстър)',
      letDue:'Срок за отговор', letDueV:'до 2 месеца (АПК)',
      zT:'Достъп до обществена <em>информация</em>',
      zX:'Всеки може да поиска информация, която общината създава или пази, без да обяснява за какво му трябва.',
      zHowT:'Как се подава', z1:'<b>Онлайн</b> — с формуляра на сайта на общината.', z2:'<b>На място</b> — в ЦАО, бул. „Цар Освободител“ 1, партер, 8:00 – 17:00.', z3:'<b>Писмено или устно</b> — заявлението съдържа име, описание на исканата информация, предпочитана форма на достъп и адрес за връзка.',
      zForm:'Онлайн формуляр', zPage:'Страницата за ЗДОИ на общината',
      zDue:'Срок за отговор', zDueV:'14 дни (може да се удължи с до 10 дни)',
      zFee:'Цена', zFeeV:'Подаването е безплатно. Плащат се само разходите за предоставяне (напр. копия) по тарифата на министъра на финансите.',
      zPhone:'Справки',
      srcT:'Откъде са данните', srcX:'От сайта на Община Сливен, проверени на 29.10.2026. Преди да изпратиш нещо, провери там за промени.',
      srcCao:'Център за административно обслужване', srcZdoi:'Достъп до обществена информация',
      urgentT:'Спешно?', urgentX:'Пожар, авария или опасност за живота — звънни на <a href="tel:112">112</a>.'
    },
    en: {
      docTitle:'Letters, complaints, FOI', lEyebrow:'Letters, complaints, FOI', lTitle:'Official requests to the <em>municipality</em>',
      lLead:'CallSliven is for reports about problems on the spot. Letters, complaints, proposals and requests for public information go straight to Sliven Municipality. Here is where and how.',
      r1T:'A problem on the spot', r1X:'A pothole, a broken street light, an illegal dump, a fallen tree, a water leak…', r1A:'Submit a report',
      r2T:'A letter, complaint or proposal', r2X:'To the mayor or the municipal administration, under the Administrative Procedure Code (APC).', r2A:'How to send it',
      r3T:'Public information', r3X:'Documents and data of the municipality under the Access to Public Information Act (ЗДОИ).', r3A:'How to ask',
      notHere:'CallSliven does not accept letters, complaints or FOI requests and does not forward them to the municipality.',
      letT:'Letters, complaints and <em>proposals</em>',
      letX:'They go to the Mayor of Sliven Municipality on paper, by email or through the municipality’s electronic services. Give your name and an address for the answer: anonymous proposals and signals are not considered (APC).',
      cWhere:'In person', cWhereV:'Administrative Services Centre (ЦАО), 1 Tsar Osvoboditel Blvd., ground floor',
      cHours:'Opening hours', cHoursV:'8:00 – 17:00, no lunch break',
      cPhone:'Complaints, signals, proposals and FOI', cMail:'Email for signals', cDuty:'Municipal duty officer (24/7)',
      cOnline:'Online', cOnlineV:'The municipality’s electronic services (Egov.bg, Акстър)',
      letDue:'Answer within', letDueV:'up to 2 months (APC)',
      zT:'Access to public <em>information</em>',
      zX:'Anyone can ask for information the municipality creates or keeps, without explaining why they need it.',
      zHowT:'How to ask', z1:'<b>Online</b> — with the form on the municipality’s website.', z2:'<b>In person</b> — at the ЦАО, 1 Tsar Osvoboditel Blvd., ground floor, 8:00 – 17:00.', z3:'<b>In writing or orally</b> — the request has your name, what information you want, the preferred form of access and an address for contact.',
      zForm:'Online form', zPage:'The municipality’s FOI page',
      zDue:'Answer within', zDueV:'14 days (can be extended by up to 10 days)',
      zFee:'Cost', zFeeV:'Asking is free. Only the cost of providing it (e.g. copies) is paid, at the rates set by the Minister of Finance.',
      zPhone:'Enquiries',
      srcT:'Where this comes from', srcX:'From the Sliven Municipality website, checked on 29.10.2026. Check there for changes before you send anything.',
      srcCao:'Administrative Services Centre', srcZdoi:'Access to public information',
      urgentT:'Emergency?', urgentX:'Fire, an accident or danger to life — call <a href="tel:112">112</a>.'
    }
  });

  document.addEventListener('cs:lang', () => { document.title = CS.t('docTitle') + ' · CallSliven'; });
  CS.start();
})();
