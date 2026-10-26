/* CallSliven — profile page (AUTH-9). The citizen changes first name, last name and phone.
   Migration 006 lets a logged-in user update only these three columns of their own row. */
(() => {
  const { $, $$ } = CS;

  CS.addStrings({
    bg: {
      pTitle:'Моят <em>профил</em>',
      pLead:'Името ти виждат само администраторите на общината. Телефонът не е публичен и не се изпраща на институциите.',
      firstName:'Име', lastName:'Фамилия', phone:'Телефон', optional:'по желание', email:'Имейл',
      phoneHint:'Ползва се само ако общината трябва да се свърже с теб. Остави полето празно, за да го изтриеш.',
      emailHint:'Смяната на имейла ще бъде добавена скоро.',
      save:'Запази промените', undo:'Отказ', saved:'Промените са запазени',
      since:'Профил от', consentT:'Съгласие с политиката', consentV:(v, d) => `версия ${v}, ${d}`, none:'—',
      eRequired:'Попълни това поле.', eName:'Само букви от една азбука (кирилица или латиница), поне 2.', ePhone:'Въведи български номер, напр. +359 88 123 4567.',
      eSave:'Промените не бяха запазени. Опитай отново.', eNetwork:'Няма връзка със сървъра. Опитай отново.', eLoad:'Профилът не се зареди. Презареди страницата.',
      docTitle:'Профил'
    },
    en: {
      pTitle:'My <em>profile</em>',
      pLead:'Only municipal administrators see your name. Your phone is not public and is not sent to institutions.',
      firstName:'First name', lastName:'Last name', phone:'Phone', optional:'optional', email:'Email',
      phoneHint:'Used only if the municipality needs to contact you. Leave it empty to delete it.',
      emailHint:'Changing your email will be added soon.',
      save:'Save changes', undo:'Cancel', saved:'Changes saved',
      since:'Profile since', consentT:'Privacy policy consent', consentV:(v, d) => `version ${v}, ${d}`, none:'—',
      eRequired:'Fill in this field.', eName:'Letters of one alphabet only (Cyrillic or Latin), at least 2.', ePhone:'Enter a Bulgarian number, e.g. +359 88 123 4567.',
      eSave:"Your changes weren't saved. Try again.", eNetwork:'No connection to the server. Try again.', eLoad:"Your profile didn't load. Reload the page.",
      docTitle:'Profile'
    }
  });

  // same rules as the database (migration 022): 2–60 letters, space, ' ’ -, one alphabet only
  const reName = /^\p{L}[\p{L} '’-]{1,59}$/u;
  const mixedScript = v => /[Ѐ-ӿ]/.test(v) && /[A-Za-z]/.test(v);
  // only plain spaces or dashes between the digits (the database rejects tabs and other blanks)
  const rePhone = /^(\+359|0) ?\d{2,3}[ -]?\d{2,3}[ -]?\d{2,4}$/;
  const fields = { first_name:$('#p-first'), last_name:$('#p-last'), phone:$('#p-phone') };
  const form = $('#form-profile'), saveBtn = $('#save'), resetBtn = $('#reset'), alertEl = $('#alert');
  let ctx = null, original = {}, alertKey = null;

  const ERR_ICO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>';
  function check(input) {
    const v = input.value.trim();
    if (input.dataset.rule === 'name') return !v ? 'eRequired' : reName.test(v) && !mixedScript(v) ? '' : 'eName';
    if (input.dataset.rule === 'phone') return !v || rePhone.test(v) ? '' : 'ePhone';
    return '';
  }
  function setError(input, key) {
    const field = input.closest('.field');
    field.classList.toggle('invalid', !!key);
    field._err = key || null;
    const err = $('.err', field);
    err.innerHTML = key ? ERR_ICO : '';
    if (key) err.append(CS.t(key));
    input.setAttribute('aria-invalid', !!key);
  }
  const values = () => ({
    first_name: fields.first_name.value.trim(),
    last_name: fields.last_name.value.trim(),
    phone: fields.phone.value.trim() || null
  });
  function refreshDirty() {
    const v = values();
    let dirty = false;
    for (const k in fields) {
      const changed = (v[k] || '') !== (original[k] || '');
      fields[k].closest('.field').classList.toggle('changed', changed);
      if (changed) dirty = true;
    }
    saveBtn.disabled = !dirty;
    resetBtn.hidden = !dirty;
  }
  function showAlert(key) { alertKey = key; $('.alert-text', alertEl).textContent = CS.t(key); alertEl.classList.add('show'); }
  function hideAlert() { alertKey = null; alertEl.classList.remove('show'); }
  let toastTimer;
  function toast(key) {
    const el = $('#toast'); el.textContent = CS.t(key); el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  Object.values(fields).forEach(input => {
    input.addEventListener('input', () => {
      if (input.closest('.field').classList.contains('invalid')) setError(input, check(input));
      hideAlert(); refreshDirty();
    });
    input.addEventListener('blur', () => { if (input.value) setError(input, check(input)); });
  });

  function fill(p) {
    original = { first_name:p.first_name || '', last_name:p.last_name || '', phone:p.phone || '' };
    for (const k in fields) { fields[k].value = original[k]; setError(fields[k], ''); }
    refreshDirty();
  }
  resetBtn.addEventListener('click', () => { fill(original); hideAlert(); });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    hideAlert();
    let first = null;
    Object.values(fields).forEach(input => { const k = check(input); setError(input, k); if (k && !first) first = input; });
    if (first) {
      const f = first.closest('.field'); f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake');
      return first.focus();
    }
    const v = values();
    saveBtn.classList.add('loading'); saveBtn.disabled = true;
    let res;
    try {
      res = await ctx.sb.from('profiles').update(v).eq('id', ctx.user.id)
        .select('first_name, last_name, phone').maybeSingle();
    } catch (err) { res = { error:{ network:true } }; }
    saveBtn.classList.remove('loading');
    if (res.error || !res.data) {
      console.warn('[CallSliven] profile update:', res.error);
      refreshDirty();
      return showAlert(res.error && res.error.network ? 'eNetwork' : 'eSave');
    }
    fill(res.data);
    CS.renderUser({ ...CS.user, firstName:res.data.first_name, lastName:res.data.last_name });
    toast('saved');
  });

  $('#logout').addEventListener('click', CS.logout);

  function renderMeta() {
    if (!ctx || !ctx.profile) return;
    const p = ctx.profile;
    $('#m-since').textContent = p.created_at ? CS.date(new Date(p.created_at)) : CS.t('none');
    $('#m-consent').textContent = p.consent_version
      ? CS.t('consentV')(p.consent_version, p.consent_at ? CS.date(new Date(p.consent_at)) : '')
      : CS.t('none');
  }
  document.addEventListener('cs:lang', () => {
    document.title = CS.t('docTitle') + ' · CallSliven';
    renderMeta();
    $$('.field.invalid').forEach(f => { if (f._err) setError($('input', f), f._err); });
    if (alertKey) $('.alert-text', alertEl).textContent = CS.t(alertKey);
  });

  CS.start();
  document.title = CS.t('docTitle') + ' · CallSliven';

  CS.requireUser().then(c => {
    if (!c) return;                       // requireUser already sends the visitor to log in
    ctx = c;
    $('#loading').hidden = true;
    $('#card').setAttribute('aria-busy', 'false');
    if (!c.profile) return showAlert('eLoad'), (form.hidden = false);
    $('#p-email').textContent = c.user.email || '';
    fill(c.profile);
    renderMeta();
    form.hidden = false;
    $('#meta').hidden = false;
  });
})();