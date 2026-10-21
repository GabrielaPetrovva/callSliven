/* CallSliven — home page: hero slider, latest reports carousel, status demo, FAQ, parallax. */
(() => {
  const { $, $$, reduce } = CS;
  const D = window.CSDATA;

  CS.addStrings({
    en: {
      heroTitle:'Your city, <em>your voice</em>',
      heroLead:'Spotted a pothole, a fallen branch or an illegal dump? Report it and follow how it gets fixed.',
      searchLabel:'Search reports', searchPh:'Search reports by street or keyword', searchBtn:'Search',
      howEyebrow:'How it works', howTitle:'Four steps to <em>a better street</em>',
      howLead:"You don't need to know which institution is responsible. We take it from there.",
      s1t:'Register', s1d:'Create a profile and confirm your email.',
      s2t:'Submit a report', s2d:'Describe the problem, mark it on the map and add photos.',
      s3t:'We forward it', s3d:'An administrator reviews the report and sends it to the responsible institution.',
      s4t:'Track the status', s4d:'Every change is public until the problem is resolved.',
      whyEyebrow:'Why report', whyTitle:'One report <em>makes a difference</em>',
      whyLead:'It goes to the right people, and everyone can see what happens next.',
      b1t:'Reaches the right institution', b1d:"The Municipality, ViK, EVN, RIOSV and others. You don't need to know who is responsible.",
      b2t:'Transparent for everyone', b2d:'Reports and their status are public.',
      b3t:'Your personal data is protected', b3d:'Your name, email, phone and photos are not published, and the location is shown only approximately.',
      b4t:'No paperwork or queues', b4d:'Report from your phone, wherever you see the problem, at any time.',
      repEyebrow:'Latest reports', repTitle:"What's happening <em>in the city</em>", allReports:'See all reports',
      faqEyebrow:'FAQ', faqTitle:'Frequently asked <em>questions</em>',
      q1:'Do I need to register?', a1:'Yes. To submit a report you need a profile with a confirmed email. Browsing and searching reports is open to everyone.',
      q2:'Is my personal information visible to others?', a2:'No. Your name, email, phone and photos stay private. The location of the problem is shown only approximately.',
      q3:'How long does it take to resolve a report?', a3:"It depends on the problem and the responsible institution. You can follow every status change publicly until it's resolved.",
      q4:'What happens if my report is rejected?', a4:'You get a notification with the reason, so you can correct it or submit it again.',
      q5:'Which problems can I report?', a5:'Roads, utilities (lighting, electricity, water, gas, heating), environment, animals, construction, transport and public order, safety, and health and hygiene. If nothing fits, choose Other.',
      q6:'What should I do in an emergency?', a6:"Call 112. Gas leaks, fallen cables, fire and other immediate dangers can't be handled through the platform.",
      submitted:'Submitted'
    },
    bg: {
      heroTitle:'Твоят град, <em>твоят глас</em>',
      heroLead:'Видя дупка на пътя, паднал клон или нерегламентирано сметище? Подай сигнал и проследи как се решава.',
      searchLabel:'Търсене на сигнали', searchPh:'Търси сигнал по улица или ключова дума', searchBtn:'Търси',
      howEyebrow:'Как работи', howTitle:'Четири стъпки до <em>по-добра улица</em>',
      howLead:'Не е нужно да знаеш коя институция отговаря. Ние поемаме оттам.',
      s1t:'Регистрирай се', s1d:'Създай профил и потвърди имейла си.',
      s2t:'Подай сигнал', s2d:'Опиши проблема, отбележи го на картата и добави снимки.',
      s3t:'Насочваме го', s3d:'Администратор преглежда сигнала и го изпраща на отговорната институция.',
      s4t:'Следи статуса', s4d:'Всяка промяна е публична, докато проблемът бъде решен.',
      whyEyebrow:'Защо', whyTitle:'Един сигнал <em>променя нещо</em>',
      whyLead:'Стига до точните хора и всеки вижда какво се случва след това.',
      b1t:'Стига до точната институция', b1d:'Общината, ВиК, ЕВН, РИОСВ и други. Не е нужно да знаеш кой отговаря.',
      b2t:'Прозрачно за всички', b2d:'Сигналите и статусът им са публични.',
      b3t:'Личните ти данни са защитени', b3d:'Името, имейлът, телефонът и снимките не се публикуват, а мястото се показва приблизително.',
      b4t:'Без хартия и опашки', b4d:'Подаваш от телефона, където видиш проблема, по всяко време.',
      repEyebrow:'Последни сигнали', repTitle:'Какво се случва <em>в града</em>', allReports:'Виж всички сигнали',
      faqEyebrow:'Въпроси', faqTitle:'Често задавани <em>въпроси</em>',
      q1:'Трябва ли да се регистрирам?', a1:'Да. За да подадеш сигнал, ти трябва профил с потвърден имейл. Разглеждането и търсенето на сигнали е свободно за всички.',
      q2:'Виждат ли другите личните ми данни?', a2:'Не. Името, имейлът, телефонът и снимките ти остават скрити. Мястото на проблема се показва приблизително.',
      q3:'Колко време отнема решаването на сигнал?', a3:'Зависи от проблема и от отговорната институция. Можеш да следиш публично всяка промяна в статуса, докато бъде решен.',
      q4:'Какво става, ако сигналът ми бъде отхвърлен?', a4:'Получаваш известие с причината, за да можеш да го коригираш или да го подадеш отново.',
      q5:'Какви проблеми мога да подам?', a5:'Пътища, комунални услуги (осветление, ток, вода, газ, топлоснабдяване), околна среда, животни, строителство, транспорт и обществен ред, безопасност, здраве и хигиена. Ако нищо не пасва, избери „Друго“.',
      q6:'Какво да направя при спешен случай?', a6:'Звънни на 112. Изтичане на газ, паднали кабели, пожар и други непосредствени опасности не могат да се обработват през платформата.',
      submitted:'Подаден'
    }
  });

  /* ═════════ Latest reports carousel (4 newest) ═════════ */
  const latest = D.REPORTS.slice(0, 4);
  function renderReports() {
    $('#track').innerHTML = latest.map((r, i) => `
      <article class="report" role="group" aria-roledescription="slide" aria-label="${i + 1} / ${latest.length}">
        <a class="report-card" href="report.html?id=${r.id}">
          <span class="r-icon">${D.icon(r.cat)}</span>
          <div>
            <div class="r-meta">
              <span class="r-cat">${CS.t(D.category(r.cat).key)}</span>
              ${CS.statusPill(r.status)}
            </div>
            <h3>${CS.esc(CS.l(r.title))}</h3>
            <span class="r-where"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>${CS.l(D.district(r.district).name)} · ${CS.t('submitted')} ${CS.ago(r.days)}</span>
          </div>
          <div class="progress">${CS.STATUS_KEYS.map((k, j) => `<span class="${j <= r.status ? 'done' : ''}">${CS.t(k)}</span>`).join('')}</div>
        </a>
      </article>`).join('');
  }

  /* ═════════ Reusable slider (hero + reports) ═════════ */
  function makeSlider({ count, dotsEl, prev, next, show, interval, root, pauseOnHover = false }) {
    let cur = 0, timer = null, paused = false;
    dotsEl.style.setProperty('--dur', interval + 'ms');
    dotsEl.innerHTML = Array.from({ length: count }, (_, i) =>
      `<button aria-label="${i + 1} / ${count}"${i === 0 ? ' class="active" aria-current="true"' : ''}></button>`).join('');
    const dots = $$('button', dotsEl);
    function go(i) {
      cur = (i + count) % count;
      dots.forEach((d, j) => {
        d.classList.remove('active'); d.removeAttribute('aria-current');
        if (j === cur) { void d.offsetWidth; d.classList.add('active'); d.setAttribute('aria-current', 'true'); } // restart the fill
      });
      show(cur);
    }
    function restart() {
      clearInterval(timer);
      if (!paused) timer = setInterval(() => go(cur + 1), interval);
      const a = dots[cur]; a.classList.remove('active'); void a.offsetWidth; a.classList.add('active');
    }
    dots.forEach((d, j) => d.addEventListener('click', () => { go(j); restart(); }));
    prev && prev.addEventListener('click', () => { go(cur - 1); restart(); });
    next && next.addEventListener('click', () => { go(cur + 1); restart(); });
    if (pauseOnHover) {
      const pause = () => { paused = true; clearInterval(timer); dotsEl.classList.add('paused'); };
      const resume = () => { paused = false; dotsEl.classList.remove('paused'); restart(); };
      root.addEventListener('mouseenter', pause);
      root.addEventListener('mouseleave', resume);
      root.addEventListener('focusin', pause);
      root.addEventListener('focusout', e => { if (!root.contains(e.relatedTarget)) resume(); });
    }
    // pause while the tab is hidden
    document.addEventListener('visibilitychange', () => { if (document.hidden) clearInterval(timer); else restart(); });
    // swipe
    let x0 = null;
    root.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    root.addEventListener('touchend', e => {
      if (x0 === null) return;
      const diff = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(diff) > 50) { go(cur + (diff < 0 ? 1 : -1)); restart(); }
    });
    restart();
    return { get current() { return cur; } };
  }

  // hero photos: crossfade every 4.5 s
  const slides = $$('.slide');
  makeSlider({
    count: slides.length, dotsEl: $('#hero-dots'), interval: 4500, root: $('#top'),
    show: i => slides.forEach((s, j) => s.classList.toggle('active', j === i))
  });

  renderReports();
  makeSlider({
    count: latest.length, dotsEl: $('#rep-dots'), prev: $('#rep-prev'), next: $('#rep-next'),
    interval: 5000, root: $('#carousel'), pauseOnHover: true,
    show: i => { $('#track').style.transform = `translateX(-${i * 100}%)`; }
  });

  /* ═════════ Status pill in step 4: New → Sent → In progress → Resolved ═════════ */
  const status = $('#status');
  const sText = $('.s-text', status);
  const measure = Object.assign(document.createElement('span'), { className: 'measure' });
  document.body.appendChild(measure);
  const widthFor = label => { measure.textContent = label; return measure.offsetWidth + 13 * 2 + 7 + 8 + 2; };
  let si = 0, stTimer = null;
  function refreshStatus() {
    const label = CS.t(CS.STATUS_KEYS[si]);
    sText.textContent = label;
    status.style.width = widthFor(label) + 'px';
  }
  function nextStatus() {
    si = (si + 1) % 4;
    const label = CS.t(CS.STATUS_KEYS[si]);
    status.classList.add('swap');
    status.style.width = widthFor(label) + 'px';
    setTimeout(() => { status.className = 'status ' + CS.STATUS_CLASS[si]; sText.textContent = label; }, 260);
  }
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !stTimer) stTimer = setInterval(nextStatus, 1800);
    if (!e.isIntersecting && stTimer) { clearInterval(stTimer); stTimer = null; }
  }, { threshold: 0.6 }).observe(status);

  /* ═════════ Parallax on the "Why" photo + pause hero when off screen ═════════ */
  const whyBg = $('#why-bg');
  let ticking = false, whyNear = false;
  new IntersectionObserver(([e]) => { whyNear = e.isIntersecting; }, { rootMargin: '200px 0px' }).observe(whyBg.parentElement);
  new IntersectionObserver(([e]) => { $('#top').classList.toggle('off', !e.isIntersecting); }).observe($('#top'));
  addEventListener('scroll', () => {
    if (ticking || reduce || !whyNear) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const r = whyBg.parentElement.getBoundingClientRect();
      const t = Math.max(-1, Math.min(1, (r.top + r.height / 2 - innerHeight / 2) / innerHeight));
      whyBg.style.setProperty('--py', (t * 36).toFixed(1) + 'px');
    });
  }, { passive: true });

  /* ═════════ Category chips → reports page, pre-filtered ═════════ */
  $$('.chip').forEach(chip => chip.addEventListener('click', () => {
    chip.setAttribute('aria-pressed', 'true');
    setTimeout(() => { location.href = 'reports.html?cat=' + chip.dataset.cat; }, 180);
  }));

  /* ═════════ FAQ: one open at a time ═════════ */
  $$('.faq-item').forEach(item => {
    const q = $('.faq-question', item);
    q.addEventListener('click', () => {
      const open = !item.classList.contains('open');
      $$('.faq-item').forEach(o => { o.classList.remove('open'); $('.faq-question', o).setAttribute('aria-expanded', 'false'); });
      if (open) { item.classList.add('open'); q.setAttribute('aria-expanded', 'true'); }
    });
  });

  document.addEventListener('cs:lang', () => { renderReports(); refreshStatus(); });
  CS.start();
  document.fonts && document.fonts.ready.then(refreshStatus);
})();
