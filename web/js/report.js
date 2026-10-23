/* CallSliven — one public report (PUB-4…6) from get_public_report.
   Opened as report.html?number=12. A duplicate opens its main report; a non-public number gives "not available". */
(() => {
  const { $ } = CS;

  CS.addStrings({
    bg: {
      timeline:'Хронология', place:'Място', approx:'Мястото е показано приблизително.',
      submitted:d => `Подаден ${d}`, updated:d => `Последна промяна ${d}`,
      linked:(req, main) => `Сигнал №${req} е свързан с този сигнал (№${main}), защото е за същия проблем.`,
      more:n => `Още ${n} ${n === 1 ? 'гражданин е подал' : 'граждани са подали'} сигнал за същия проблем.`,
      noAddr:'Адресът не е определен.',
      nfTitle:'Сигналът не е наличен', nfText:'Линкът може да е грешен, или сигналът е оттеглен, отхвърлен или още чака проверка.', nfBtn:'Към всички сигнали',
      eLoad:'Сигналът не се зареди. Провери интернета си и презареди страницата.', docTitle:n => `Сигнал №${n}`, docNf:'Сигналът не е наличен'
    },
    en: {
      timeline:'Timeline', place:'Place', approx:'The place is shown approximately.',
      submitted:d => `Submitted ${d}`, updated:d => `Last change ${d}`,
      linked:(req, main) => `Report #${req} is linked to this report (#${main}) because it is about the same problem.`,
      more:n => `${n} more ${n === 1 ? 'citizen has' : 'citizens have'} reported the same problem.`,
      noAddr:'Address not determined.',
      nfTitle:'This report is not available', nfText:'The link may be wrong, or the report was withdrawn, rejected or is still awaiting review.', nfBtn:'See all reports',
      eLoad:"The report didn't load. Check your internet and reload the page.", docTitle:n => `Report #${n}`, docNf:'Report not available'
    }
  });

  const num = (new URLSearchParams(location.search).get('number') || '').trim();
  let r = null, map = null;

  function notFound() {
    $('#loading').hidden = true; $('#report').hidden = true; $('#not-found').hidden = false;
    $('#crumb-id').textContent = /^\d+$/.test(num) ? '№' + num : '';
    document.title = CS.t('docNf') + ' · CallSliven';
  }

  function render() {
    if (!r) return;
    document.title = CS.t('docTitle')(r.out_number) + ' · CallSliven';
    $('#crumb-id').textContent = '№' + r.out_number;
    $('#r-ico').innerHTML = PUB.icon(r.out_category);
    $('#r-cat').textContent = [r.out_category, r.out_subcategory].filter(Boolean).join(' · ');
    $('#r-title').textContent = r.out_title;
    $('#r-desc').textContent = r.out_description;
    const st = $('#r-status'); st.innerHTML = ''; st.append(PUB.pill(r.out_status));
    const meta = $('#r-meta'); meta.innerHTML = '';
    const add = t => { const s = document.createElement('span'); s.textContent = t; meta.append(s); };
    add('№' + r.out_number); add(CS.t('submitted')(PUB.when(r.out_created_at)));
    if (r.out_last_update && r.out_last_update !== r.out_created_at) add(CS.t('updated')(PUB.when(r.out_last_update)));
    $('#r-addr').textContent = r.out_address || CS.t('noAddr');
    const linked = Number(r.out_requested_number) !== Number(r.out_number);
    $('#linked').hidden = !linked;
    if (linked) $('#linked').textContent = CS.t('linked')(r.out_requested_number, r.out_number);
    $('#r-more').hidden = !(r.out_more_count > 0);
    if (r.out_more_count > 0) $('#r-more').textContent = CS.t('more')(Number(r.out_more_count));
    const tl = $('#timeline'); tl.innerHTML = '';
    (r.out_events || []).forEach(e => {
      const li = document.createElement('li');
      const t = document.createElement('time'); t.dateTime = e.at; t.textContent = PUB.when(e.at);
      li.append(PUB.pill(e.status), t);
      if (e.note) { const n = document.createElement('p'); n.className = 'tl-note'; n.textContent = e.note; li.append(n); }
      tl.append(li);
    });
  }

  function drawMap() {
    if (!window.L || map) return;
    map = L.map('map', { scrollWheelZoom:false, dragging:!L.Browser.mobile, zoomControl:true }).setView([r.out_lat, r.out_lng], 16);
    CS.tiles(map);
    const c = PUB.COLORS[r.out_status] || PUB.COLORS.new;
    // a circle, not a pin: the public point is rounded (≈15 m, or ≈100 m for hidden addresses)
    L.circle([r.out_lat, r.out_lng], { radius:40, color:c, weight:2, fillColor:c, fillOpacity:.25, interactive:false }).addTo(map);
    L.circleMarker([r.out_lat, r.out_lng], { radius:6, color:'#fff', weight:2, fillColor:c, fillOpacity:1, interactive:false }).addTo(map);
  }

  document.addEventListener('cs:lang', () => { if (r) render(); else if (!$('#not-found').hidden) notFound(); });

  CS.start();
  if (!/^\d{1,12}$/.test(num)) return notFound();
  CS.client().then(async sb => {
    const { data, error } = await sb.rpc('get_public_report', { p_number:+num });
    if (error) {
      console.warn('[CallSliven] get_public_report:', error);
      $('#loading').hidden = true;
      const p = document.createElement('p'); p.className = 'r-error'; p.textContent = CS.t('eLoad');
      $('#report').before(p);
      return;
    }
    r = Array.isArray(data) ? data[0] : data;
    if (!r) return notFound();
    $('#loading').hidden = true; $('#report').hidden = false;
    render(); drawMap();
    // back link keeps the filters when the visitor came from the list
    try {
      const ref = new URL(document.referrer);
      if (ref.origin === location.origin && ref.pathname.endsWith('/reports.html')) $('#back-link').href = 'reports.html' + ref.search;
    } catch (e) {}
  }).catch(e => { console.warn('[CallSliven] client:', e); notFound(); });
})();
