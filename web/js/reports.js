/* CallSliven — public reports: list + map (PUB-1…3). Only real data:
   list  → search_public_reports (search, category, period, sort; 20 per page, up to 50)
   map   → public_map_points (up to 500 newest points with the same filters)
   Filters stay in the URL, e.g. reports.html?cat=3&period=30&sort=updated&q=дупка */
(() => {
  const { $, $$ } = CS;
  const PAGE = 20;

  CS.addStrings({
    bg: {
      pageTitle:'Сигнали <em>в Сливен</em>',
      countLine:n => n === 1 ? '<b>1</b> публичен сигнал' : `<b>${n}</b> публични сигнала`,
      countFiltered:n => `Намерени: <b>${n}</b>`,
      searchLabel:'Търсене на сигнали', searchPh:'Търси по улица или проблем',
      fCategory:'Категория', allCats:'Всички категории', fSort:'Подреждане', sortNew:'Най-нови', sortOld:'Най-стари', sortUpd:'Последно променени',
      p7:'7 дни', p30:'30 дни', pAll:'Всички', clear:'Изчисти филтрите', activeN:n => `${n} ${n === 1 ? 'активен филтър' : 'активни филтъра'}`,
      more:'Покажи още', moreN:n => `+ още ${n} ${n === 1 ? 'сигнал' : 'сигнала'} за същото`, open:'Отвори сигнала',
      approx:'Местата са показани приблизително.', showMap:'Карта', showList:'Списък',
      noneT:'Още няма публични сигнали', noneX:'Когато граждани подадат сигнали и те минат проверка, ще ги видиш тук и на картата.',
      emptyT:'Няма сигнали по тези филтри', emptyX:'Опитай друга категория или период, или изчисти филтрите.',
      eLoad:'Сигналите не се заредиха. Провери интернета си и презареди страницата.', mapFail:'Картата не можа да се зареди.', docTitle:'Сигнали'
    },
    en: {
      pageTitle:'Reports <em>in Sliven</em>',
      countLine:n => n === 1 ? '<b>1</b> public report' : `<b>${n}</b> public reports`,
      countFiltered:n => `Found: <b>${n}</b>`,
      searchLabel:'Search reports', searchPh:'Search by street or problem',
      fCategory:'Category', allCats:'All categories', fSort:'Sort', sortNew:'Newest first', sortOld:'Oldest first', sortUpd:'Recently updated',
      p7:'7 days', p30:'30 days', pAll:'All', clear:'Clear filters', activeN:n => `${n} active ${n === 1 ? 'filter' : 'filters'}`,
      more:'Show more', moreN:n => `+ ${n} more ${n === 1 ? 'report' : 'reports'} about the same`, open:'Open report',
      approx:'Locations are shown approximately.', showMap:'Map', showList:'List',
      noneT:'No public reports yet', noneX:'When citizens submit reports and they pass review, you will see them here and on the map.',
      emptyT:'No reports match these filters', emptyX:'Try another category or period, or clear the filters.',
      eLoad:"Reports didn't load. Check your internet and reload the page.", mapFail:"The map couldn't load.", docTitle:'Reports'
    }
  });

  const state = { q:'', cat:'', period:'all', sort:'newest' };
  let sb = null, cats = [], items = [], total = 0, offset = 0, seq = 0;

  /* ═════════ URL ⇄ state ═════════ */
  function readUrl() {
    const p = new URLSearchParams(location.search);
    state.q = (p.get('q') || '').slice(0, 100);
    state.cat = /^\d+$/.test(p.get('cat') || '') ? p.get('cat') : '';
    state.period = ['7', '30'].includes(p.get('period')) ? p.get('period') : 'all';
    state.sort = ['oldest', 'updated'].includes(p.get('sort')) ? p.get('sort') : 'newest';
  }
  function writeUrl() {
    const p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.cat) p.set('cat', state.cat);
    if (state.period !== 'all') p.set('period', state.period);
    if (state.sort !== 'newest') p.set('sort', state.sort);
    const qs = p.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
  }
  const fromDate = () => {
    if (state.period === 'all') return null;
    const d = new Date(Date.now() - (+state.period) * 864e5);
    return d.toISOString().slice(0, 10);
  };
  const filters = () => ({ p_query:state.q.trim() || null, p_category_id:state.cat ? +state.cat : null, p_from:fromDate(), p_to:null });
  const activeCount = () => (state.q.trim() ? 1 : 0) + (state.cat ? 1 : 0) + (state.period !== 'all' ? 1 : 0);

  /* ═════════ Controls ═════════ */
  const catIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>';
  const sortIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/></svg>';
  const ddCat = CS.dropdown($('#dd-cat'), { icon:catIcon, label:() => CS.t('fCategory'), value:'', isActive:v => !!v,
    onChange:v => { state.cat = v; reload(); } });
  const ddSort = CS.dropdown($('#dd-sort'), { icon:sortIcon, label:() => CS.t('fSort'), value:'newest',
    onChange:v => { state.sort = v; reload(false); } });

  function renderControls() {
    ddCat.update([{ value:'', label:CS.t('allCats') },
      ...cats.map(c => ({ value:String(c.id), label:c.name, icon:`<span class="dd-ico">${PUB.icon(c.name)}</span>` }))], state.cat);
    ddSort.update([['newest', 'sortNew'], ['oldest', 'sortOld'], ['updated', 'sortUpd']].map(([v, k]) => ({ value:v, label:CS.t(k) })), state.sort);
    $$('#period button').forEach(b => b.classList.toggle('active', b.dataset.period === state.period));
    movePill();
    const n = activeCount();
    $('#active-bar').hidden = !n;
    $('#active-text').textContent = n ? CS.t('activeN')(n) : '';
    $('#legend').innerHTML = '';
    PUB.STATUSES.forEach(s => {
      const sp = document.createElement('span'), i = document.createElement('i');
      i.style.setProperty('--c', PUB.COLORS[s]); sp.append(i, CS.t('s_' + s)); $('#legend').append(sp);
    });
  }
  const seg = $('#period');
  const pill = Object.assign(document.createElement('span'), { className:'seg-pill' });
  seg.prepend(pill);
  function movePill() {
    const b = $('button.active', seg); if (!b) return;
    pill.style.width = b.offsetWidth + 'px';
    pill.style.transform = `translateX(${b.offsetLeft - 4}px)`;
    pill.style.left = '4px';
  }

  /* ═════════ List ═════════ */
  function card(r, i) {
    const li = document.createElement('li');
    li.className = 'rcard'; li.dataset.n = r.out_number; li.style.setProperty('--i', Math.min(i, 10));
    li.innerHTML = `<span class="r-ico">${PUB.icon(r.out_category)}</span><h2><a></a></h2><span class="r-sub"></span><div class="r-meta"></div>`;
    const a = $('h2 a', li); a.href = `report.html?number=${r.out_number}`; a.textContent = r.out_title;
    li.insertBefore(PUB.pill(r.out_status), $('.r-sub', li));
    $('.r-sub', li).textContent = [r.out_category, r.out_subcategory].filter(Boolean).join(' · ');
    const meta = $('.r-meta', li);
    const m = (svg, text) => { const s = document.createElement('span'); s.className = 'm'; s.innerHTML = svg; s.append(text); meta.append(s); };
    if (r.out_address) m('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>', r.out_address);
    m('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>', PUB.ago(r.out_created_at));
    const id = document.createElement('span'); id.className = 'r-id'; id.textContent = '#' + r.out_number; meta.append(id);
    if (r.out_more_count > 0) { const x = document.createElement('span'); x.className = 'r-more'; x.textContent = CS.t('moreN')(r.out_more_count); meta.append(x); }
    return li;
  }
  function renderList() {
    const list = $('#list'); list.innerHTML = '';
    items.forEach((r, i) => list.append(card(r, i)));
    $('#count-line').innerHTML = activeCount() ? CS.t('countFiltered')(total) : (total ? CS.t('countLine')(total) : '');
    $('#more').hidden = items.length >= total;
    const empty = !items.length;
    $('#empty').hidden = !empty;
    if (empty) {
      const filtered = activeCount() > 0;
      $('#empty-title').textContent = CS.t(filtered ? 'emptyT' : 'noneT');
      $('#empty-text').textContent = CS.t(filtered ? 'emptyX' : 'noneX');
      $('#clear2').hidden = !filtered; $('#empty-submit').hidden = filtered;
    }
  }

  async function loadPage(reset) {
    const my = ++seq;
    if (reset) { offset = 0; $('#loading').hidden = false; $('#list').innerHTML = ''; $('#empty').hidden = true; $('#more').hidden = true; }
    $('#error').hidden = true;
    const { data, error } = await sb.rpc('search_public_reports', { ...filters(), p_sort:state.sort, p_limit:PAGE, p_offset:offset });
    if (my !== seq) return;
    $('#loading').hidden = true;
    $('#more').classList.remove('loading'); $('#more').disabled = false;
    if (error) { console.warn('[CallSliven] search_public_reports:', error); $('#error').textContent = CS.t('eLoad'); $('#error').hidden = false; return; }
    const rows = data || [];
    items = reset ? rows : items.concat(rows);
    total = rows.length ? Number(rows[0].out_total) : (reset ? 0 : total);
    offset = items.length;
    renderList();
  }
  $('#more').addEventListener('click', () => { $('#more').classList.add('loading'); $('#more').disabled = true; loadPage(false); });

  /* ═════════ Map ═════════ */
  let map = null, layer = null, mapSeq = 0;
  function initMap() {
    if (!window.L) { $('#map').textContent = CS.t('mapFail'); return; }
    map = L.map('map', { scrollWheelZoom:true }).setView([42.6822, 26.3228], 13);
    CS.tiles(map);
    layer = L.featureGroup().addTo(map);
  }
  async function loadMap(fit) {
    if (!map) return;
    const my = ++mapSeq;
    const { data, error } = await sb.rpc('public_map_points', filters());
    if (my !== mapSeq) return;
    layer.clearLayers();
    if (error) { console.warn('[CallSliven] public_map_points:', error); return; }
    (data || []).forEach(r => {
      const icon = L.divIcon({ className:'pin-wrap', html:`<span class="pin" style="--c:${PUB.COLORS[r.out_status] || PUB.COLORS.new}">${PUB.icon(r.out_category)}</span>`,
        iconSize:[38, 38], iconAnchor:[19, 46], popupAnchor:[0, -44] });
      const mk = L.marker([r.out_lat, r.out_lng], { icon, keyboard:true, title:r.out_title, riseOnHover:true });
      const pop = document.createElement('div');
      const c = document.createElement('span'); c.className = 'pop-cat'; c.textContent = r.out_category || '';
      const t = document.createElement('span'); t.className = 'pop-title'; t.textContent = r.out_title;
      const f = document.createElement('span'); f.className = 'pop-foot';
      const a = document.createElement('a'); a.className = 'pop-link'; a.href = `report.html?number=${r.out_number}`; a.textContent = CS.t('open') + ' →';
      f.append(PUB.pill(r.out_status), a); pop.append(c, t, f);
      mk.bindPopup(pop);
      mk.addTo(layer);
    });
    if (fit && layer.getLayers().length) map.fitBounds(layer.getBounds().pad(0.2), { maxZoom:16 });
  }

  function reload(fit = true) { writeUrl(); renderControls(); loadPage(true); loadMap(fit); }

  /* ═════════ Events ═════════ */
  let qTimer;
  $('#q').addEventListener('input', e => { clearTimeout(qTimer); qTimer = setTimeout(() => { state.q = e.target.value; reload(); }, 300); });
  $('#search-form').addEventListener('submit', e => { e.preventDefault(); clearTimeout(qTimer); state.q = $('#q').value; reload(); });
  $('#period').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { state.period = b.dataset.period; reload(); } });
  const clearAll = () => { Object.assign(state, { q:'', cat:'', period:'all' }); $('#q').value = ''; reload(); };
  $('#clear').addEventListener('click', clearAll);
  $('#clear2').addEventListener('click', clearAll);

  // phone: list ⇄ map
  const toggle = $('#view-toggle');
  function renderToggle() {
    const showingMap = $('#results').classList.contains('show-map');
    toggle.setAttribute('aria-pressed', showingMap);
    $('#view-toggle-text').textContent = CS.t(showingMap ? 'showList' : 'showMap');
  }
  toggle.addEventListener('click', () => {
    $('#results').classList.toggle('show-map');
    renderToggle();
    if (map) setTimeout(() => { map.invalidateSize(); if (layer.getLayers().length) map.fitBounds(layer.getBounds().pad(0.2), { maxZoom:16 }); }, 50);
    scrollTo({ top:$('#results').offsetTop - 160, behavior:CS.reduce ? 'auto' : 'smooth' });
  });

  // keep the map just below the sticky filter bar
  const fbar = $('#filters');
  function placeMap() {
    document.documentElement.style.setProperty('--map-top', (fbar.offsetHeight + 64 + 12) + 'px');
    if (map) map.invalidateSize();
  }
  new ResizeObserver(placeMap).observe(fbar);
  addEventListener('scroll', () => fbar.classList.toggle('stuck', fbar.getBoundingClientRect().top <= 64.5), { passive:true });

  document.addEventListener('cs:lang', () => {
    document.title = CS.t('docTitle') + ' · CallSliven';
    renderControls(); renderToggle();
    if (sb) renderList();
    if (!$('#error').hidden) $('#error').textContent = CS.t('eLoad');
  });

  /* ═════════ Start ═════════ */
  readUrl();
  $('#q').value = state.q;
  initMap();
  CS.start();
  document.title = CS.t('docTitle') + ' · CallSliven';
  placeMap();
  CS.client().then(async client => {
    sb = client;
    const { data } = await sb.from('categories').select('id, name, sort_order').order('sort_order').order('name');
    cats = data || [];
    if (state.cat && !cats.some(c => String(c.id) === state.cat)) state.cat = '';
    reload(true);
  }).catch(e => {
    console.warn('[CallSliven] client:', e);
    $('#loading').hidden = true; $('#error').textContent = CS.t('eLoad'); $('#error').hidden = false;
  });
})();
