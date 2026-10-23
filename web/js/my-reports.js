/* CallSliven — my reports (MY-1…4).
   MY-1 list with status and "changed since your last visit"   MY-2 withdraw while no administrator has acted (withdraw_report)
   MY-3 reason for rejection                                    MY-4 timeline of the main report when mine is a duplicate
   All reads go through RLS: report_private (own rows), reports and report_events of reports I can see. */
(() => {
  const { $, $$ } = CS;

  CS.addStrings({
    bg: {
      mTitle:'Моите <em>сигнали</em>', lead:n => n ? `${n} ${n === 1 ? 'сигнал' : 'сигнала'}` : '',
      fAll:'Всички', fOpen:'Активни', fDone:'Приключени',
      s_new:'Нов', s_sent:'Изпратен', s_in_progress:'В обработка', s_resolved:'Решен', s_closed:'Затворен', s_rejected:'Отхвърлен', s_withdrawn:'Оттеглен', s_review:'Чака проверка',
      changed:'Има промяна', submitted:d => `Подаден ${d}`, updated:d => `Последна промяна ${d}`, place:'Място',
      timeline:'Хронология', review:'Чака проверка от администратор', reviewX:'Още не е публичен, защото текстът съдържа лични данни или линк. След проверката ще се появи на картата.',
      rejectT:'Причина за отхвърляне', r_insufficient_info:'Недостатъчна информация', r_out_of_scope:'Извън компетенциите на общината', r_inappropriate:'Неприемливо съдържание', r_spam:'Спам',
      dupT:n => `Свързан със сигнал №${n}`, dupX:'Същият проблем вече е подаден. Следи хронологията на основния сигнал:',
      withdraw:'Оттегли сигнала', withdrawQ:'Сигурен ли си? Оттегленият сигнал не може да се върне.', yes:'Да, оттегли', no:'Отказ',
      withdrawn:'Сигналът е оттеглен', eWithdraw:'Сигналът вече не може да бъде оттеглен, защото администратор е започнал работа по него.',
      eLoad:'Сигналите не се заредиха. Презареди страницата.', eNetwork:'Няма връзка със сървъра. Опитай отново.',
      emptyT:'Още нямаш сигнали', emptyX:'Видиш ли проблем в града, подай сигнал. Тук ще следиш какво се случва с него.',
      emptyFT:'Няма сигнали тук', emptyFX:'Опитай другия раздел.', docTitle:'Моите сигнали'
    },
    en: {
      mTitle:'My <em>reports</em>', lead:n => n ? `${n} ${n === 1 ? 'report' : 'reports'}` : '',
      fAll:'All', fOpen:'Active', fDone:'Closed',
      s_new:'New', s_sent:'Sent', s_in_progress:'In progress', s_resolved:'Resolved', s_closed:'Closed', s_rejected:'Rejected', s_withdrawn:'Withdrawn', s_review:'Awaiting review',
      changed:'Updated', submitted:d => `Submitted ${d}`, updated:d => `Last change ${d}`, place:'Place',
      timeline:'Timeline', review:'Awaiting review by an administrator', reviewX:"Not public yet, because the text contains personal data or a link. After the review it will appear on the map.",
      rejectT:'Reason for rejection', r_insufficient_info:'Not enough information', r_out_of_scope:"Outside the municipality's competence", r_inappropriate:'Inappropriate content', r_spam:'Spam',
      dupT:n => `Linked to report #${n}`, dupX:'The same problem was already reported. Follow the main report:',
      withdraw:'Withdraw report', withdrawQ:"Are you sure? A withdrawn report can't be restored.", yes:'Yes, withdraw', no:'Cancel',
      withdrawn:'Report withdrawn', eWithdraw:'This report can no longer be withdrawn, because an administrator has started working on it.',
      eLoad:"Your reports didn't load. Reload the page.", eNetwork:'No connection to the server. Try again.',
      emptyT:'No reports yet', emptyX:"See a problem in the city? Submit a report and follow what happens to it here.",
      emptyFT:'Nothing here', emptyFX:'Try the other tab.', docTitle:'My reports'
    }
  });

  const OPEN = ['new', 'sent', 'in_progress'];
  let ctx = null, items = [], filter = 'all', seenBefore = 0, openId = null;

  const fmt = iso => {
    const d = new Date(iso);
    return d.toLocaleDateString(CS.lang === 'bg' ? 'bg-BG' : 'en-GB', { day:'numeric', month:'long', year:'numeric' }) + ', ' +
           d.toLocaleTimeString(CS.lang === 'bg' ? 'bg-BG' : 'en-GB', { hour:'2-digit', minute:'2-digit' });
  };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const pill = (status, review) => el('span', 'pill p-' + (review ? 'review' : status), CS.t(review ? 's_review' : 's_' + status));
  let alertKey = null;
  function showAlert(k) { alertKey = k; $('#alert .alert-text').textContent = CS.t(k); $('#alert').classList.add('show'); }
  let toastT;
  function toast(k) { const t = $('#toast'); t.textContent = CS.t(k); t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }

  /* ═════════ Load ═════════ */
  async function load() {
    const sb = ctx.sb, uid = ctx.user.id;
    // own rows only: staff could read everyone's through RLS, so the filter is explicit
    const priv = await sb.from('report_private')
      .select('report_id, original_title, original_description, exact_address, reject_reason, reject_note, created_at')
      .eq('user_id', uid).order('created_at', { ascending:false }).limit(200);
    if (priv.error) throw priv.error;
    if (!priv.data.length) return [];
    const ids = priv.data.map(p => p.report_id);
    const rep = await sb.from('reports').select('id, number, status, needs_review, duplicate_of, subcategory_id, public_address, updated_at').in('id', ids);
    if (rep.error) throw rep.error;
    const dupIds = [...new Set(rep.data.map(r => r.duplicate_of).filter(Boolean))];
    const [masters, events, subs, cats] = await Promise.all([
      dupIds.length ? sb.from('reports').select('id, number, status').in('id', dupIds) : { data:[] },
      sb.from('report_events').select('report_id, status, note, created_at').in('report_id', [...ids, ...dupIds]).order('created_at'),
      sb.from('subcategories').select('id, category_id, name'),
      sb.from('categories').select('id, name')
    ]);
    const byId = Object.fromEntries(rep.data.map(r => [r.id, r]));
    const ev = {};
    (events.data || []).forEach(e => (ev[e.report_id] = ev[e.report_id] || []).push(e));
    const sub = Object.fromEntries((subs.data || []).map(s => [s.id, s]));
    const cat = Object.fromEntries((cats.data || []).map(c => [c.id, c]));
    const master = Object.fromEntries((masters.data || []).map(m => [m.id, m]));
    return priv.data.filter(p => byId[p.report_id]).map(p => {
      const r = byId[p.report_id], s = sub[r.subcategory_id];
      const evs = ev[r.id] || [];
      const last = evs.length ? evs[evs.length - 1].created_at : p.created_at;
      const m = r.duplicate_of ? master[r.duplicate_of] : null;
      const mLast = m && ev[m.id] && ev[m.id].length ? ev[m.id][ev[m.id].length - 1].created_at : null;
      const lastChange = [last, mLast].filter(Boolean).sort().pop();
      return {
        id:r.id, number:r.number, status:r.status, review:r.needs_review && r.status === 'new',
        title:p.original_title, desc:p.original_description, address:p.exact_address || r.public_address,
        cat:s && cat[s.category_id] ? cat[s.category_id].name : '', sub:s ? s.name : '',
        created:p.created_at, lastChange, events:evs,
        reject:r.status === 'rejected' ? { reason:p.reject_reason, note:p.reject_note } : null,
        master:m ? { number:m.number, status:m.status, events:ev[m.id] || [] } : null,
        // a status change after the report was made, and after this browser last opened the page
        changed:!!seenBefore && new Date(lastChange).getTime() > seenBefore && new Date(lastChange) - new Date(p.created_at) > 2000
      };
    });
  }

  /* ═════════ Render ═════════ */
  function render() {
    const counts = { all:items.length, open:items.filter(i => OPEN.includes(i.status)).length };
    counts.done = counts.all - counts.open;
    Object.entries(counts).forEach(([k, n]) => { $('#n-' + k).textContent = n; });
    $('#lead').textContent = CS.t('lead')(items.length);
    const shown = items.filter(i => filter === 'all' || (filter === 'open') === OPEN.includes(i.status));
    const list = $('#list'); list.innerHTML = '';
    shown.forEach((it, n) => list.append(card(it, n)));
    const empty = !shown.length;
    $('#empty').hidden = !empty;
    if (empty) {
      $('#empty-title').textContent = CS.t(items.length ? 'emptyFT' : 'emptyT');
      $('#empty-text').textContent = CS.t(items.length ? 'emptyFX' : 'emptyX');
      $('#empty .btn').hidden = !!items.length;
    }
  }

  function timeline(events) {
    const ol = el('ol', 'tl');
    events.forEach(e => {
      const li = el('li');
      li.append(pill(e.status), el('time', null, fmt(e.created_at)));
      if (e.note) li.append(el('span', 'tl-note', e.note));
      ol.append(li);
    });
    return ol;
  }

  function card(it, n) {
    const li = el('li', 'mr' + (it.changed ? ' changed' : '') + (openId === it.id ? ' open' : ''));
    li.style.setProperty('--i', Math.min(n, 8));
    const head = el('button', 'mr-head'); head.type = 'button'; head.setAttribute('aria-expanded', openId === it.id);
    head.append(el('span', 'mr-num', '№' + it.number), el('h2', 'mr-title', it.title), el('span', 'mr-sub', [it.cat, it.sub].filter(Boolean).join(' · ')));
    const right = el('span', 'mr-right');
    if (it.changed) right.append(el('span', 'badge-new', CS.t('changed')));
    right.append(pill(it.status, it.review));
    right.insertAdjacentHTML('beforeend', '<svg class="mr-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>');
    head.append(right);
    head.addEventListener('click', () => { openId = openId === it.id ? null : it.id; render(); });
    li.append(head);

    const body = el('div', 'mr-body');
    body.append(el('p', 'mr-desc', it.desc));
    const meta = el('div', 'mr-meta');
    meta.append(el('span', null, CS.t('submitted')(fmt(it.created))));
    if (it.lastChange !== it.created) meta.append(el('span', null, CS.t('updated')(fmt(it.lastChange))));
    if (it.address) meta.append(el('span', null, CS.t('place') + ': ' + it.address));
    body.append(meta);

    if (it.review) { const b = el('div', 'box review'); b.append(el('b', null, CS.t('review')), el('span', null, CS.t('reviewX'))); body.append(b); }
    if (it.reject) {                                                          // MY-3
      const b = el('div', 'box reject');
      b.append(el('b', null, CS.t('rejectT')), el('span', null, CS.t('r_' + it.reject.reason) || it.reject.reason || ''));
      if (it.reject.note) b.append(el('p', null, it.reject.note));
      body.append(b);
    }
    if (it.master) {                                                          // MY-4
      const b = el('div', 'box dup');
      b.append(el('b', null, CS.t('dupT')(it.master.number)), el('p', null, CS.t('dupX')), timeline(it.master.events));
      body.append(b);
    } else if (it.events.length) {
      body.append(el('span', 'tl-h', CS.t('timeline')), timeline(it.events));
    }

    if (it.status === 'new' && !it.master) {                                                // MY-2: the server decides; the button only shows while status is "new"
      const actions = el('div', 'mr-actions');
      const w = el('button', 'btn btn-outline', CS.t('withdraw')); w.type = 'button';
      w.addEventListener('click', () => {
        actions.innerHTML = '';
        const c = el('div', 'confirm'); c.append(el('span', null, CS.t('withdrawQ')));
        const yes = el('button', 'btn btn-danger', CS.t('yes')); yes.type = 'button';
        const no = el('button', 'btn btn-ghost', CS.t('no')); no.type = 'button';
        no.addEventListener('click', render);
        yes.addEventListener('click', async () => {
          yes.disabled = no.disabled = true;
          const { error } = await ctx.sb.rpc('withdraw_report', { p_report_id:it.id });
          if (error) {
            console.warn('[CallSliven] withdraw_report:', error);
            showAlert(error.message && /fetch|network/i.test(error.message) ? 'eNetwork' : 'eWithdraw');
            return render();
          }
          toast('withdrawn');
          await refresh();
        });
        c.append(yes, no); actions.append(c); yes.focus();
      });
      actions.append(w); body.append(actions);
    }
    li.append(body);
    return li;
  }

  /* ═════════ Tabs ═════════ */
  $$('#tabs button').forEach(b => b.addEventListener('click', () => {
    filter = b.dataset.f;
    $$('#tabs button').forEach(x => x.setAttribute('aria-selected', x === b));
    render();
  }));

  async function refresh() {
    try { items = await load(); $('#alert').classList.remove('show'); alertKey = null; }
    catch (e) { console.warn('[CallSliven] my reports:', e); showAlert('eLoad'); }
    $('#loading').hidden = true;
    render();
  }

  document.addEventListener('cs:lang', () => {
    document.title = CS.t('docTitle') + ' · CallSliven';
    if (ctx) render();
    if (alertKey) $('#alert .alert-text').textContent = CS.t(alertKey);
  });

  CS.start();
  document.title = CS.t('docTitle') + ' · CallSliven';
  CS.requireUser().then(async c => {
    if (!c) return;
    ctx = c;
    // MY-1: "changed" = a new event since this browser last opened the page
    const key = 'cs_my_seen_' + c.user.id;
    try { seenBefore = +localStorage.getItem(key) || 0; } catch (e) {}
    await refresh();
    try { localStorage.setItem(key, String(Date.now())); } catch (e) {}
  });
})();
