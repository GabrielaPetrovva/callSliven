/* CallSliven — single report page: report.html?id=1075 */
(() => {
  const { $ } = CS;
  const D = window.CSDATA;

  CS.addStrings({
    en: {
      reportN:n => `Report #${n}`, submittedOn:'Submitted', updated:'Last change', district:'District',
      progress:'Progress', description:'Description', history:'Status history', details:'Details',
      category:'Category', subcategory:'Problem', priority:'Priority', institution:'Responsible', copyTo:'copy to',
      location:'Location', locNote:'The area is shown approximately to protect the reporter’s privacy.',
      photoNote:'Photos added by the reporter are seen only by the responsible institution.',
      share:'Share', copyLink:'Copy link', copied:'Link copied', nearby:'Nearby and similar',
      h0t:'Report submitted', h0:'Submitted by a citizen through CallSliven.',
      h1t:'Sent to the institution', h1:i => `Forwarded to ${i}.`,
      h2t:'In progress', h2:i => `${i} is working on the problem.`,
      h3t:'Resolved', h3:'The institution reported that the problem is fixed.',
      nfTitle:"We couldn't find this report", nfText:'The link may be wrong or the report may have been removed.', nfBtn:'See all reports',
      mapFail:'The map could not load.'
    },
    bg: {
      reportN:n => `Сигнал №${n}`, submittedOn:'Подаден', updated:'Последна промяна', district:'Квартал',
      progress:'Напредък', description:'Описание', history:'История на статуса', details:'Подробности',
      category:'Категория', subcategory:'Проблем', priority:'Приоритет', institution:'Отговаря', copyTo:'копие до',
      location:'Местоположение', locNote:'Районът е показан приблизително, за да се пази поверителността на подателя.',
      photoNote:'Снимките, добавени от подателя, вижда само отговорната институция.',
      share:'Сподели', copyLink:'Копирай линка', copied:'Линкът е копиран', nearby:'Наблизо и подобни',
      h0t:'Сигналът е подаден', h0:'Подаден от гражданин чрез CallSliven.',
      h1t:'Изпратен към институцията', h1:i => `Насочен към ${i}.`,
      h2t:'В обработка', h2:i => `${i} работи по проблема.`,
      h3t:'Решен', h3:'Институцията съобщи, че проблемът е отстранен.',
      nfTitle:'Не намерихме този сигнал', nfText:'Връзката може да е грешна или сигналът да е премахнат.', nfBtn:'Виж всички сигнали',
      mapFail:'Картата не можа да се зареди.'
    }
  });

  const id = +new URLSearchParams(location.search).get('id');
  const r = D.REPORTS.find(x => x.id === id);

  const SVG = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const STEP_ICONS = [
    '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M12 18v-6M9 15h6"/>',
    '<path d="M21 3 10 14"/><path d="M21 3 14.5 21l-4.5-7-7-4.5z"/>',
    '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    '<path d="m5 12 4 4 10-10"/>'
  ];
  const PIN = '<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>';
  const CAL = '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>';

  let mini = null;

  function render() {
    if (!r) {
      $('#report').innerHTML = '';
      $('#not-found').hidden = false;
      $('#crumb-id').textContent = '';
      document.title = CS.t('nfTitle') + ' · CallSliven';
      return;
    }
    const sub = D.sub(r), cat = D.category(r.cat), dist = D.district(r.district);
    const inst = CS.l(sub.inst);
    const last = r.history[r.history.length - 1].at;
    document.title = CS.l(r.title) + ' · CallSliven';
    $('#crumb-id').textContent = CS.t('reportN')(r.id);

    // nearby: same district or category, closest first
    const dist2 = x => (x.at[0] - r.at[0]) ** 2 + (x.at[1] - r.at[1]) ** 2;
    const near = D.REPORTS.filter(x => x.id !== r.id && (x.district === r.district || x.cat === r.cat))
      .sort((a, b) => dist2(a) - dist2(b)).slice(0, 3);

    $('#report').innerHTML = `
      <header class="r-head">
        <span class="big-ico">${D.icon(r.cat)}</span>
        <div>
          <div class="r-kicker"><span class="r-cat">${CS.t(cat.key)}</span>${CS.statusPill(r.status).replace('class="status ', 'class="status lg ')}</div>
          <h1>${CS.esc(CS.l(r.title))}</h1>
          <div class="r-facts">
            <span>${SVG(PIN)}${CS.l(dist.name)}</span>
            <span>${SVG(CAL)}${CS.t('submittedOn')} ${CS.date(r.created)}</span>
            <span>#${r.id}</span>
          </div>
        </div>
      </header>

      <div class="r-grid">
        <div class="r-main">
          <section class="card" aria-labelledby="h-progress">
            <h2 id="h-progress">${CS.t('progress')}</h2>
            <ol class="tracker">
              <li class="fill" id="fill" aria-hidden="true"></li>
              ${CS.STATUS_KEYS.map((k, i) => {
                const h = r.history.find(x => x.status === i);
                const cls = i <= r.status ? 'done' : '';
                return `<li class="t-step ${cls}${i === r.status && r.status < 3 ? ' current' : ''}">
                  <span class="t-dot">${SVG(STEP_ICONS[i])}</span>
                  <span class="t-label">${CS.t(k)}</span>
                  <span class="t-date">${h ? CS.dateShort(h.at) : ''}</span>
                </li>`;
              }).join('')}
            </ol>
          </section>

          <section class="card" aria-labelledby="h-desc">
            <h2 id="h-desc">${CS.t('description')}</h2>
            <p class="desc">${CS.esc(CS.l(r.desc))}</p>
            <p class="photo-note">${SVG('<rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>')}${CS.t('photoNote')}</p>
          </section>

          <section class="card" aria-labelledby="h-hist">
            <h2 id="h-hist">${CS.t('history')}</h2>
            <ol class="history">
              ${r.history.slice().reverse().map(h => {
                const text = typeof CS.t('h' + h.status) === 'function' ? CS.t('h' + h.status)(inst) : CS.t('h' + h.status);
                return `<li class="h-item"><span class="h-dot">${SVG(STEP_ICONS[h.status])}</span>
                  <div><div class="h-title">${CS.t('h' + h.status + 't')}</div><div class="h-text">${CS.esc(text)}</div><div class="h-date">${CS.date(h.at)}</div></div></li>`;
              }).join('')}
            </ol>
          </section>
        </div>

        <aside class="r-side">
          <section class="card" aria-labelledby="h-details">
            <h2 id="h-details">${CS.t('details')}</h2>
            <dl class="facts">
              <div><dt>${CS.t('category')}</dt><dd>${CS.t(cat.key)}</dd></div>
              <div><dt>${CS.t('subcategory')}</dt><dd>${CS.esc(CS.l(sub.name))}</dd></div>
              <div><dt>${CS.t('priority')}</dt><dd><span class="prio p${sub.p}"><i></i>${CS.t(D.PRIORITY_KEYS[sub.p])}</span></dd></div>
              <div><dt>${CS.t('institution')}</dt><dd>${CS.esc(inst)}${sub.copy ? `<span class="copy">${CS.t('copyTo')} ${CS.esc(CS.l(sub.copy))}</span>` : ''}</dd></div>
              <div><dt>${CS.t('district')}</dt><dd>${CS.l(dist.name)}</dd></div>
              <div><dt>${CS.t('updated')}</dt><dd>${CS.date(last)}</dd></div>
            </dl>
          </section>

          <section class="card" aria-labelledby="h-loc">
            <h2 id="h-loc">${CS.t('location')}</h2>
            <div class="mini-map"><div id="rmap"></div></div>
            <p class="map-caption">${CS.t('locNote')}</p>
          </section>

          <section class="card" aria-labelledby="h-share">
            <h2 id="h-share">${CS.t('share')}</h2>
            <div class="share">
              <button type="button" class="btn btn-soft" id="copy">${SVG('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>')}<span>${CS.t('copyLink')}</span></button>
              <button type="button" class="btn btn-accent" id="share">${SVG('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>')}<span>${CS.t('share')}</span></button>
            </div>
          </section>

          ${near.length ? `<section class="card" aria-labelledby="h-near">
            <h2 id="h-near">${CS.t('nearby')}</h2>
            <ul class="near">${near.map(x => `<li><a href="report.html?id=${x.id}"><span class="n-ico">${D.icon(x.cat)}</span>
              <span><span class="n-title">${CS.esc(CS.l(x.title))}</span><br><span class="n-meta">${CS.l(D.district(x.district).name)} · ${CS.t(CS.STATUS_KEYS[x.status])}</span></span></a></li>`).join('')}</ul>
          </section>` : ''}
        </aside>
      </div>`;

    // animate the progress line to the current step
    requestAnimationFrame(() => requestAnimationFrame(() => { $('#fill').style.width = (r.status / 3 * 75) + '%'; }));

    initMiniMap();
    $('#copy').addEventListener('click', copyLink);
    $('#share').addEventListener('click', () => {
      if (navigator.share) navigator.share({ title: CS.l(r.title), url: location.href }).catch(() => {});
      else copyLink();
    });
  }

  function initMiniMap() {
    const el = $('#rmap');
    if (!window.L) { el.innerHTML = `<p class="map-fallback">${CS.t('mapFail')}</p>`; return; }
    if (mini) { mini.remove(); mini = null; }
    mini = L.map(el, { scrollWheelZoom: false, zoomControl: true, attributionControl: true }).setView(r.at, 16);
    CS.tiles(mini);
    // an area, not an exact pin: the location is approximate on purpose
    L.circle(r.at, { radius: 110, color: '#1F7A3A', weight: 2, fillColor: '#3FAE5F', fillOpacity: .22 }).addTo(mini);
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.remove('show'), 2200);
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(location.href); }
    catch (e) {
      const ta = Object.assign(document.createElement('textarea'), { value: location.href });
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    toast(CS.t('copied'));
  }

  // back link keeps the filters if the visitor came from the reports list
  try {
    const ref = new URL(document.referrer);
    if (ref.pathname.endsWith('/reports.html') && ref.origin === location.origin) $('#back-link').href = 'reports.html' + ref.search;
  } catch (e) {}

  document.addEventListener('cs:lang', render);
  CS.start();
})();
