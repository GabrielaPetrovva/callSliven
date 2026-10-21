/* CallSliven — reports page: filters (category, status, district, period, search),
   list of reports and Leaflet map. Filters are kept in the URL so a filtered view can be shared,
   e.g. reports.html?cat=roads&status=progress&period=30 */
(() => {
  const { $, $$ } = CS;
  const D = window.CSDATA;

  CS.addStrings({
    en: {
      pageTitle:'Reports <em>in Sliven</em>',
      countLine:(n, total) => n === total ? `<b>${total}</b> reports from citizens` : `Showing <b>${n}</b> of ${total} reports`,
      searchLabel:'Search reports', searchPh:'Search by street, problem or number',
      fDistrict:'District', allDistricts:'All districts', fSort:'Sort', sortNew:'Newest first', sortOld:'Oldest first', sortPrio:'Highest priority',
      p7:'7 days', p30:'30 days', pAll:'All', fStatus:'Status', fCategory:'Category', allStatuses:'All statuses', allCats:'All categories',
      nStatuses:n => `${n} statuses`, nCats:n => `${n} categories`,
      clear:'Clear filters', activeN:n => `${n} active ${n === 1 ? 'filter' : 'filters'}`,
      emptyTitle:'No reports match these filters', emptyText:'Try another category or period, or clear the filters.',
      approx:'Locations are shown approximately.', priority:'priority', open:'Open report', showMap:'Map', showList:'List',
      mapFail:'The map could not load. Check your internet connection.'
    },
    bg: {
      pageTitle:'Сигнали <em>в Сливен</em>',
      countLine:(n, total) => n === total ? `<b>${total}</b> сигнала от граждани` : `Показани <b>${n}</b> от ${total} сигнала`,
      searchLabel:'Търсене на сигнали', searchPh:'Търси по улица, проблем или номер',
      fDistrict:'Квартал', allDistricts:'Всички квартали', fSort:'Подреждане', sortNew:'Най-нови', sortOld:'Най-стари', sortPrio:'Най-висок приоритет',
      p7:'7 дни', p30:'30 дни', pAll:'Всички', fStatus:'Статус', fCategory:'Категория', allStatuses:'Всички статуси', allCats:'Всички категории',
      nStatuses:n => `${n} статуса`, nCats:n => `${n} категории`,
      clear:'Изчисти филтрите', activeN:n => `${n} ${n === 1 ? 'активен филтър' : 'активни филтъра'}`,
      emptyTitle:'Няма сигнали по тези филтри', emptyText:'Опитай друга категория или период, или изчисти филтрите.',
      approx:'Местата са показани приблизително.', priority:'приоритет', open:'Отвори сигнала', showMap:'Карта', showList:'Списък',
      mapFail:'Картата не можа да се зареди. Провери интернет връзката.'
    }
  });

  const STATUS_IDS = ['new', 'sent', 'progress', 'resolved'];
  const PIN_COLORS = ['#6B7A70', '#A26A35', '#C99A06', '#1F7A3A'];
  const state = { q: '', cats: new Set(), statuses: new Set(), district: '', period: 'all', sort: 'new' };

  /* ═════════ URL ⇄ state ═════════ */
  function readUrl() {
    const p = new URLSearchParams(location.search);
    state.q = p.get('q') || '';
    state.cats = new Set((p.get('cat') || '').split(',').filter(c => D.category(c)));
    state.statuses = new Set((p.get('status') || '').split(',').map(s => STATUS_IDS.indexOf(s)).filter(i => i >= 0));
    state.district = D.district(p.get('district')) ? p.get('district') : '';
    state.period = ['7', '30'].includes(p.get('period')) ? p.get('period') : 'all';
    state.sort = ['old', 'prio'].includes(p.get('sort')) ? p.get('sort') : 'new';
  }
  function writeUrl() {
    const p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.cats.size) p.set('cat', [...state.cats].join(','));
    if (state.statuses.size) p.set('status', [...state.statuses].map(i => STATUS_IDS[i]).join(','));
    if (state.district) p.set('district', state.district);
    if (state.period !== 'all') p.set('period', state.period);
    if (state.sort !== 'new') p.set('sort', state.sort);
    const qs = p.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
  }

  /* ═════════ Filtering ═════════ */
  const norm = s => s.toLocaleLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  function haystack(r) {
    const sub = D.sub(r);
    return norm([r.title.bg, r.title.en, r.desc.bg, r.desc.en, sub.name.bg, sub.name.en,
      D.district(r.district).name.bg, D.district(r.district).name.en, '#' + r.id, String(r.id)].join(' '));
  }
  function matches(r, skip) {
    if (skip !== 'q' && state.q && !haystack(r).includes(norm(state.q.trim()))) return false;
    if (skip !== 'cat' && state.cats.size && !state.cats.has(r.cat)) return false;
    if (skip !== 'status' && state.statuses.size && !state.statuses.has(r.status)) return false;
    if (state.district && r.district !== state.district) return false;
    if (state.period !== 'all' && r.days > +state.period) return false;
    return true;
  }
  function filtered() {
    const out = D.REPORTS.filter(r => matches(r));
    if (state.sort === 'old') out.sort((a, b) => a.created - b.created);
    else if (state.sort === 'prio') out.sort((a, b) => D.sub(b).p - D.sub(a).p || b.created - a.created);
    else out.sort((a, b) => b.created - a.created);
    return out;
  }

  const matchesExceptDistrict = r => { const d = state.district; state.district = ''; const ok = matches(r); state.district = d; return ok; };
  const pinIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>';
  const sortIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/></svg>';
  const ddDistrict = CS.dropdown($('#dd-district'), { icon: pinIcon, label: () => CS.t('fDistrict'), value: '', isActive: v => !!v,
    onChange: v => { state.district = v; update(); } });
  const catIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>';
  const statusIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>';
  const ddCat = CS.dropdown($('#dd-cat'), { icon: catIcon, label: () => CS.t('fCategory'), multi: true, value: [], isActive: v => v.length > 0,
    many: n => CS.t('nCats')(n), onChange: v => { state.cats = new Set(v); update(); } });
  const ddStatus = CS.dropdown($('#dd-status'), { icon: statusIcon, label: () => CS.t('fStatus'), multi: true, value: [], isActive: v => v.length > 0,
    many: n => CS.t('nStatuses')(n), onChange: v => { state.statuses = new Set(v.map(Number)); update(); } });
  const ddSort = CS.dropdown($('#dd-sort'), { icon: sortIcon, label: () => CS.t('fSort'), value: 'new',
    onChange: v => { state.sort = v; update(false); } });

  /* ═════════ Filter controls ═════════ */
  function renderControls() {
    // district and sort dropdowns (counts per district respect the other filters)
    ddDistrict.update([{ value: '', label: CS.t('allDistricts'), meta: D.REPORTS.filter(r => matchesExceptDistrict(r)).length },
      ...D.DISTRICTS.map(d => ({ value: d.id, label: CS.l(d.name), meta: D.REPORTS.filter(r => r.district === d.id && matchesExceptDistrict(r)).length }))], state.district);
    ddSort.update([['new', 'sortNew'], ['old', 'sortOld'], ['prio', 'sortPrio']].map(([v, k]) => ({ value: v, label: CS.t(k) })), state.sort);
    // category and status dropdowns with counts (each count ignores its own filter)
    ddCat.update([{ value: '', label: CS.t('allCats'), meta: D.REPORTS.filter(r => matches(r, 'cat')).length },
      ...D.CATEGORIES.map(c => ({ value: c.id, label: CS.t(c.key), icon: `<span class="dd-ico">${D.icon(c.id)}</span>`,
        meta: D.REPORTS.filter(r => r.cat === c.id && matches(r, 'cat')).length }))], [...state.cats]);
    ddStatus.update([{ value: '', label: CS.t('allStatuses'), meta: D.REPORTS.filter(r => matches(r, 'status')).length },
      ...CS.STATUS_KEYS.map((k, i) => ({ value: String(i), label: CS.t(k), icon: `<span class="dd-dot" style="--c:${PIN_COLORS[i]}"></span>`,
        meta: D.REPORTS.filter(r => r.status === i && matches(r, 'status')).length }))], [...state.statuses].map(String));
    // map legend (status colours)
    $('#legend').innerHTML = CS.STATUS_KEYS.map((k, i) => `<span><i style="--c:${PIN_COLORS[i]}"></i>${CS.t(k)}</span>`).join('');
    // period
    $$('#period button').forEach(b => b.classList.toggle('active', b.dataset.period === state.period));
    movePill();
    // active filters summary
    const active = (state.q ? 1 : 0) + state.cats.size + state.statuses.size + (state.district ? 1 : 0) + (state.period !== 'all' ? 1 : 0);
    $('#active-bar').hidden = !active;
    $('#active-text').textContent = active ? CS.t('activeN')(active) : '';
  }

  // sliding pill in the period control
  const seg = $('#period');
  const pill = Object.assign(document.createElement('span'), { className: 'seg-pill' });
  seg.prepend(pill);
  function movePill() {
    const b = $('button.active', seg);
    if (!b) return;
    pill.style.width = b.offsetWidth + 'px';
    pill.style.transform = `translateX(${b.offsetLeft - 4}px)`;
    pill.style.left = '4px';
  }

  /* ═════════ List ═════════ */
  function renderList(items) {
    $('#count-line').innerHTML = CS.t('countLine')(items.length, D.REPORTS.length);
    $('#empty').hidden = items.length > 0;
    $('#list').innerHTML = items.map((r, i) => {
      const sub = D.sub(r);
      return `<li class="rcard" data-id="${r.id}" style="--i:${Math.min(i, 10)}">
        <span class="r-ico">${D.icon(r.cat)}</span>
        <h2><a href="report.html?id=${r.id}">${CS.esc(CS.l(r.title))}</a></h2>
        ${CS.statusPill(r.status)}
        <span class="r-sub">${CS.t(D.category(r.cat).key)} · ${CS.esc(CS.l(sub.name))}</span>
        <div class="r-meta">
          <span class="m"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>${CS.l(D.district(r.district).name)}</span>
          <span class="m"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>${CS.ago(r.days)}</span>
          <span class="prio p${sub.p}"><i></i>${CS.t(D.PRIORITY_KEYS[sub.p])} ${CS.t('priority')}</span>
          <span class="r-id">#${r.id}</span>
        </div>
      </li>`;
    }).join('');
  }

  /* ═════════ Map ═════════ */
  let map = null, layer = null;
  const markers = new Map();
  function initMap() {
    if (!window.L) { $('#map').innerHTML = `<p class="map-fallback">${CS.t('mapFail')}</p>`; return; }
    map = L.map('map', { zoomControl: true, scrollWheelZoom: true, attributionControl: true }).setView([42.6822, 26.3228], 14);
    CS.tiles(map);   // provider chosen in js/config.js
    layer = L.featureGroup().addTo(map);
  }
  function renderMap(items, fit) {
    if (!map) return;
    layer.clearLayers(); markers.clear();
    items.forEach(r => {
      const icon = L.divIcon({ className: 'pin-wrap', html: `<span class="pin s${r.status}">${D.icon(r.cat)}</span>`, iconSize: [38, 38], iconAnchor: [19, 46], popupAnchor: [0, -44] });
      const m = L.marker(r.at, { icon, keyboard: true, title: CS.l(r.title), riseOnHover: true });
      m.bindPopup(`<span class="pop-cat">${CS.t(D.category(r.cat).key)}</span>
        <span class="pop-title">${CS.esc(CS.l(r.title))}</span>
        <span class="pop-foot">${CS.statusPill(r.status)}<a class="pop-link" href="report.html?id=${r.id}">${CS.t('open')} →</a></span>`);
      m.on('mouseover', () => highlight(r.id, true, false));
      m.on('mouseout', () => highlight(r.id, false, false));
      m.on('popupopen', () => highlight(r.id, true, true));
      m.addTo(layer); markers.set(r.id, m);
    });
    if (fit && items.length) map.flyToBounds(layer.getBounds().pad(0.25), { maxZoom: 16, duration: 0.8 });
  }
  function highlight(id, on, scrollList) {
    const card = $(`.rcard[data-id="${id}"]`);
    card && card.classList.toggle('hl', on);
    const m = markers.get(id);
    if (m && m.getElement()) { m.getElement().classList.toggle('hl', on); $('.pin', m.getElement()).classList.toggle('hl', on); }
    if (on && scrollList && card && innerWidth > 860) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ═════════ Update everything ═════════ */
  function update(fit = true) {
    const items = filtered();
    renderControls();
    renderList(items);
    renderMap(items, fit);
    writeUrl();
  }

  /* ═════════ Events ═════════ */
  let qTimer;
  $('#q').addEventListener('input', e => { clearTimeout(qTimer); qTimer = setTimeout(() => { state.q = e.target.value; update(); }, 220); });
  $('#search-form').addEventListener('submit', e => { e.preventDefault(); state.q = $('#q').value; update(); });
  $('#period').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { state.period = b.dataset.period; update(); } });
  const clearAll = () => {
    Object.assign(state, { q: '', cats: new Set(), statuses: new Set(), district: '', period: 'all' });
    $('#q').value = ''; update();
  };
  $('#clear').addEventListener('click', clearAll);
  $('#clear2').addEventListener('click', clearAll);

  // list ⇄ map hover
  $('#list').addEventListener('mouseover', e => { const c = e.target.closest('.rcard'); if (c) highlight(+c.dataset.id, true, false); });
  $('#list').addEventListener('mouseout', e => { const c = e.target.closest('.rcard'); if (c && !c.contains(e.relatedTarget)) highlight(+c.dataset.id, false, false); });

  // mobile: list / map switch
  const toggle = $('#view-toggle');
  function renderToggle() {
    const showingMap = $('#results').classList.contains('show-map');
    toggle.setAttribute('aria-pressed', showingMap);
    $('#view-toggle-text').textContent = CS.t(showingMap ? 'showList' : 'showMap');
  }
  toggle.addEventListener('click', () => {
    $('#results').classList.toggle('show-map');
    renderToggle();
    if (map) setTimeout(() => { map.invalidateSize(); if (layer.getLayers().length) map.fitBounds(layer.getBounds().pad(0.25), { maxZoom: 16 }); }, 50);
    scrollTo({ top: $('#results').offsetTop - 160, behavior: 'smooth' });
  });

  // keep the map just below the sticky filter bar
  const filters = $('#filters');
  function placeMap() {
    const h = filters.offsetHeight + 64 + 12;
    document.documentElement.style.setProperty('--map-top', h + 'px');
    if (map) map.invalidateSize();
  }
  new ResizeObserver(placeMap).observe(filters);
  addEventListener('scroll', () => filters.classList.toggle('stuck', filters.getBoundingClientRect().top <= 64.5), { passive: true });

  document.addEventListener('cs:lang', () => { $('#q').value = state.q; update(false); renderToggle(); if (map) markers.forEach(m => m.closePopup()); });

  readUrl();
  $('#q').value = state.q;
  initMap();
  CS.start();          // applies language → triggers update via cs:lang
  placeMap();
  if (map && layer.getLayers().length) map.fitBounds(layer.getBounds().pad(0.25), { maxZoom: 16 });
})();