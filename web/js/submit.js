/* CallSliven — submit a report (MVP SUB-1…17).
   1. category → subcategory (from the database: default_priority, requires_photo, hide_exact_address)
   2. place on the map: click, drag or GPS with an accuracy circle; confirmation is required; nearby duplicates
   3. title, description and up to 3 photos (shrunk in the browser, uploaded to tmp/<user>/<key>/)
   4. review, Turnstile, then the Edge Function submit-report does all checks on the server.
   What the visitor typed is kept in sessionStorage (not the photos). */
(() => {
  const { $, $$ } = CS;
  const cfg = window.CS_CONFIG || {};

  /* ═════════ Rules (same numbers as the server) ═════════ */
  const TITLE_MIN = 5, TITLE_MAX = 100, DESC_MIN = 20, DESC_MAX = 2000;
  const MAX_PHOTOS = 3, MAX_BYTES = 5 * 1024 * 1024, MAX_SIDE = 2560;
  const TYPES = { 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp' };
  const CENTER = [42.6824, 26.3229];                          // Sliven centre
  const AREA = [[42.30, 25.75], [42.95, 26.85]];               // a little wider than the municipality; the exact border is checked on the server
  const DRAFT_KEY = 'cs_submit_draft', KEY_TTL = 24 * 3600e3;  // SUB-13: one key per form, valid 24 h

  CS.addStrings({
    bg: {
      sTitle:'Подай <em>сигнал</em>', sLead:'Четири кратки стъпки. Името и контактите ти не се публикуват.',
      st1:'Проблем', st2:'Място', st3:'Описание', st4:'Изпращане',
      q1:'Какъв е проблемът?', q1b:'Уточни', q2:'Къде е?', q3:'Опиши проблема', q4:'Провери и изпрати',
      next:'Напред', back:'Назад', send:'Изпрати сигнала',
      tPhoto:'нужна е снимка', tHidden:'точното място не се публикува',
      n112t:'Има ли опасност за хора в момента?', n112d:'Звънни на 112. Сигналът тук не стига веднага до спешните служби.',
      mapHint:'Кликни на картата или премести маркера точно на мястото на проблема.', gps:'Моето местоположение', gpsBusy:'Търся…',
      accuracy:m => `точност ±${m} м`, hideNote:'За тази категория публично се показват само улицата или кварталът, не точното място.',
      confirm:'Потвърждавам, че маркерът е на мястото на проблема.',
      dupT:'Наблизо вече има подобни сигнали', dupD:'Ако е същият проблем, не е нужно да подаваш нов. Можеш да го следиш оттук.', meters:m => `${m} м`,
      fTitle:'Заглавие', fDesc:'Описание', fPhotos:'Снимки', optional:'по желание', required:'задължително за тази категория',
      titlePh:'напр. Дупка на пешеходна пътека', descPh:'Какво точно виждаш, откога е и защо е опасно или неудобно.',
      piiHint:'Не пиши телефони, имейли, ЕГН или регистрационни номера — те се махат автоматично от публичния текст и сигналът отива за проверка.',
      addPhoto:'Добави снимка', photoRules:'До 3 · JPG, PNG или WebP · до 5 MB', photoPrivate:'Снимките не се публикуват. Вижда ги само общината и отговорната институция.',
      remove:'Махни снимката', count:(n, max) => `${n}/${max}`,
      sumCat:'Категория', sumPlace:'Място', sumTitle:'Заглавие', sumDesc:'Описание', sumPhotos:'Снимки', edit:'промени', noPhotos:'няма',
      pUpload:(i, n) => `Качвам снимка ${i} от ${n}…`, pSend:'Изпращам сигнала…',
      doneT:n => `Сигнал №${n} е приет`, doneX:'Ще го видиш публично на картата. Ще получиш имейл, ако бъде отхвърлен.',
      doneReview:'Сигналът ще се появи публично след проверка от администратор, защото текстът съдържа лични данни или линк.',
      donePhotos:n => n === 1 ? '1 снимка не беше приета (не е валидно изображение).' : `${n} снимки не бяха приети (не са валидни изображения).`,
      again:'Подай нов сигнал', toProfile:'Към профила',
      eCat:'Избери категория и подкатегория.', ePlace:'Сложи маркер на картата.', eConfirm:'Потвърди мястото.',
      eTitle:`Заглавието трябва да е между ${TITLE_MIN} и ${TITLE_MAX} символа.`, eDesc:`Описанието трябва да е между ${DESC_MIN} и ${DESC_MAX} символа.`,
      ePhotoReq:'За тази категория е нужна поне една снимка.', ePhotoType:n => `„${n}“ не е JPG, PNG или WebP. На iPhone избери Настройки → Камера → Формати → „Най-съвместим“.`,
      ePhotoBig:n => `„${n}“ е над 5 MB и не може да се смали достатъчно.`, ePhotoMax:'Може най-много 3 снимки.', ePhotoRead:n => `„${n}“ не може да се отвори.`,
      eGpsOff:'Браузърът не дава достъп до местоположението. Сложи маркера на ръка.', eGpsInsecure:'Местоположението работи само през https или localhost. Сложи маркера на ръка.',
      eGpsFar:'Местоположението ти е извън община Сливен. Сложи маркера на ръка.',
      eCaptcha:'Потвърди, че не си робот.', eCaptchaLoad:'Проверката срещу ботове не се зареди. Изключи блокера на реклами или презареди страницата.',
      e_captcha_failed:'Проверката срещу ботове не мина. Опитай отново.', e_captcha_unavailable:'Проверката срещу ботове временно не работи. Опитай след минута.',
      e_rate_limited:'Подаде много сигнали за кратко време. Нов профил може 3 сигнала за първите 24 часа, после до 5 на час и 20 на ден.',
      e_outside_municipality:'Мястото е извън община Сливен. Премести маркера.', e_photo_required:'За тази категория е нужна поне една снимка.',
      e_invalid_photo:'Някоя от снимките не е валидно изображение. Махни я и опитай пак.', e_invalid_title:`Заглавието трябва да е между ${TITLE_MIN} и ${TITLE_MAX} символа.`,
      e_invalid_description:`Описанието трябва да е между ${DESC_MIN} и ${DESC_MAX} символа.`, e_invalid_location:'Мястото не е валидно. Сложи маркера отново.',
      e_invalid_subcategory:'Тази подкатегория вече не е налична. Избери друга.',
      e_account_restricted:'Профилът ти е временно ограничен и не може да подава сигнали.', e_account_inactive:'Профилът ти е деактивиран.',
      e_profile_not_found:'Профилът ти не е намерен. Излез и влез отново.', e_unauthorized:'Сесията изтече. Влез отново.',
      e_upload_limit:'Достигна лимита за снимки: до 10 на час (за нов профил 5 на час и 9 за денонощие).', e_upload:'Снимката не се качи. Опитай отново.',
      eNetwork:'Няма връзка със сървъра. Провери интернета си и опитай отново.', eGeneric:c => `Нещо се обърка (${c}). Опитай отново.`,
      eLoad:'Категориите не се заредиха. Презареди страницата.', restricted:d => `Профилът ти е ограничен до ${d} и не може да подава сигнали.`,
      docTitle:'Подай сигнал'
    },
    en: {
      sTitle:'Submit a <em>report</em>', sLead:'Four short steps. Your name and contacts are not published.',
      st1:'Problem', st2:'Place', st3:'Description', st4:'Send',
      q1:"What's the problem?", q1b:'Be more specific', q2:'Where is it?', q3:'Describe the problem', q4:'Check and send',
      next:'Next', back:'Back', send:'Send the report',
      tPhoto:'photo needed', tHidden:'exact place not published',
      n112t:'Is anyone in danger right now?', n112d:"Call 112. A report here doesn't reach the emergency services straight away.",
      mapHint:'Click on the map or drag the marker to the exact place of the problem.', gps:'My location', gpsBusy:'Locating…',
      accuracy:m => `accuracy ±${m} m`, hideNote:'For this category only the street or neighbourhood is shown publicly, not the exact place.',
      confirm:'I confirm the marker is at the place of the problem.',
      dupT:'There are similar reports nearby', dupD:"If it's the same problem, you don't need a new report. You can follow it here.", meters:m => `${m} m`,
      fTitle:'Title', fDesc:'Description', fPhotos:'Photos', optional:'optional', required:'required for this category',
      titlePh:'e.g. Pothole on a zebra crossing', descPh:"What exactly you see, since when, and why it's dangerous or inconvenient.",
      piiHint:"Don't write phone numbers, emails, ID numbers or number plates — they are removed from the public text and the report goes for review.",
      addPhoto:'Add a photo', photoRules:'Up to 3 · JPG, PNG or WebP · up to 5 MB', photoPrivate:'Photos are not published. Only the municipality and the responsible institution see them.',
      remove:'Remove photo', count:(n, max) => `${n}/${max}`,
      sumCat:'Category', sumPlace:'Place', sumTitle:'Title', sumDesc:'Description', sumPhotos:'Photos', edit:'edit', noPhotos:'none',
      pUpload:(i, n) => `Uploading photo ${i} of ${n}…`, pSend:'Sending the report…',
      doneT:n => `Report #${n} received`, doneX:"You'll see it publicly on the map. You'll get an email if it is rejected.",
      doneReview:'The report will appear publicly after an administrator reviews it, because the text contains personal data or a link.',
      donePhotos:n => n === 1 ? '1 photo was not accepted (not a valid image).' : `${n} photos were not accepted (not valid images).`,
      again:'Submit another report', toProfile:'Go to profile',
      eCat:'Choose a category and a subcategory.', ePlace:'Put a marker on the map.', eConfirm:'Confirm the place.',
      eTitle:`The title must be ${TITLE_MIN}–${TITLE_MAX} characters.`, eDesc:`The description must be ${DESC_MIN}–${DESC_MAX} characters.`,
      ePhotoReq:'This category needs at least one photo.', ePhotoType:n => `“${n}” is not JPG, PNG or WebP. On iPhone choose Settings → Camera → Formats → “Most Compatible”.`,
      ePhotoBig:n => `“${n}” is over 5 MB and can't be made small enough.`, ePhotoMax:'Up to 3 photos.', ePhotoRead:n => `“${n}” can't be opened.`,
      eGpsOff:"The browser doesn't share your location. Place the marker by hand.", eGpsInsecure:'Location works only over https or localhost. Place the marker by hand.',
      eGpsFar:'Your location is outside Sliven Municipality. Place the marker by hand.',
      eCaptcha:"Confirm that you're not a robot.", eCaptchaLoad:'The anti-bot check did not load. Turn off your ad blocker or reload the page.',
      e_captcha_failed:'The anti-bot check failed. Try again.', e_captcha_unavailable:'The anti-bot check is unavailable. Try again in a minute.',
      e_rate_limited:'You sent many reports in a short time. A new profile can send 3 in the first 24 hours, then up to 5 an hour and 20 a day.',
      e_outside_municipality:'This place is outside Sliven Municipality. Move the marker.', e_photo_required:'This category needs at least one photo.',
      e_invalid_photo:'One of the photos is not a valid image. Remove it and try again.', e_invalid_title:`The title must be ${TITLE_MIN}–${TITLE_MAX} characters.`,
      e_invalid_description:`The description must be ${DESC_MIN}–${DESC_MAX} characters.`, e_invalid_location:'The place is not valid. Put the marker again.',
      e_invalid_subcategory:'This subcategory is no longer available. Choose another.',
      e_account_restricted:'Your profile is temporarily restricted and cannot send reports.', e_account_inactive:'Your profile is deactivated.',
      e_profile_not_found:'Your profile was not found. Log out and in again.', e_unauthorized:'Your session expired. Log in again.',
      e_upload_limit:'You reached the photo limit: up to 10 an hour (a new profile 5 an hour and 9 a day).', e_upload:"The photo didn't upload. Try again.",
      eNetwork:'No connection to the server. Check your internet and try again.', eGeneric:c => `Something went wrong (${c}). Try again.`,
      eLoad:"Categories didn't load. Reload the page.", restricted:d => `Your profile is restricted until ${d} and cannot send reports.`,
      docTitle:'Submit a report'
    }
  });

  /* category icons by name (names come from the database) */
  const ICO = {
    'Пътища':'<path d="M8 3 4 21M16 3l4 18M12 4v2M12 10v3M12 17v3"/>',
    'Комунални услуги':'<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    'Околна среда':'<path d="M11 20A7 7 0 0 1 4 13c0-6 7-10 16-10 0 9-4 16-10 16"/><path d="M4 21c3-5 6-8 11-11"/>',
    'Животни':'<circle cx="5" cy="10" r="2"/><circle cx="9" cy="5" r="2"/><circle cx="15" cy="5" r="2"/><circle cx="19" cy="10" r="2"/><path d="M12 11c-3 0-6 4-6 7 0 2 2 3 3.5 2.5 1-.3 1.6-.8 2.5-.8s1.5.5 2.5.8C16 21 18 20 18 18c0-3-3-7-6-7z"/>',
    'Строителство':'<path d="M3 21h18M6 21V8l6-4 6 4v13M10 21v-5h4v5M10 11h4"/>',
    'Транспорт и ред':'<rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 11h16M8 21l1-3M16 21l-1-3"/>',
    'Безопасност':'<path d="M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6z"/><path d="M12 8v5M12 16h.01"/>',
    'Здраве и хигиена':'<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICO[name] || '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'}</svg>`;

  /* ═════════ State ═════════ */
  const uuid = () => {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  };
  let st = { step:1, cat:null, sub:null, lat:null, lng:null, confirmed:false, title:'', desc:'', key:uuid(), keyAt:Date.now() };
  try {
    const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null');
    if (d && d.key && Date.now() - d.keyAt < KEY_TTL) st = { ...st, ...d };
  } catch (e) {}
  const save = () => { try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(st)); } catch (e) {} };
  let ctx = null, cats = [], subs = [], photos = [];
  let uploaded = { sig:null, paths:[] };   // what is already in tmp/ for this form   // photos: [{ blob, type, name, url }]

  const sub = () => subs.find(s => s.id === st.sub);
  const cat = () => cats.find(c => c.id === st.cat);

  /* ═════════ Messages ═════════ */
  const ERR_ICO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>';
  function msg(key, arg) { const v = CS.t(key); return typeof v === 'function' ? v(arg) : (v === undefined ? CS.t('eGeneric')(key) : v); }
  function showAlert(el, key, arg) {
    el._k = key; el._a = arg;
    $('.alert-text', el).textContent = msg(key, arg);
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    el.scrollIntoView({ block:'nearest', behavior: CS.reduce ? 'auto' : 'smooth' });
  }
  function hideAlert(el) { el._k = null; el.classList.remove('show'); }
  function fieldErr(field, key, arg) {
    field.classList.toggle('invalid', !!key);
    field._k = key || null; field._a = arg;
    const e = $('.err', field);
    if (!e) return;
    e.innerHTML = key ? ERR_ICO : '';
    if (key) e.append(msg(key, arg));
  }
  function shake(el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
  let toastT;
  function toast(text) { const t = $('#toast'); t.textContent = text; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }

  /* ═════════ Steps ═════════ */
  function go(n, focus = true) {
    st.step = n; save();
    $$('.step').forEach(s => { s.hidden = +s.dataset.step !== n; });
    $('#done').hidden = true;
    $$('#stepper li').forEach(li => { const k = +li.dataset.s; li.classList.toggle('now', k === n); li.classList.toggle('past', k < n); });
    if (n === 2) setTimeout(initMap, 0);
    if (n === 4) { renderSummary(); captcha.mount(); }
    if (focus) {
      const card = $(`.step[data-step="${n}"]`);
      window.scrollTo({ top: Math.max(0, $('#stepper').getBoundingClientRect().top + scrollY - 90), behavior: CS.reduce ? 'auto' : 'smooth' });
      const h = $('h2', card); h.setAttribute('tabindex', '-1'); h.focus({ preventScroll:true });
    }
  }
  function validate(n) {
    if (n === 1) {
      if (!sub()) { showAlert($('#a1'), 'eCat'); return false; }
    }
    if (n === 2) {
      if (st.lat == null) { showAlert($('#a2'), 'ePlace'); return false; }
      if (!st.confirmed) { hideAlert($('#a2')); $('#confirm-field').classList.add('invalid'); shake($('#confirm-field')); return false; }
    }
    if (n === 3) {
      let ok = true;
      const t = $('#title').value.trim().replace(/\s+/g, ' '), d = $('#desc').value.trim();
      if (t.length < TITLE_MIN || t.length > TITLE_MAX) { fieldErr($('#title').closest('.field'), 'eTitle'); ok = false; }
      if (d.length < DESC_MIN || d.length > DESC_MAX) { fieldErr($('#desc').closest('.field'), 'eDesc'); ok = false; }
      if (sub() && sub().requires_photo && !photos.length) { fieldErr($('#photo-field'), 'ePhotoReq'); ok = false; }
      if (!ok) { const f = $('.step[data-step="3"] .field.invalid'); shake(f); const i = $('input, textarea', f); i && i.focus(); }
      return ok;
    }
    return true;
  }
  $$('[data-next]').forEach(b => b.addEventListener('click', () => { if (validate(st.step)) go(st.step + 1); }));
  $$('[data-back]').forEach(b => b.addEventListener('click', () => go(st.step - 1)));

  /* ═════════ 1. Category and subcategory ═════════ */
  function renderCats() {
    $('#cats').innerHTML = '';
    cats.forEach(c => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'cat'; b.setAttribute('role', 'radio'); b.dataset.id = c.id;
      b.setAttribute('aria-checked', c.id === st.cat);
      b.innerHTML = `<span class="cat-ico">${icon(c.name)}</span><span class="cat-name"></span>`;
      $('.cat-name', b).textContent = c.name;
      b.addEventListener('click', () => {
        if (st.cat !== c.id) { st.cat = c.id; st.sub = null; save(); }
        renderCats(); renderSubs(true);
      });
      $('#cats').append(b);
    });
  }
  function renderSubs(scroll) {
    const list = subs.filter(s => s.category_id === st.cat);
    $('#subs-wrap').hidden = !list.length;
    $('#subs').innerHTML = '';
    list.forEach(s => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'sub'; b.setAttribute('role', 'radio'); b.dataset.id = s.id;
      b.setAttribute('aria-checked', s.id === st.sub);
      b.innerHTML = '<span class="sub-name"></span><span class="tags"></span>';
      $('.sub-name', b).textContent = s.name;
      if (s.requires_photo) $('.tags', b).insertAdjacentHTML('beforeend', `<span class="tag photo">${CS.esc(CS.t('tPhoto'))}</span>`);
      if (s.hide_exact_address) $('.tags', b).insertAdjacentHTML('beforeend', `<span class="tag">${CS.esc(CS.t('tHidden'))}</span>`);
      b.addEventListener('click', () => { st.sub = s.id; save(); hideAlert($('#a1')); renderSubs(); renderFlags(); });
      $('#subs').append(b);
    });
    // single subcategory (e.g. "Друго"): pick it at once
    if (list.length === 1 && st.sub !== list[0].id) { st.sub = list[0].id; save(); return renderSubs(scroll); }
    renderFlags();
    if (scroll && list.length) $('#subs-wrap').scrollIntoView({ block:'nearest', behavior: CS.reduce ? 'auto' : 'smooth' });
  }
  // SUB-11 photo required, SUB-12 note for 112, SUB-17 hidden exact address
  function renderFlags() {
    const s = sub();
    $('#note-112').hidden = !(s && s.default_priority === 'critical');
    $('#hide-note').hidden = !(s && s.hide_exact_address);
    $('#photo-req').textContent = CS.t(s && s.requires_photo ? 'required' : 'optional');
    $('#photo-req').classList.toggle('req', !!(s && s.requires_photo));
  }

  /* ═════════ 2. Map ═════════ */
  let map = null, marker = null, accCircle = null;
  const pinIcon = () => L.divIcon({ className:'pick-wrap', html:'<span class="pick"></span>', iconSize:[40, 40], iconAnchor:[20, 48] });
  function initMap() {
    if (map) { map.invalidateSize(); return; }
    if (!window.L) return showAlert($('#a2'), 'eNetwork');
    map = L.map('map', { maxBounds:AREA, maxBoundsViscosity:0.8, minZoom:10 }).setView(st.lat != null ? [st.lat, st.lng] : CENTER, st.lat != null ? 17 : 14);
    CS.tiles(map);
    if (st.lat != null) placeMarker(st.lat, st.lng, false);
    map.on('click', e => placeMarker(e.latlng.lat, e.latlng.lng, true));
  }
  function placeMarker(lat, lng, moved) {
    st.lat = +lat.toFixed(6); st.lng = +lng.toFixed(6);
    if (moved) { st.confirmed = false; $('#confirm').checked = false; }
    save();
    if (!marker) {
      marker = L.marker([st.lat, st.lng], { draggable:true, icon:pinIcon(), keyboard:true, autoPan:true }).addTo(map);
      marker.on('dragend', () => { const p = marker.getLatLng(); if (accCircle) { accCircle.remove(); accCircle = null; } placeMarker(p.lat, p.lng, true); });
    } else marker.setLatLng([st.lat, st.lng]);
    hideAlert($('#a2'));
    renderCoords();
    checkNearby();
  }
  function renderCoords(acc) {
    $('#coords').textContent = st.lat == null ? '' : `${st.lat.toFixed(5)}, ${st.lng.toFixed(5)}` + (acc ? ' · ' + CS.t('accuracy')(Math.round(acc)) : '');
  }
  $('#gps').addEventListener('click', () => {
    if (!window.isSecureContext) return showAlert($('#a2'), 'eGpsInsecure');
    if (!navigator.geolocation) return showAlert($('#a2'), 'eGpsOff');
    const btn = $('#gps'), label = $('span', btn);
    btn.disabled = true; label.textContent = CS.t('gpsBusy');
    navigator.geolocation.getCurrentPosition(pos => {
      btn.disabled = false; label.textContent = CS.t('gps');
      const { latitude:lat, longitude:lng, accuracy } = pos.coords;
      if (!L.latLngBounds(AREA).contains([lat, lng])) return showAlert($('#a2'), 'eGpsFar');
      placeMarker(lat, lng, true);
      if (accCircle) accCircle.remove();
      accCircle = L.circle([lat, lng], { radius:accuracy, color:'#1F7A3A', weight:1.5, fillColor:'#3FAE5F', fillOpacity:.12, interactive:false }).addTo(map);
      map.fitBounds(accCircle.getBounds(), { maxZoom:18, padding:[30, 30] });
      renderCoords(accuracy);
    }, () => { btn.disabled = false; label.textContent = CS.t('gps'); showAlert($('#a2'), 'eGpsOff'); },
    { enableHighAccuracy:true, timeout:15000, maximumAge:30000 });
  });
  $('#confirm').addEventListener('change', e => { st.confirmed = e.target.checked; save(); $('#confirm-field').classList.remove('invalid'); });

  // SUB-10: nearby active public reports of the same category (find_nearby_reports, 50 m)
  let nearbyT = null, nearbySeq = 0;
  function checkNearby() {
    clearTimeout(nearbyT);
    if (st.lat == null || !st.sub || !ctx) { $('#dups').hidden = true; return; }
    nearbyT = setTimeout(async () => {
      const seq = ++nearbySeq;
      const { data, error } = await ctx.sb.rpc('find_nearby_reports', { p_lat:st.lat, p_lng:st.lng, p_subcategory_id:st.sub });
      if (seq !== nearbySeq) return;
      if (error || !data || !data.length) { $('#dups').hidden = true; return; }
      const ul = $('#dup-list'); ul.innerHTML = '';
      data.forEach(r => {
        // plain text until the public report page (report.html) is back in the site
        const li = document.createElement('li'), a = document.createElement('div');
        a.className = 'dup-item';
        a.textContent = `№${r.report_number} · ${r.report_title}`;
        const d = document.createElement('span'); d.textContent = CS.t('meters')(r.distance_m);
        a.append(d); li.append(a); ul.append(li);
      });
      $('#dups').hidden = false;
    }, 400);
  }

  /* ═════════ 3. Text and photos ═════════ */
  function counter(input, out, min, max) {
    const n = input.value.trim().length;
    out.textContent = CS.t('count')(n, max);
    out.classList.toggle('bad', n > 0 && (n < min || n > max));
  }
  const titleEl = $('#title'), descEl = $('#desc');
  titleEl.value = st.title; descEl.value = st.desc;
  [[titleEl, $('#title-count'), TITLE_MIN, TITLE_MAX, 'title'], [descEl, $('#desc-count'), DESC_MIN, DESC_MAX, 'desc']].forEach(([el, out, min, max, k]) => {
    counter(el, out, min, max);
    el.addEventListener('input', () => {
      st[k] = el.value; save(); counter(el, out, min, max);
      const f = el.closest('.field'); if (f.classList.contains('invalid')) fieldErr(f, null);
    });
  });

  // SUB-8: shrink in the browser (≤ 2560 px, JPEG 85 %). The server still checks the file and removes EXIF.
  async function prepare(file) {
    if (!TYPES[file.type]) throw { key:'ePhotoType', arg:file.name };
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation:'from-image' }); }
    catch (e) { throw { key:'ePhotoRead', arg:file.name }; }
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size <= 1.5 * 1024 * 1024) { bmp.close && bmp.close(); return { blob:file, type:file.type }; }
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close && bmp.close();
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
    if (blob && blob.size < file.size) return { blob, type:'image/jpeg' };
    if (file.size <= MAX_BYTES) return { blob:file, type:file.type };
    if (blob && blob.size <= MAX_BYTES) return { blob, type:'image/jpeg' };
    throw { key:'ePhotoBig', arg:file.name };
  }
  async function addFiles(list) {
    const field = $('#photo-field'); fieldErr(field, null);
    for (const file of list) {
      if (photos.length >= MAX_PHOTOS) { fieldErr(field, 'ePhotoMax'); break; }
      const slot = { id:uuid().slice(0, 8), name:file.name, busy:true, url:URL.createObjectURL(file) };
      photos.push(slot); renderPhotos();
      try {
        const p = await prepare(file);
        Object.assign(slot, p, { busy:false, size:p.blob.size });
        if (p.blob !== file) { URL.revokeObjectURL(slot.url); slot.url = URL.createObjectURL(p.blob); }
      } catch (e) {
        URL.revokeObjectURL(slot.url); photos = photos.filter(x => x !== slot);
        fieldErr(field, e.key || 'ePhotoRead', e.arg || file.name);
      }
      renderPhotos();
    }
  }
  function renderPhotos() {
    const box = $('#photos'); box.innerHTML = '';
    photos.forEach(p => {
      const d = document.createElement('div'); d.className = 'ph' + (p.busy ? ' busy' : '');
      const img = document.createElement('img'); img.src = p.url; img.alt = p.name; d.append(img);
      if (!p.busy) {
        d.insertAdjacentHTML('beforeend', `<span class="size">${p.size >= 1048576 ? (p.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(p.size / 1024)) + ' KB'}</span>`);
        const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'rm'; rm.setAttribute('aria-label', CS.t('remove'));
        rm.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
        rm.addEventListener('click', () => { URL.revokeObjectURL(p.url); photos = photos.filter(x => x !== p); renderPhotos(); fieldErr($('#photo-field'), null); });
        d.append(rm);
      }
      box.append(d);
    });
    $('#drop').hidden = photos.length >= MAX_PHOTOS;
  }
  $('#files').addEventListener('change', e => { addFiles([...e.target.files]); e.target.value = ''; });
  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, () => drop.classList.remove('over')));
  drop.addEventListener('drop', e => { e.preventDefault(); addFiles([...e.dataTransfer.files]); });

  /* ═════════ 4. Review ═════════ */
  function renderSummary() {
    const dl = $('#summary'); dl.innerHTML = '';
    const row = (label, value, step) => {
      const dt = document.createElement('dt'); dt.textContent = CS.t(label);
      const b = document.createElement('button'); b.type = 'button'; b.className = 'edit'; b.textContent = CS.t('edit');
      b.addEventListener('click', () => go(step)); dt.append(' ', b);
      const dd = document.createElement('dd'); dd.textContent = value;
      dl.append(dt, dd);
    };
    row('sumCat', `${cat() ? cat().name : ''} · ${sub() ? sub().name : ''}`, 1);
    row('sumPlace', st.lat != null ? `${st.lat.toFixed(5)}, ${st.lng.toFixed(5)}` : '', 2);
    row('sumTitle', titleEl.value.trim(), 3);
    row('sumDesc', descEl.value.trim(), 3);
    row('sumPhotos', photos.length ? String(photos.length) : CS.t('noPhotos'), 3);
  }

  /* Turnstile (rendered on step 4; a token works once) */
  const captcha = (() => {
    let ready = false, loading = false, failed = false, id = null, token = '';
    const field = () => $('#captcha').closest('.field');
    function render() {
      if (!ready || id !== null) return;
      id = turnstile.render($('#captcha'), {
        sitekey:cfg.TURNSTILE_SITE_KEY, language:CS.lang, theme:'light', size:'flexible',
        callback:t => { token = t; fieldErr(field(), null); },
        'expired-callback':() => { token = ''; }, 'error-callback':() => { token = ''; return false; }
      });
    }
    return {
      mount() {
        if (ready) return render();
        if (loading) return;
        loading = true;
        window.onTurnstileLoad = () => { ready = true; render(); };
        const s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad';
        s.async = true; s.onerror = () => { failed = true; fieldErr(field(), 'eCaptchaLoad'); };
        document.head.append(s);
      },
      token() { if (failed) { fieldErr(field(), 'eCaptchaLoad'); return ''; } if (!token) { fieldErr(field(), 'eCaptcha'); shake(field()); } return token; },
      reset() { token = ''; if (ready && id !== null) turnstile.reset(id); },
      relang() { if (ready && id !== null) { turnstile.remove(id); id = null; token = ''; if (st.step === 4) render(); } }
    };
  })();

  /* ═════════ Send ═════════ */
  const STEP_OF = { outside_municipality:2, invalid_location:2, photo_required:3, invalid_photo:3, invalid_title:3, invalid_description:3, invalid_subcategory:1 };
  let sending = false;
  $('#send').addEventListener('click', async () => {
    if (sending) return;
    hideAlert($('#a4'));
    for (const n of [1, 2, 3]) if (!validate(n)) return go(n);
    const tok = captcha.token(); if (!tok) return;
    const btn = $('#send'), prog = $('#progress');
    sending = true; btn.classList.add('loading'); btn.disabled = true;
    const done = () => { sending = false; btn.classList.remove('loading'); btn.disabled = false; prog.textContent = ''; };
    try {
      const { data: { session } } = await ctx.sb.auth.getSession();
      if (!session) { done(); return CS.requireUser(); }
      // photos first, into this form's own temporary folder (Storage rules allow only tmp/<my id>/<key>/)
      // A retry (e.g. after a failed anti-bot check) must not upload the same photos again:
      // every upload counts toward the hourly photo limit, and overwriting a file (upsert) is not allowed by the Storage rules.
      const ready = photos.filter(p => !p.busy);
      const folder = `tmp/${session.user.id}/${st.key}/`;
      const sig = folder + ready.map(p => p.id).join(',');
      let paths = uploaded.sig === sig ? uploaded.paths : null;
      if (!paths) {
        // the photo set changed, or the page was reloaded: clear this form's own temporary files, then upload once
        const old = [1, 2, 3].flatMap(n => Object.values(TYPES).map(ext => `${folder}${n}.${ext}`));
        await ctx.sb.storage.from('report-photos').remove(old).catch(() => {});
        paths = [];
        for (let i = 0; i < ready.length; i++) {
          prog.textContent = CS.t('pUpload')(i + 1, ready.length);
          const path = `${folder}${i + 1}.${TYPES[ready[i].type]}`;
          const up = await ctx.sb.storage.from('report-photos').upload(path, ready[i].blob, { contentType:ready[i].type, upsert:false });
          if (up.error) {
            console.warn('[CallSliven] photo upload:', up.error);
            uploaded = { sig:null, paths:[] };
            done();
            return showAlert($('#a4'), /row-level security|policy|403/i.test(up.error.message + (up.error.statusCode || '')) ? 'e_upload_limit' : 'e_upload');
          }
          paths.push(path);
        }
        uploaded = { sig, paths };
      }
      prog.textContent = CS.t('pSend');
      const res = await fetch(`${cfg.SUPABASE_URL}/functions/v1/submit-report`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer ' + session.access_token, 'apikey':cfg.SUPABASE_ANON_KEY },
        body:JSON.stringify({
          subcategory_id:st.sub, title:titleEl.value, description:descEl.value,
          lat:st.lat, lng:st.lng, idempotency_key:st.key, turnstile_token:tok, photo_paths:paths
        })
      });
      let body = {}; try { body = await res.json(); } catch (e) {}
      captcha.reset();
      done();
      if (res.status === 201) return finish(body);
      const code = body.code || ('http_' + res.status);
      console.warn('[CallSliven] submit-report:', res.status, body);
      if (code === 'unauthorized') return CS.requireUser();
      const step = STEP_OF[code];
      if (step && step !== 4) {
        go(step);
        if (step === 3 && (code === 'photo_required' || code === 'invalid_photo')) return fieldErr($('#photo-field'), 'e_' + code);
        return showAlert($('#a' + step), 'e_' + code);
      }
      showAlert($('#a4'), CS.t('e_' + code) !== undefined ? 'e_' + code : 'eGeneric', code);
    } catch (e) {
      console.warn('[CallSliven] submit:', e);
      captcha.reset(); done();
      showAlert($('#a4'), 'eNetwork');
    }
  });

  function finish(r) {
    try { sessionStorage.removeItem(DRAFT_KEY); } catch (e) {}
    photos.forEach(p => URL.revokeObjectURL(p.url));
    $$('.step').forEach(s => { s.hidden = true; });
    $$('#stepper li').forEach(li => { li.classList.remove('now'); li.classList.add('past'); });
    $('#done-title').textContent = CS.t('doneT')(r.number);
    $('#done-text').textContent = CS.t(r.needs_review ? 'doneReview' : 'doneX');
    $('#done-photos').hidden = !r.photos_failed;
    if (r.photos_failed) $('#done-photos').textContent = CS.t('donePhotos')(r.photos_failed);
    $('#done').hidden = false;
    window.scrollTo({ top:0, behavior: CS.reduce ? 'auto' : 'smooth' });
    $('#done h2').setAttribute('tabindex', '-1'); $('#done h2').focus({ preventScroll:true });
  }
  $('#again').addEventListener('click', () => {
    st = { step:1, cat:null, sub:null, lat:null, lng:null, confirmed:false, title:'', desc:'', key:uuid(), keyAt:Date.now() };
    photos = []; uploaded = { sig:null, paths:[] }; renderPhotos(); titleEl.value = ''; descEl.value = '';
    $('#confirm').checked = false; $('#dups').hidden = true;
    if (marker) { marker.remove(); marker = null; } if (accCircle) { accCircle.remove(); accCircle = null; }
    if (map) map.setView(CENTER, 14);
    renderCats(); renderSubs(); renderCoords(); save(); go(1);
  });

  /* ═════════ Language ═════════ */
  document.addEventListener('cs:lang', () => {
    document.title = CS.t('docTitle') + ' · CallSliven';
    if (cats.length) { renderCats(); renderSubs(); }
    renderPhotos(); renderCoords();
    [[titleEl, $('#title-count'), TITLE_MIN, TITLE_MAX], [descEl, $('#desc-count'), DESC_MIN, DESC_MAX]].forEach(a => counter(...a));
    $$('.alert.show').forEach(el => el._k && ($('.alert-text', el).textContent = msg(el._k, el._a)));
    $$('.field.invalid').forEach(f => f._k && fieldErr(f, f._k, f._a));
    if (st.step === 4) renderSummary();
    captcha.relang();
    if ($('#gps').disabled === false) $('span', $('#gps')).textContent = CS.t('gps');
  });

  /* ═════════ Start ═════════ */
  CS.start();
  document.title = CS.t('docTitle') + ' · CallSliven';
  $('#confirm').checked = st.confirmed;
  $$('.step').forEach(s => { s.hidden = true; });

  CS.requireUser().then(async c => {
    if (!c) return;
    ctx = c;
    const ru = c.profile && c.profile.restricted_until;
    if (ru && new Date(ru) > new Date()) {
      $('#stepper').hidden = true;
      return showAlert($('#blocked'), 'restricted', CS.date(new Date(ru)));
    }
    const [cr, sr] = await Promise.all([
      c.sb.from('categories').select('id, name, sort_order').order('sort_order').order('name'),
      c.sb.from('subcategories').select('id, category_id, name, default_priority, requires_photo, hide_exact_address, sort_order').order('sort_order').order('name')
    ]);
    $('#cat-loading').hidden = true;
    if (cr.error || sr.error || !cr.data.length) { go(1, false); return showAlert($('#a1'), 'eLoad'); }
    cats = cr.data; subs = sr.data;
    if (st.sub && !sub()) { st.sub = null; st.cat = null; }       // the saved choice no longer exists
    renderCats(); renderSubs();
    // a saved draft resumes where it was, but never past a step that isn't valid any more
    let n = Math.min(st.step || 1, 3);
    if (!sub()) n = 1; else if (n > 2 && (st.lat == null || !st.confirmed)) n = 2;
    go(n, false);
  });
})();
