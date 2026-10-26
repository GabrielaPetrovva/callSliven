/* CallSliven — admin panel, part 1 (read only): ADM-1 access, ADM-3 list and filters, ADM-4 "needs attention",
   ADM-5 report detail, ADM-14 deadlines in yellow / red.
   The browser decides nothing about access: every table and function checks is_staff() (role + aal2) in the database.
   Texts from the database always go in with textContent (SEC-5). Actions (approve, reject, send…) come in part 2. */
(() => {
  const { $, $$ } = CS;
  const PAGE = 50;
  const OPEN = ['new', 'sent', 'in_progress'];

  CS.addStrings({
    bg: {
      aTitle:'Админ <em>панел</em>', refresh:'Обнови', lead:(n, t) => `Отворени сигнали: ${n} · обновено в ${t}`,
      deniedT:'Нямаш достъп', deniedX:'Тази страница е само за администраторите на общината.', toHome:'Към началото',
      attTitle:'Изискват внимание',
      tAll:'Всички', tSuspicious:'Подозрителни', tCritical:'Критични', tFirst:'Просрочена реакция', tResolve:'Просрочено решаване',
      tFailed:'Неуспешна доставка', tManual:'За ръчно уведомяване',
      sysErr:n => `Системни грешки за последните 24 ч: ${n}. Super Admin ги вижда в журнала.`, queued:n => `В опашката за изпращане: ${n}.`,
      searchLabel:'Търсене', searchPh:'№ или текст от сигнала',
      fStatus:'Статус', fCat:'Категория', fPrio:'Приоритет', fSort:'Подреждане',
      stOpen:'Отворени', stAny:'Всички статуси', allCats:'Всички категории', allPrio:'Всеки приоритет',
      sortNew:'Най-нови', sortOld:'Най-стари', sortPrio:'По приоритет', sortDue:'По срок за решаване',
      s_new:'Нов', s_sent:'Изпратен', s_in_progress:'В обработка', s_resolved:'Решен', s_closed:'Затворен', s_rejected:'Отхвърлен', s_withdrawn:'Оттеглен',
      review:'Чака преглед',
      p_critical:'Критичен', p_high:'Висок', p_medium:'Среден', p_low:'Нисък',
      found:n => `${n} ${n === 1 ? 'сигнал' : 'сигнала'}`, more:'Покажи още',
      emptyAll:'Няма сигнали по тези филтри.', emptyView:'Няма сигнали тук. Добре е.',
      lateFirst:'Просрочена първа реакция', lateResolve:'Просрочен срок за решаване', dispatchFailed:'Неуспешна доставка',
      close:'Затвори', publicPage:'Публична страница',
      secOriginal:'Текст от подателя', secPublic:'Публичен текст (пречистен)', secPlace:'Място', secPhotos:'Снимки', secDeadlines:'Срокове',
      secRouting:'Класификация и институция', secTimeline:'Хронология', secDispatch:'Изпращания към институции', secLinks:'Дубликати',
      submitter:'Подател', unknownUser:'Профилът е изтрит', submitted:'Подаден', firstAction:'Първо действие на администратор', none:'—',
      exactAddr:'Точен адрес (само за институцията)', publicAddr:'Публичен адрес', noAddr:'Адресът не е определен.',
      coords:'Координати', openMap:'Отвори в OpenStreetMap',
      noPhotos:'Няма снимки.', photoN:(i, n) => `Снимка ${i} от ${n}`, photoFail:'Снимките не се заредиха.',
      dueFirst:'Първа реакция', dueResolve:'Решаване', dueNone:'Сроковете тръгват след одобрение.', dueStopped:'Сроковете не важат за този статус.',
      category:'Категория', institution:'Институция', copyTo:'Копие до', noInst:'Неопределена институция', priority:'Приоритет',
      demo:'демо', manual:'ръчно', attempt:n => `Опит ${n}`, noDispatch:'Още не е изпращан.', resendReason:'Причина за повторно изпращане',
      d_queued:'В опашката', d_sending:'Изпраща се', d_sent:'Изпратено', d_delivered:'Доставено', d_failed:'Неуспешна доставка', d_manual:'Чака ръчно уведомяване', d_forwarded:'Препратено ръчно',
      dupOf:'Дубликат на сигнал', dupChildren:'Свързани с този сигнал',
      reasonsT:'Защо е подозрителен', r_email:'Имейл в текста', r_url:'Линк в текста', r_plate:'Регистрационен номер', r_phone_or_id:'Телефон или ЕГН',
      r_caps:'Почти само главни букви', r_repeat:'Много повторени знаци', r_ip_burst:'Много сигнали от един IP адрес за час',
      r_honeypot:'Попълнено скрито поле', r_too_fast:'Изпратен твърде бързо', r_same_text:'Същият текст като друг сигнал',
      rejectT:'Причина за отхвърляне', rj_insufficient_info:'Недостатъчна информация', rj_out_of_scope:'Извън компетенциите на общината', rj_inappropriate:'Неприемливо съдържание', rj_spam:'Спам',
      inIn:x => `след ${x}`, ago:x => `преди ${x}`, uMin:n => `${n} мин`, uH:n => `${n} ч`, uD:n => `${n} ${n === 1 ? 'ден' : 'дни'}`,
      eLoad:'Данните не се заредиха. Провери връзката и натисни „Обнови“.', eDetail:'Сигналът не се зареди.',
      eNotFound:'Няма сигнал с този номер.', eSession:'Сесията изтече. Влез отново.', docTitle:'Админ панел'
    },
    en: {
      aTitle:'Admin <em>panel</em>', refresh:'Refresh', lead:(n, t) => `Open reports: ${n} · updated at ${t}`,
      deniedT:'No access', deniedX:'This page is for municipal administrators only.', toHome:'Back to home',
      attTitle:'Needs attention',
      tAll:'All', tSuspicious:'Suspicious', tCritical:'Critical', tFirst:'First response overdue', tResolve:'Resolution overdue',
      tFailed:'Delivery failed', tManual:'Manual notice pending',
      sysErr:n => `System errors in the last 24 h: ${n}. A Super Admin sees them in the log.`, queued:n => `Waiting in the send queue: ${n}.`,
      searchLabel:'Search', searchPh:'# or text from the report',
      fStatus:'Status', fCat:'Category', fPrio:'Priority', fSort:'Sort',
      stOpen:'Open', stAny:'All statuses', allCats:'All categories', allPrio:'Any priority',
      sortNew:'Newest first', sortOld:'Oldest first', sortPrio:'By priority', sortDue:'By resolution deadline',
      s_new:'New', s_sent:'Sent', s_in_progress:'In progress', s_resolved:'Resolved', s_closed:'Closed', s_rejected:'Rejected', s_withdrawn:'Withdrawn',
      review:'Awaiting review',
      p_critical:'Critical', p_high:'High', p_medium:'Medium', p_low:'Low',
      found:n => `${n} ${n === 1 ? 'report' : 'reports'}`, more:'Show more',
      emptyAll:'No reports match these filters.', emptyView:'Nothing here. Good.',
      lateFirst:'First response overdue', lateResolve:'Resolution deadline passed', dispatchFailed:'Delivery failed',
      close:'Close', publicPage:'Public page',
      secOriginal:'Text from the submitter', secPublic:'Public text (cleaned)', secPlace:'Place', secPhotos:'Photos', secDeadlines:'Deadlines',
      secRouting:'Classification and institution', secTimeline:'Timeline', secDispatch:'Sent to institutions', secLinks:'Duplicates',
      submitter:'Submitter', unknownUser:'Profile deleted', submitted:'Submitted', firstAction:'First administrator action', none:'—',
      exactAddr:'Exact address (for the institution only)', publicAddr:'Public address', noAddr:'Address not determined.',
      coords:'Coordinates', openMap:'Open in OpenStreetMap',
      noPhotos:'No photos.', photoN:(i, n) => `Photo ${i} of ${n}`, photoFail:"The photos didn't load.",
      dueFirst:'First response', dueResolve:'Resolution', dueNone:'Deadlines start after approval.', dueStopped:'Deadlines do not apply to this status.',
      category:'Category', institution:'Institution', copyTo:'Copy to', noInst:'Institution to be determined', priority:'Priority',
      demo:'demo', manual:'manual', attempt:n => `Attempt ${n}`, noDispatch:'Not sent yet.', resendReason:'Reason for sending again',
      d_queued:'Queued', d_sending:'Sending', d_sent:'Sent', d_delivered:'Delivered', d_failed:'Delivery failed', d_manual:'Waiting for manual notice', d_forwarded:'Forwarded by hand',
      dupOf:'Duplicate of report', dupChildren:'Linked to this report',
      reasonsT:'Why it is suspicious', r_email:'Email in the text', r_url:'Link in the text', r_plate:'Number plate', r_phone_or_id:'Phone or ID number',
      r_caps:'Almost all capitals', r_repeat:'Many repeated characters', r_ip_burst:'Many reports from one IP address within an hour',
      r_honeypot:'Hidden field filled in', r_too_fast:'Sent too fast', r_same_text:'Same text as another report',
      rejectT:'Reason for rejection', rj_insufficient_info:'Not enough information', rj_out_of_scope:"Outside the municipality's competence", rj_inappropriate:'Inappropriate content', rj_spam:'Spam',
      inIn:x => `in ${x}`, ago:x => `${x} ago`, uMin:n => `${n} min`, uH:n => `${n} h`, uD:n => `${n} ${n === 1 ? 'day' : 'days'}`,
      eLoad:"The data didn't load. Check the connection and press Refresh.", eDetail:"The report didn't load.",
      eNotFound:'There is no report with this number.', eSession:'Your session expired. Log in again.', docTitle:'Admin panel'
    }
  });

  /* ═════════ Small helpers ═════════ */
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const tr = (key, ...a) => { const v = CS.t(key); return typeof v === 'function' ? v(...a) : (v === undefined ? key : v); };
  const loc = () => CS.lang === 'bg' ? 'bg-BG' : 'en-GB';
  const fmt = iso => iso ? new Date(iso).toLocaleString(loc(), { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : CS.t('none');
  function rel(iso) {
    const ms = new Date(iso) - Date.now(), a = Math.abs(ms);
    const x = a < 3600e3 ? tr('uMin', Math.max(1, Math.round(a / 60e3))) : a < 48 * 3600e3 ? tr('uH', Math.round(a / 3600e3)) : tr('uD', Math.round(a / 864e5));
    return ms >= 0 ? tr('inIn', x) : tr('ago', x);
  }
  const ICON = {
    alert:'<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/>',
    eye:'<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    flag:'<path d="M5 21V4h11l-1.5 4L16 12H5"/>',
    mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    hand:'<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4.5a1.5 1.5 0 0 1 3 0V12M14 11.5V6a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7h-.5A6.5 6.5 0 0 1 4 15.5V12a1.5 1.5 0 0 1 3 0v1"/>',
    list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    pin:'<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>'
  };
  const svg = (name, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;
  const pill = (cls, text) => el('span', 'a-pill ' + cls, text);
  const statusPill = r => r.needs_review && r.status === 'new' ? pill('st-review', CS.t('review')) : pill('st-' + r.status, CS.t('s_' + r.status));
  const prioPill = p => pill('pr-' + p, CS.t('p_' + p));

  /* PostGIS points come back from the API as hex EWKB ("0101000020E6…"), or as GeoJSON on some setups. → [lat, lng] */
  function point(v) {
    if (!v) return null;
    if (typeof v === 'object' && Array.isArray(v.coordinates)) return [v.coordinates[1], v.coordinates[0]];
    if (typeof v !== 'string' || !/^[0-9a-f]+$/i.test(v) || v.length < 42) return null;
    const bytes = new Uint8Array(v.match(/../g).map(h => parseInt(h, 16)));
    const dv = new DataView(bytes.buffer), le = bytes[0] === 1;
    const type = dv.getUint32(1, le);
    let off = 5;
    if (type & 0x20000000) off += 4;                 // SRID present
    if ((type & 0xffff) !== 1) return null;          // not a point
    return [dv.getFloat64(off + 8, le), dv.getFloat64(off, le)];
  }

  /* deadline state: "late" (red) = resolution overdue, "warn" (yellow) = first response overdue (ADM-14) */
  function lateness(r, a) {
    if (!a || r.needs_review || !OPEN.includes(r.status)) return null;
    const now = Date.now();
    if (a.resolve_due && new Date(a.resolve_due) < now) return 'late';
    if (r.status === 'new' && a.first_response_due && new Date(a.first_response_due) < now) return 'warn';
    return null;
  }

  let alertKey = null;
  function showAlert(key) { alertKey = key; $('#alert .alert-text').textContent = CS.t(key); $('#alert').classList.add('show'); }
  function hideAlert() { alertKey = null; $('#alert').classList.remove('show'); }

  /* ═════════ State ═════════ */
  let sb = null, cats = [], subs = [], insts = [], counts = null;
  const state = { view:'all', status:'open', cat:'', prio:'', sort:'newest', q:'' };
  let items = [], total = 0, seq = 0, failedIds = [];

  const VIEWS = [
    { id:'all', key:'tAll', icon:'list' },
    { id:'suspicious', key:'tSuspicious', icon:'eye', count:'out_suspicious_pending' },
    { id:'critical', key:'tCritical', icon:'alert', count:'out_critical_open', tone:'red' },
    { id:'first', key:'tFirst', icon:'clock', count:'out_first_response_overdue', tone:'yellow' },
    { id:'resolve', key:'tResolve', icon:'flag', count:'out_resolve_overdue', tone:'red' },
    { id:'failed', key:'tFailed', icon:'mail', count:'out_failed_dispatches', tone:'red' },
    { id:'manual', key:'tManual', icon:'hand', count:'out_manual_pending', tone:'yellow' }
  ];

  /* ═════════ Tiles: "needs attention" ═════════ */
  function renderTiles() {
    const box = $('#tiles'); box.innerHTML = '';
    VIEWS.forEach(v => {
      const n = v.count && counts ? Number(counts[v.count]) : null;
      const b = el('button', 'tile' + (v.tone && n ? ' tone-' + v.tone : '') + (n === 0 ? ' zero' : ''));
      b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', state.view === v.id);
      b.innerHTML = svg(v.icon, 'tile-ico');
      b.append(el('span', 'tile-label', CS.t(v.key)));
      if (n !== null) b.append(el('b', 'tile-n', String(n)));
      b.addEventListener('click', () => { state.view = v.id; renderTiles(); renderFilters(); loadList(true); });
      box.append(b);
    });
    const note = $('#sys-note'); const parts = [];
    if (counts && Number(counts.out_system_errors_24h) > 0) parts.push(tr('sysErr', Number(counts.out_system_errors_24h)));
    if (counts && Number(counts.out_queued_dispatches) > 0) parts.push(tr('queued', Number(counts.out_queued_dispatches)));
    note.textContent = parts.join(' '); note.hidden = !parts.length;
  }

  /* ═════════ Filters ═════════ */
  const ddStatus = CS.dropdown($('#dd-status'), { label:() => CS.t('fStatus'), value:'open', isActive:v => v !== 'open',
    onChange:v => { state.status = v; loadList(true); } });
  const ddCat = CS.dropdown($('#dd-cat'), { label:() => CS.t('fCat'), value:'', isActive:v => !!v,
    onChange:v => { state.cat = v; loadList(true); } });
  const ddPrio = CS.dropdown($('#dd-prio'), { label:() => CS.t('fPrio'), value:'', isActive:v => !!v,
    onChange:v => { state.prio = v; loadList(true); } });
  const ddSort = CS.dropdown($('#dd-sort'), { label:() => CS.t('fSort'), value:'newest',
    onChange:v => { state.sort = v; loadList(true); } });

  function renderFilters() {
    ddStatus.update([{ value:'open', label:CS.t('stOpen') }, { value:'any', label:CS.t('stAny') },
      ...['new', 'sent', 'in_progress', 'resolved', 'closed', 'rejected', 'withdrawn'].map(s => ({ value:s, label:CS.t('s_' + s) }))], state.status);
    ddCat.update([{ value:'', label:CS.t('allCats') }, ...cats.map(c => ({ value:String(c.id), label:c.name }))], state.cat);
    ddPrio.update([{ value:'', label:CS.t('allPrio') }, ...['critical', 'high', 'medium', 'low'].map(p => ({ value:p, label:CS.t('p_' + p) }))], state.prio);
    ddSort.update([['newest', 'sortNew'], ['oldest', 'sortOld'], ['priority', 'sortPrio'], ['due', 'sortDue']].map(([v, k]) => ({ value:v, label:CS.t(k) })), state.sort);
    // a "needs attention" view fixes the status itself, so the status filter only applies to "All"
    $('#dd-status').classList.toggle('off', state.view !== 'all');
    const view = VIEWS.find(v => v.id === state.view);
    $('#list-h').textContent = CS.t(view.key);
  }

  /* ═════════ List ═════════ */
  // reports whose latest dispatch attempt failed / that wait for a manual notice
  async function dispatchReportIds(kind) {
    const { data, error } = await sb.from('report_dispatches').select('report_id, attempt, status').order('attempt', { ascending:false }).limit(1000);
    if (error) throw error;
    const latest = {};
    (data || []).forEach(d => { if (!latest[d.report_id] || d.attempt > latest[d.report_id].attempt) latest[d.report_id] = { attempt:d.attempt, statuses:[] }; });
    (data || []).forEach(d => { if (latest[d.report_id].attempt === d.attempt) latest[d.report_id].statuses.push(d.status); });
    if (kind === 'failed') return Object.keys(latest).filter(id => latest[id].statuses.includes('failed'));
    return [...new Set((data || []).filter(d => d.status === 'manual').map(d => d.report_id))];
  }

  async function query(offset) {
    const nowIso = new Date().toISOString();
    let q = sb.from('reports').select(
      'id, number, title, status, needs_review, duplicate_of, created_at, subcategory_id, ' +
      'report_admin!inner(priority, institution_id, suspicious_reasons, first_response_due, resolve_due), ' +
      'report_private(original_title)', { count:'exact' });

    switch (state.view) {
      case 'suspicious': q = q.eq('needs_review', true).eq('status', 'new'); break;
      case 'critical': q = q.eq('report_admin.priority', 'critical').eq('needs_review', false).in('status', OPEN); break;
      case 'first': q = q.eq('status', 'new').eq('needs_review', false).lt('report_admin.first_response_due', nowIso); break;
      case 'resolve': q = q.in('status', OPEN).eq('needs_review', false).lt('report_admin.resolve_due', nowIso); break;
      case 'failed': case 'manual': {
        const ids = await dispatchReportIds(state.view);
        if (state.view === 'failed') failedIds = ids;
        if (!ids.length) return { data:[], count:0 };
        q = q.in('id', ids.slice(0, 300));
        break;
      }
      default:
        if (state.status === 'open') q = q.in('status', OPEN);
        else if (state.status !== 'any') q = q.eq('status', state.status);
    }
    if (state.cat) {
      const ids = subs.filter(s => String(s.category_id) === state.cat).map(s => s.id);
      q = q.in('subcategory_id', ids.length ? ids : [-1]);
    }
    if (state.prio) q = q.eq('report_admin.priority', state.prio);
    const text = state.q.trim();
    if (/^№?\s*\d{1,12}$/.test(text)) q = q.eq('number', +text.replace(/\D/g, ''));
    else if (text.length >= 2) {
      const safe = text.replace(/[%_\\,()*."':]/g, ' ').trim().slice(0, 60);
      if (safe) q = q.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`);
    }
    if (state.sort === 'oldest') q = q.order('created_at', { ascending:true });
    else if (state.sort === 'priority') q = q.order('report_admin(priority)', { ascending:true }).order('created_at', { ascending:false });
    else if (state.sort === 'due') q = q.order('report_admin(resolve_due)', { ascending:true, nullsFirst:false }).order('created_at', { ascending:true });
    else q = q.order('created_at', { ascending:false });
    return q.range(offset, offset + PAGE - 1);
  }

  async function loadList(reset) {
    const my = ++seq;
    if (reset) { items = []; $('#list').innerHTML = ''; $('#loading').hidden = false; $('#empty').hidden = true; $('#more').hidden = true; $('#count').textContent = ''; }
    renderFilters();
    try {
      const { data, count, error } = await query(reset ? 0 : items.length);
      if (my !== seq) return;
      if (error) throw error;
      items = reset ? (data || []) : items.concat(data || []);
      total = count || 0;
      hideAlert();
    } catch (e) {
      if (my !== seq) return;
      console.warn('[CallSliven] admin list:', e);
      showAlert(/JWT|session/i.test(e && e.message || '') ? 'eSession' : 'eLoad');
    }
    $('#loading').hidden = true;
    $('#more').classList.remove('loading'); $('#more').disabled = false;
    renderList();
  }

  function row(r) {
    const a = r.report_admin || {}, p = r.report_private || {};
    const s = subs.find(x => x.id === r.subcategory_id), c = s && cats.find(x => x.id === s.category_id);
    const late = lateness(r, a);
    const li = el('li', 'a-row' + (late ? ' ' + late : '') + (openNumber === r.number ? ' selected' : ''));
    const btn = el('a', 'a-row-link'); btn.href = '#n=' + r.number;
    const top = el('span', 'a-row-top');
    top.append(el('span', 'a-num', '№' + r.number), statusPill(r));
    if (a.priority) top.append(prioPill(a.priority));
    if (late) { const d = el('span', 'late-dot ' + late); d.title = CS.t(late === 'late' ? 'lateResolve' : 'lateFirst'); d.setAttribute('aria-label', d.title); top.append(d); }
    if (failedIds.includes(r.id)) top.append(pill('d-bad', CS.t('dispatchFailed')));
    // staff read the submitter's own wording; the public title can differ (personal data removed)
    btn.append(top, el('span', 'a-row-title', p.original_title || r.title),
      el('span', 'a-row-sub', [c && c.name, s && s.name].filter(Boolean).join(' · ') + ' · ' + rel(r.created_at)));
    li.append(btn);
    return li;
  }

  function renderList() {
    const list = $('#list'); list.innerHTML = '';
    items.forEach(r => list.append(row(r)));
    $('#count').textContent = total ? tr('found', total) : '';
    $('#more').hidden = items.length >= total;
    const empty = !items.length && $('#loading').hidden && !alertKey;
    $('#empty').hidden = !empty;
    if (empty) $('#empty').textContent = CS.t(state.view === 'all' ? 'emptyAll' : 'emptyView');
  }
  $('#more').addEventListener('click', () => { $('#more').classList.add('loading'); $('#more').disabled = true; loadList(false); });

  let qTimer;
  $('#q').addEventListener('input', e => { clearTimeout(qTimer); qTimer = setTimeout(() => { state.q = e.target.value; loadList(true); }, 350); });
  $('#search-form').addEventListener('submit', e => { e.preventDefault(); clearTimeout(qTimer); state.q = $('#q').value; loadList(true); });

  /* ═════════ Counters ═════════ */
  async function loadCounts() {
    const { data, error } = await sb.rpc('admin_attention_counts');
    if (error) { console.warn('[CallSliven] admin_attention_counts:', error); return; }
    counts = Array.isArray(data) ? data[0] : data;
    renderTiles();
    // the "delivery failed" badge in the list, in every view
    if (Number(counts && counts.out_failed_dispatches) > 0) {
      try { failedIds = await dispatchReportIds('failed'); renderList(); } catch (e) { console.warn('[CallSliven] dispatches:', e); }
    } else if (failedIds.length) { failedIds = []; renderList(); }
    const open = await sb.from('reports').select('id', { count:'exact', head:true }).in('status', OPEN);
    if (!open.error) $('#lead').textContent = tr('lead', open.count || 0, new Date().toLocaleTimeString(loc(), { hour:'2-digit', minute:'2-digit' }));
  }

  /* ═════════ Detail ═════════ */
  let openNumber = null, dSeq = 0, dMap = null, detail = null;

  function section(titleKey, cls = '') {
    const s = el('section', 'd-sec ' + cls);
    s.append(el('h3', 'd-h', CS.t(titleKey)));
    return s;
  }
  const fact = (label, value, cls = '') => {
    const d = el('div', 'fact ' + cls);
    d.append(el('dt', null, label));
    const dd = el('dd'); if (value instanceof Node) dd.append(value); else dd.textContent = value; d.append(dd);
    return d;
  };

  async function openDetail(number) {
    const my = ++dSeq;
    openNumber = number;
    $$('.a-row').forEach(li => li.classList.toggle('selected', li.querySelector('.a-num').textContent === '№' + number));
    $('#detail').hidden = false; $('#grid').classList.add('with-detail'); document.body.classList.add('detail-open');
    $('#d-loading').hidden = false; $('#d-body').hidden = true; $('#d-alert').classList.remove('show');
    try {
      const { data:r, error } = await sb.from('reports')
        .select('*, report_admin(*), report_private(original_title, original_description, exact_point, exact_address, reject_reason, reject_note, user_id, created_at)')
        .eq('number', number).maybeSingle();
      if (error) throw error;
      if (my !== dSeq) return;
      if (!r) { $('#d-loading').hidden = true; $('#d-alert .alert-text').textContent = CS.t('eNotFound'); $('#d-alert').classList.add('show'); return; }
      const [ev, ph, ds, nm, master, children] = await Promise.all([
        sb.from('report_events').select('status, note, created_at').eq('report_id', r.id).order('created_at').order('id'),
        sb.from('report_photos').select('position, path').eq('report_id', r.id).order('position'),
        sb.from('report_dispatches').select('id, institution_id, recipient_role, attempt, status, to_email, is_demo, resend_reason, error, created_at, updated_at').eq('report_id', r.id).order('attempt', { ascending:false }).order('recipient_role', { ascending:false }),
        sb.rpc('staff_get_submitter_name', { p_report_id:r.id }),
        r.duplicate_of ? sb.from('reports').select('number, status').eq('id', r.duplicate_of).maybeSingle() : { data:null },
        sb.from('reports').select('number, status').eq('duplicate_of', r.id).order('number')
      ]);
      if (my !== dSeq) return;
      let urls = [];
      const paths = (ph.data || []).map(p => p.path);
      if (paths.length) {
        const signed = await sb.storage.from('report-photos').createSignedUrls(paths, 600);   // 10 minutes, staff only (Storage rules)
        urls = signed.error ? null : (signed.data || []).map(x => x.signedUrl).filter(Boolean);
      }
      if (my !== dSeq) return;
      const name = Array.isArray(nm.data) ? nm.data[0] : nm.data;
      detail = { r, events:ev.data || [], urls, photoCount:paths.length, dispatches:ds.data || [], name, master:master.data, children:children.data || [] };
      renderDetail();
    } catch (e) {
      if (my !== dSeq) return;
      console.warn('[CallSliven] admin detail:', e);
      $('#d-loading').hidden = true; $('#d-alert .alert-text').textContent = CS.t('eDetail'); $('#d-alert').classList.add('show');
    }
  }

  function closeDetail() {
    dSeq++; openNumber = null; detail = null;
    if (dMap) { dMap.remove(); dMap = null; }
    $('#detail').hidden = true; $('#grid').classList.remove('with-detail'); document.body.classList.remove('detail-open');
    $$('.a-row.selected').forEach(li => li.classList.remove('selected'));
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  }
  $('#d-close').addEventListener('click', closeDetail);
  addEventListener('keydown', e => { if (e.key === 'Escape' && openNumber !== null && !document.querySelector('.dd.open')) closeDetail(); });

  function renderDetail() {
    if (!detail) return;
    const { r, events, urls, photoCount, dispatches, name, master, children } = detail;
    const a = r.report_admin || {}, p = r.report_private || {};
    const s = subs.find(x => x.id === r.subcategory_id), c = s && cats.find(x => x.id === s.category_id);
    const inst = id => insts.find(i => i.id === id);
    const body = $('#d-body'); body.innerHTML = '';

    // head
    const head = el('div', 'd-head');
    const line = el('div', 'd-pills');
    line.append(el('span', 'a-num big', '№' + r.number), statusPill(r));
    if (a.priority) line.append(prioPill(a.priority));
    const late = lateness(r, a);
    if (late) line.append(pill('late-' + late, CS.t(late === 'late' ? 'lateResolve' : 'lateFirst')));
    head.append(line, el('h2', 'd-title', p.original_title || r.title));
    head.append(el('p', 'd-sub', [c && c.name, s && s.name].filter(Boolean).join(' · ')));
    if (['new', 'sent', 'in_progress', 'resolved', 'closed'].includes(r.status) && !r.needs_review) {
      const link = el('a', 'link', CS.t('publicPage') + ' →'); link.href = 'report.html?number=' + r.number; link.target = '_blank'; link.rel = 'noopener';
      head.append(link);
    }
    body.append(head);

    // suspicious reasons
    if (r.needs_review && (a.suspicious_reasons || []).length) {
      const box = el('div', 'd-box warn');
      box.append(el('b', null, CS.t('reasonsT')));
      const ul = el('ul');
      a.suspicious_reasons.forEach(x => ul.append(el('li', null, tr('r_' + x) === 'r_' + x ? x : tr('r_' + x))));
      box.append(ul); body.append(box);
    }
    if (r.status === 'rejected' && p.reject_reason) {
      const box = el('div', 'd-box bad');
      box.append(el('b', null, CS.t('rejectT')), el('span', null, tr('rj_' + p.reject_reason)));
      if (p.reject_note) box.append(el('p', null, p.reject_note));
      body.append(box);
    }

    // texts
    const t = section('secOriginal');
    const facts = el('dl', 'facts');
    facts.append(fact(CS.t('submitter'), name && (name.out_first_name || name.out_last_name)
      ? [name.out_first_name, name.out_last_name].filter(Boolean).join(' ') : CS.t('unknownUser')));
    facts.append(fact(CS.t('submitted'), fmt(p.created_at || r.created_at)));
    t.append(facts, el('p', 'd-text', p.original_description || r.description));
    body.append(t);
    if ((p.original_title && p.original_title !== r.title) || (p.original_description && p.original_description !== r.description)) {
      const pub = section('secPublic', 'muted');
      pub.append(el('p', 'd-text strong', r.title), el('p', 'd-text', r.description));
      body.append(pub);
    }

    // deadlines
    const dl = section('secDeadlines');
    if (r.needs_review && r.status === 'new') dl.append(el('p', 'd-note', CS.t('dueNone')));
    else if (!OPEN.includes(r.status)) dl.append(el('p', 'd-note', CS.t('dueStopped')));
    else {
      const f = el('dl', 'facts');
      const due = (key, iso, overdue) => {
        const v = el('span', overdue ? 'due ' + overdue : 'due');
        v.textContent = iso ? fmt(iso) + ' · ' + rel(iso) : CS.t('none');
        return fact(CS.t(key), v);
      };
      const now = Date.now();
      f.append(due('dueFirst', a.first_response_due, r.status === 'new' && a.first_response_due && new Date(a.first_response_due) < now ? 'warn' : ''));
      f.append(due('dueResolve', a.resolve_due, a.resolve_due && new Date(a.resolve_due) < now ? 'late' : ''));
      dl.append(f);
    }
    if (a.first_admin_action_at) { const f2 = el('dl', 'facts one'); f2.append(fact(CS.t('firstAction'), fmt(a.first_admin_action_at))); dl.append(f2); }
    body.append(dl);

    // routing
    const ro = section('secRouting');
    const rf = el('dl', 'facts');
    rf.append(fact(CS.t('priority'), a.priority ? prioPill(a.priority) : CS.t('none')));
    rf.append(fact(CS.t('institution'), a.institution_id ? (inst(a.institution_id) || {}).name || '#' + a.institution_id : CS.t('noInst'), a.institution_id ? '' : 'warn'));
    if (a.cc_institution_id && a.cc_institution_id !== a.institution_id) rf.append(fact(CS.t('copyTo'), (inst(a.cc_institution_id) || {}).name || '#' + a.cc_institution_id));
    ro.append(rf); body.append(ro);

    // place
    const pl = section('secPlace');
    const pf = el('dl', 'facts');
    pf.append(fact(CS.t('exactAddr'), p.exact_address || CS.t('noAddr')));
    pf.append(fact(CS.t('publicAddr'), r.public_address || CS.t('none')));
    pl.append(pf);
    const ll = point(p.exact_point);
    if (ll) {
      const m = el('div', 'd-map'); m.id = 'd-map'; pl.append(m);
      const meta = el('p', 'd-coords');
      meta.append(CS.t('coords') + ': ' + ll[0].toFixed(5) + ', ' + ll[1].toFixed(5) + ' · ');
      const osm = el('a', 'link', CS.t('openMap')); osm.target = '_blank'; osm.rel = 'noopener';
      osm.href = `https://www.openstreetmap.org/?mlat=${ll[0]}&mlon=${ll[1]}#map=18/${ll[0]}/${ll[1]}`;
      meta.append(osm); pl.append(meta);
    }
    body.append(pl);

    // photos
    const ps = section('secPhotos');
    if (!photoCount) ps.append(el('p', 'd-note', CS.t('noPhotos')));
    else if (urls === null) ps.append(el('p', 'd-note bad', CS.t('photoFail')));
    else {
      const g = el('div', 'd-photos');
      urls.forEach((u, i) => {
        const aEl = el('a'); aEl.href = u; aEl.target = '_blank'; aEl.rel = 'noopener';
        const img = el('img'); img.src = u; img.alt = tr('photoN', i + 1, urls.length); img.loading = 'lazy';
        aEl.append(img); g.append(aEl);
      });
      ps.append(g);
    }
    body.append(ps);

    // duplicates
    if (master || children.length) {
      const du = section('secLinks');
      const link = x => { const aEl = el('a', 'link', '№' + x.number); aEl.href = '#n=' + x.number; return aEl; };
      if (master) { const pp = el('p'); pp.append(CS.t('dupOf') + ' ', link(master)); du.append(pp); }
      if (children.length) {
        const pp = el('p'); pp.append(CS.t('dupChildren') + ': ');
        children.forEach((x, i) => { if (i) pp.append(', '); pp.append(link(x)); });
        du.append(pp);
      }
      body.append(du);
    }

    // dispatches
    const dsec = section('secDispatch');
    if (!dispatches.length) dsec.append(el('p', 'd-note', CS.t('noDispatch')));
    else {
      const ul = el('ul', 'd-dispatch');
      dispatches.forEach(d => {
        const li = el('li', 'dis-' + d.status);
        const top = el('div', 'dis-top');
        top.append(el('b', null, tr('attempt', d.attempt)), el('span', null, ((inst(d.institution_id) || {}).name || '#' + d.institution_id) + (d.recipient_role === 'cc' ? ' (' + CS.t('copyTo').toLowerCase() + ')' : '')));
        top.append(pill('d-' + d.status, CS.t('d_' + d.status)));
        if (d.is_demo) top.append(pill('d-demo', CS.t('demo')));
        li.append(top);
        li.append(el('span', 'dis-meta', [d.to_email, fmt(d.updated_at || d.created_at)].filter(Boolean).join(' · ')));
        if (d.resend_reason) li.append(el('span', 'dis-meta', CS.t('resendReason') + ': ' + d.resend_reason));
        if (d.error) li.append(el('span', 'dis-err', d.error));
        ul.append(li);
      });
      dsec.append(ul);
    }
    body.append(dsec);

    // timeline
    const tl = section('secTimeline');
    const ol = el('ol', 'd-tl');
    events.forEach(e => {
      const li = el('li');
      li.append(pill('st-' + e.status, CS.t('s_' + e.status)), el('time', null, fmt(e.created_at)));
      if (e.note) li.append(el('span', 'tl-note', e.note));
      ol.append(li);
    });
    tl.append(ol); body.append(tl);

    $('#d-loading').hidden = true; body.hidden = false;
    $('#detail').scrollTop = 0;
    if (dMap) { dMap.remove(); dMap = null; }
    if (ll && window.L) {
      dMap = L.map('d-map', { scrollWheelZoom:false, zoomControl:true }).setView(ll, 17);
      CS.tiles(dMap);
      L.circleMarker(ll, { radius:9, color:'#fff', weight:3, fillColor:'#1F7A3A', fillOpacity:1 }).addTo(dMap);
      setTimeout(() => dMap && dMap.invalidateSize(), 60);
    }
  }

  /* ═════════ Hash: #n=<number> opens a report (links can be shared between staff) ═════════ */
  function fromHash() {
    const m = /^#n=(\d{1,12})$/.exec(location.hash);
    if (m) openDetail(+m[1]); else if (openNumber !== null) closeDetail();
  }
  addEventListener('hashchange', fromHash);

  /* ═════════ Language and refresh ═════════ */
  document.addEventListener('cs:lang', () => {
    document.title = CS.t('docTitle') + ' · CallSliven';
    if (!sb) return;
    renderTiles(); renderFilters(); renderList(); renderDetail();
    if (alertKey) $('#alert .alert-text').textContent = CS.t(alertKey);
  });
  $('#refresh').addEventListener('click', async () => {
    const b = $('#refresh'); b.disabled = true;
    await Promise.all([loadCounts(), loadList(true)]);
    if (openNumber !== null) await openDetail(openNumber);
    b.disabled = false;
  });

  /* ═════════ Start: only staff with a second factor (ADM-1) ═════════ */
  CS.start();
  document.title = CS.t('docTitle') + ' · CallSliven';
  CS.requireUser().then(async ctx => {
    if (!ctx) return;
    const role = ctx.profile && ctx.profile.role;
    if (role !== 'admin' && role !== 'super_admin') { $('#denied').hidden = false; $('#refresh').hidden = true; return; }
    const { data:aal } = await ctx.sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (!aal || aal.currentLevel !== 'aal2') {
      // has a factor → enter the code on the log-in page; no factor yet → set it up
      location.href = aal && aal.nextLevel === 'aal2' ? 'auth.html?next=admin.html#login' : 'mfa-setup.html';
      return;
    }
    sb = ctx.sb;
    $('#panel').hidden = false;
    const [c, s, i] = await Promise.all([
      sb.from('categories').select('id, name, sort_order').order('sort_order').order('name'),
      sb.from('subcategories').select('id, category_id, name, sort_order').order('sort_order').order('name'),
      sb.from('institutions').select('id, name, email, real_send, active').order('name')
    ]);
    cats = c.data || []; subs = s.data || []; insts = i.data || [];
    if (i.error) console.warn('[CallSliven] institutions (migration 021 applied?):', i.error);
    renderTiles(); renderFilters();
    await Promise.all([loadCounts(), loadList(true)]);
    fromHash();
    setInterval(() => { if (!document.hidden) loadCounts(); }, 60000);   // the counters stay fresh while the page is open
  });
})();