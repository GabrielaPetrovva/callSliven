/* CallSliven — profile page.
   1) AUTH-9: the citizen changes first name, last name and phone.
      Migration 006 lets a logged-in user update only these three columns of their own row.
   2) Email change with Supabase Auth ("Secure email change" on): one code goes to the current address and one to
      the new address; the email changes only when both are entered. Migration 026 then updates email_normalized
      and writes the change to the Audit Log.
   3) Deleting the profile: the database function delete_my_account (migration 026) checks the password and deletes
      the account. Reports stay public without a link to the person. Staff accounts are not deleted here. */
(() => {
  const { $, $$ } = CS;

  CS.addStrings({
    bg: {
      pTitle:'Моят <em>профил</em>',
      pLead:'Името ти виждат само администраторите на общината. Телефонът не е публичен и не се изпраща на институциите.',
      firstName:'Име', lastName:'Фамилия', phone:'Телефон', optional:'по желание',
      phoneHint:'Ползва се само ако общината трябва да се свърже с теб. Остави полето празно, за да го изтриеш.',
      save:'Запази промените', undo:'Отказ', saved:'Промените са запазени',
      since:'Профил от', consentT:'Съгласие с политиката', consentV:(v, d) => `версия ${v}, ${d}`, none:'—',
      eRequired:'Попълни това поле.', eName:'Само букви от една азбука (кирилица или латиница), поне 2.', ePhone:'Въведи български номер, напр. +359 88 123 4567.',
      eSave:'Промените не бяха запазени. Опитай отново.', eNetwork:'Няма връзка със сървъра. Опитай отново.', eLoad:'Профилът не се зареди. Презареди страницата.',
      docTitle:'Профил',

      emTitle:'Имейл', emLead:'С него влизаш и на него получаваш известията. Не е публичен.',
      emChange:'Смени имейла', emNew:'Нов имейл', emSend:'Изпрати кодовете', emConfirm:'Потвърди',
      emNewHint:'Ще изпратим код на сегашния и на новия адрес. Имейлът се сменя чак когато въведеш и двата.',
      emOld:'Код от писмото до сегашния имейл {e}', emNewCode:'Код от писмото до новия имейл {e}',
      emCodesHint:'Кодовете важат 10 минути. Не виждаш писмото? Провери папка „Спам“. Ако се откажеш, имейлът остава същият.',
      emPending:'Имаш започната смяна на имейла. Въведи кодовете от двете писма.',
      emResend:'Изпрати кодовете отново', emResendIn:n => `Нови кодове след ${n} сек.`, emResendLimit:n => `Нови кодове след ${n} мин. (до 3 на час)`,
      emResent:'Изпратихме нови кодове.', emDone:'Имейлът е сменен',
      eEmail:'Въведи валиден имейл, напр. name@example.com.', eEmailSame:'Това е сегашният ти имейл.',
      eEmailTaken:'Този имейл не може да се използва. Избери друг.',
      eEmailLimit:'Изпратихме твърде много писма. Опитай отново след час.', eEmailSend:'Не успяхме да изпратим писмата с кодовете. Опитай отново след малко.',
      eTooMany:'Твърде много опити. Изчакай малко и опитай отново.',
      eCode:'Въведи всичките 6 цифри.', eCodeWrong:n => `Грешен или изтекъл код. ${n === 1 ? 'Остава 1 опит' : `Остават ${n} опита`}.`,
      eCodeLocked:'Твърде много грешни опити. Поискай нови кодове.', eStillPending:'Смяната още не е завършена. Провери двата кода и опитай отново.',
      otpDigit:n => `Цифра ${n} от 6`,

      delTitle:'Изтриване на профила', delLead:'Какво става, когато изтриеш профила си:',
      del1:'Името, имейлът и телефонът ти се изтриват веднага.',
      del2:'Сигналите ти остават публични, но без връзка с теб. Вече няма да можеш да ги следиш в „Моите сигнали“ или да ги оттеглиш.',
      del3:'Действието не може да се отмени. Ако пак искаш да подаваш сигнали, ще трябва да се регистрираш отново.',
      delStaff:'Профилите на служителите не се изтриват оттук. Помоли Super Admin първо да смени ролята ти на гражданин.',
      delOpen:'Изтрий профила', delPw:'Парола', delPwHint:'Въведи паролата си, за да потвърдиш, че си ти.',
      delSure:'Разбирам, че профилът ми ще бъде изтрит завинаги.', delGo:'Изтрий профила завинаги',
      eSure:'Отметни, за да потвърдиш.', ePwWrong:'Грешна парола.', eDelLimit:'Твърде много грешни пароли. Опитай отново след час.',
      eDelStaff:'Профилите на служителите не се изтриват оттук.', eDelete:'Профилът не беше изтрит. Опитай отново.',
      delDoneT:'Профилът е изтрит', delDoneX:'Личните ти данни са изтрити, а сигналите ти остават публични без връзка с теб. Благодарим, че помогна на Сливен.',
      delHome:'Към началото', showPw:'Покажи паролата', hidePw:'Скрий паролата'
    },
    en: {
      pTitle:'My <em>profile</em>',
      pLead:'Only municipal administrators see your name. Your phone is not public and is not sent to institutions.',
      firstName:'First name', lastName:'Last name', phone:'Phone', optional:'optional',
      phoneHint:'Used only if the municipality needs to contact you. Leave it empty to delete it.',
      save:'Save changes', undo:'Cancel', saved:'Changes saved',
      since:'Profile since', consentT:'Privacy policy consent', consentV:(v, d) => `version ${v}, ${d}`, none:'—',
      eRequired:'Fill in this field.', eName:'Letters of one alphabet only (Cyrillic or Latin), at least 2.', ePhone:'Enter a Bulgarian number, e.g. +359 88 123 4567.',
      eSave:"Your changes weren't saved. Try again.", eNetwork:'No connection to the server. Try again.', eLoad:"Your profile didn't load. Reload the page.",
      docTitle:'Profile',

      emTitle:'Email', emLead:'You log in with it and get notifications on it. It is not public.',
      emChange:'Change email', emNew:'New email', emSend:'Send the codes', emConfirm:'Confirm',
      emNewHint:'We will send a code to your current and to your new address. The email changes only after you enter both.',
      emOld:'Code from the email to your current address {e}', emNewCode:'Code from the email to your new address {e}',
      emCodesHint:"The codes are valid for 10 minutes. Can't see the email? Check your spam folder. If you cancel, your email stays the same.",
      emPending:'You have started changing your email. Enter the codes from both emails.',
      emResend:'Send the codes again', emResendIn:n => `New codes in ${n} s`, emResendLimit:n => `New codes in ${n} min (up to 3 per hour)`,
      emResent:'We sent new codes.', emDone:'Email changed',
      eEmail:'Enter a valid email, e.g. name@example.com.', eEmailSame:'This is your current email.',
      eEmailTaken:"This email can't be used. Choose another one.",
      eEmailLimit:'We sent too many emails. Try again in an hour.', eEmailSend:"We couldn't send the emails with the codes. Try again in a little while.",
      eTooMany:'Too many attempts. Wait a little and try again.',
      eCode:'Enter all 6 digits.', eCodeWrong:n => `Wrong or expired code. ${n} ${n === 1 ? 'attempt' : 'attempts'} left.`,
      eCodeLocked:'Too many wrong attempts. Ask for new codes.', eStillPending:'The change is not finished yet. Check both codes and try again.',
      otpDigit:n => `Digit ${n} of 6`,

      delTitle:'Delete profile', delLead:'What happens when you delete your profile:',
      del1:'Your name, email and phone are deleted at once.',
      del2:"Your reports stay public, but without a link to you. You won't be able to follow them in “My reports” or withdraw them.",
      del3:"This can't be undone. To submit reports again, you will need to sign up again.",
      delStaff:'Staff profiles are not deleted here. Ask a Super Admin to change your role to citizen first.',
      delOpen:'Delete profile', delPw:'Password', delPwHint:"Enter your password to confirm it's you.",
      delSure:'I understand that my profile will be deleted for good.', delGo:'Delete my profile for good',
      eSure:'Tick the box to confirm.', ePwWrong:'Wrong password.', eDelLimit:'Too many wrong passwords. Try again in an hour.',
      eDelStaff:'Staff profiles are not deleted here.', eDelete:"Your profile wasn't deleted. Try again.",
      delDoneT:'Profile deleted', delDoneX:'Your personal data is deleted, and your reports stay public without a link to you. Thank you for helping Sliven.',
      delHome:'Back to home', showPw:'Show password', hidePw:'Hide password'
    }
  });

  // same rules as the database (migration 022): 2–60 letters, space, ' ’ -, one alphabet only
  const reName = /^\p{L}[\p{L} '’-]{1,59}$/u;
  const mixedScript = v => /[Ѐ-ӿ]/.test(v) && /[A-Za-z]/.test(v);
  // only plain spaces or dashes between the digits (the database rejects tabs and other blanks)
  const rePhone = /^(\+359|0) ?\d{2,3}[ -]?\d{2,3}[ -]?\d{2,4}$/;
  const reEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const fields = { first_name:$('#p-first'), last_name:$('#p-last'), phone:$('#p-phone') };
  const form = $('#form-profile'), saveBtn = $('#save'), resetBtn = $('#reset'), alertEl = $('#alert');
  let ctx = null, original = {};

  /* ═════════ Shared helpers ═════════ */
  const ERR_ICO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>';
  const say = (key, arg) => { const v = CS.t(key); return typeof v === 'function' ? v(arg) : v; };
  function check(input) {
    const raw = input.type === 'checkbox' ? input.checked : input.value;
    const v = typeof raw === 'string' ? raw.trim() : raw;
    switch (input.dataset.rule) {
      case 'name': return !v ? 'eRequired' : reName.test(v) && !mixedScript(v) ? '' : 'eName';
      case 'phone': return !v || rePhone.test(v) ? '' : 'ePhone';
      case 'email': return !v ? 'eRequired' : reEmail.test(v) ? '' : 'eEmail';
      case 'required': return raw ? '' : 'eRequired';
      case 'consent': return v ? '' : 'eSure';
    }
    return '';
  }
  // field: the .field element; key: a string key (or null to clear); arg for functions such as eCodeWrong
  function fieldError(field, key, arg) {
    field.classList.toggle('invalid', !!key);
    field._err = key ? { key, arg } : null;
    const err = $('.err', field);
    err.innerHTML = key ? ERR_ICO : '';
    if (key) err.append(say(key, arg));
    $$('input', field).forEach(i => i.setAttribute('aria-invalid', !!key));
  }
  const setError = (input, key) => fieldError(input.closest('.field'), key);
  function shake(el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
  function validate(root) {
    let first = null;
    $$('[data-rule]', root).forEach(input => { const k = check(input); setError(input, k); if (k && !first) first = input; });
    if (first) { shake(first.closest('.field')); first.focus(); }
    return !first;
  }
  function busy(f, on) { const b = $('button[type=submit]', f); b.classList.toggle('loading', on); b.disabled = on; }
  // alerts: { key, arg, type: 'err' | 'info' } — text is set with textContent only (SEC-5)
  function showAlert(el, key, opts = {}) {
    el._state = { key, ...opts };
    el.classList.toggle('info', opts.type === 'info');
    $('.alert-text', el).textContent = say(key, opts.arg);
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }
  function hideAlert(el) { el._state = null; el.classList.remove('show'); }
  // "{e}" in a string is replaced by the email in bold (as text, never as HTML)
  function withEmail(el, key, email) {
    const [a, b = ''] = say(key).split('{e}');
    const strong = document.createElement('b'); strong.textContent = email;
    el.textContent = ''; el.append(a, strong, b);
  }
  let toastTimer;
  function toast(key) {
    const el = $('#toast'); el.textContent = say(key); el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }
  // Supabase Auth error → message key ('code' = wrong or expired code)
  function authErr(error, fallback = 'eSave') {
    console.warn('[CallSliven] Supabase Auth:', error.status, error.code, error.message);
    const code = error.code || '', status = error.status, msg = error.message || '';
    if (error.network || status === 0 || (!status && error.name === 'AuthRetryableFetchError')) return 'eNetwork';
    if (code === 'otp_expired' || code === 'otp_invalid' || (status === 403 && /token|otp|expired|invalid/i.test(msg))) return 'code';
    if (code === 'email_exists' || code === 'user_already_exists' || code === 'conflict') return 'eEmailTaken';
    if (code === 'email_address_invalid' || code === 'validation_failed') return 'eEmail';
    if (code === 'over_email_send_rate_limit') return 'eEmailLimit';
    if (code === 'over_request_rate_limit' || status === 429) return 'eTooMany';
    if (/sending .*email|email.*send|email_address_not_authorized/i.test(msg + ' ' + code)) return 'eEmailSend';
    return fallback;
  }

  /* ═════════ 1. Name and phone ═════════ */
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

  Object.values(fields).forEach(input => {
    input.addEventListener('input', () => {
      if (input.closest('.field').classList.contains('invalid')) setError(input, check(input));
      hideAlert(alertEl); refreshDirty();
    });
    input.addEventListener('blur', () => { if (input.value) setError(input, check(input)); });
  });

  function fill(p) {
    original = { first_name:p.first_name || '', last_name:p.last_name || '', phone:p.phone || '' };
    for (const k in fields) { fields[k].value = original[k]; setError(fields[k], ''); }
    refreshDirty();
  }
  resetBtn.addEventListener('click', () => { fill(original); hideAlert(alertEl); });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    hideAlert(alertEl);
    if (!validate(form)) return;
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
      return showAlert(alertEl, res.error && res.error.network ? 'eNetwork' : 'eSave');
    }
    fill(res.data);
    CS.renderUser({ ...CS.user, firstName:res.data.first_name, lastName:res.data.last_name });
    toast('saved');
  });

  /* ═════════ 2. Email change ═════════ */
  const CODE_TRIES = 5, RESEND_WAIT = 60, RESEND_PER_HOUR = 3, HOUR = 3600e3, CODE_LIFE = 10 * 60e3;
  const emAlert = $('#em-alert'), emForm = $('#form-email'), codesForm = $('#form-email-codes'), emInput = $('#em-new');
  const em = { step:'show', newEmail:'' };

  function makeCodeBox(fieldId) {
    const field = $('#' + fieldId);
    const box = OtpInput($('[data-otp]', field), {
      onComplete: () => { if (!box.locked && !box.done && allReady()) codesForm.requestSubmit(); },
      onInput: () => { if (field.classList.contains('invalid') && !box.locked) { fieldError(field, null); box.setInvalid(false); } }
    });
    box.field = field;
    box.reset = () => {
      box.clear(); box.tries = 0; box.locked = false; box.done = false;
      field.classList.remove('done'); fieldError(field, null); box.setInvalid(false);
      $$('input', field).forEach(i => { i.disabled = false; });
    };
    box.wrong = () => {
      box.tries++;
      box.clear(); box.setInvalid(true); shake(field);
      if (box.tries >= CODE_TRIES) {
        box.locked = true;
        $$('input', field).forEach(i => { i.disabled = true; });
        fieldError(field, 'eCodeLocked');
      } else { fieldError(field, 'eCodeWrong', CODE_TRIES - box.tries); box.focus(); }
    };
    box.accept = () => {
      box.done = true; box.success(); field.classList.add('done');
      $$('input', field).forEach(i => { i.disabled = true; });
    };
    box.reset();
    return box;
  }
  const oldBox = makeCodeBox('em-otp-old'), newBox = makeCodeBox('em-otp-new');
  const allReady = () => [oldBox, newBox].every(b => b.done || b.complete());

  function emShow(step, focus = true) {
    em.step = step;
    $('#em-show').hidden = step !== 'show';
    emForm.hidden = step !== 'enter';
    codesForm.hidden = step !== 'codes';
    if (step === 'codes') renderCodeLabels();
    if (!focus) return;
    if (step === 'enter') emInput.focus();
    else if (step === 'codes') (oldBox.done ? newBox : oldBox).focus();
    else $('#em-open').focus();
  }
  function renderCodeLabels() {
    withEmail($('#em-old-label'), 'emOld', ctx.user.email || '');
    withEmail($('#em-new-label'), 'emNewCode', em.newEmail);
  }

  // up to 3 sends an hour and 60 s between them (same limits as the sign-up code, AUTH-3)
  const SENT_KEY = 'cs_email_code_sent';
  function sentLog() { try { return JSON.parse(localStorage.getItem(SENT_KEY) || '[]').filter(x => Date.now() - x < HOUR); } catch (e) { return []; } }
  function logSent() { const l = sentLog(); l.push(Date.now()); try { localStorage.setItem(SENT_KEY, JSON.stringify(l)); } catch (e) {} }
  let waitTimer = null;
  function resendState() {
    const l = sentLog();
    if (l.length >= RESEND_PER_HOUR) return { blocked:true, min:Math.ceil((HOUR - (Date.now() - l[0])) / 60000) };
    const last = l.length ? l[l.length - 1] : 0;
    return { blocked:false, sec:Math.max(0, Math.ceil((last + RESEND_WAIT * 1000 - Date.now()) / 1000)) };
  }
  function renderResend() {
    const b = $('#em-resend'), s = resendState();
    b.textContent = s.blocked ? say('emResendLimit', s.min) : s.sec > 0 ? say('emResendIn', s.sec) : say('emResend');
    b.disabled = s.blocked || s.sec > 0;
  }
  function startWait() {
    clearInterval(waitTimer);
    renderResend();
    waitTimer = setInterval(() => { renderResend(); const s = resendState(); if (!s.blocked && s.sec <= 0) clearInterval(waitTimer); }, 1000);
  }

  // asks Supabase Auth to send both codes; returns true when they were sent
  async function sendCodes(email) {
    let res;
    try { res = await ctx.sb.auth.updateUser({ email }); } catch (err) { res = { error:{ network:true } }; }
    if (res.error) {
      const key = authErr(res.error);
      if (key === 'eEmailTaken' || key === 'eEmail') { emShow('enter'); setError(emInput, key); shake(emInput.closest('.field')); }
      else showAlert(emAlert, key);
      return false;
    }
    logSent(); startWait();
    return true;
  }

  $('#em-open').addEventListener('click', () => { hideAlert(emAlert); emInput.value = ''; setError(emInput, ''); emShow('enter'); });
  $$('[data-em-cancel]').forEach(b => b.addEventListener('click', () => { hideAlert(emAlert); emShow('show'); }));
  emInput.addEventListener('input', () => { if (emInput.closest('.field').classList.contains('invalid')) setError(emInput, check(emInput)); hideAlert(emAlert); });

  emForm.addEventListener('submit', async e => {
    e.preventDefault();
    hideAlert(emAlert);
    if (!validate(emForm)) return;
    const email = emInput.value.trim();
    if (email.toLowerCase() === (ctx.user.email || '').toLowerCase()) { setError(emInput, 'eEmailSame'); shake(emInput.closest('.field')); return; }
    const s = resendState();
    if (s.blocked) return showAlert(emAlert, 'eEmailLimit');
    busy(emForm, true);
    const ok = await sendCodes(email);
    busy(emForm, false);
    if (!ok) return;
    em.newEmail = email;
    oldBox.reset(); newBox.reset();
    emShow('codes');
  });

  $('#em-resend').addEventListener('click', async () => {
    const s = resendState();
    if (s.blocked || s.sec > 0) return;
    hideAlert(emAlert);
    $('#em-resend').disabled = true;
    if (!await sendCodes(em.newEmail)) return renderResend();
    oldBox.reset(); newBox.reset(); oldBox.focus();
    showAlert(emAlert, 'emResent', { type:'info' });
  });

  // checks one code against the address it was sent to; returns true when accepted
  async function verifyCode(box, email) {
    let res;
    try { res = await ctx.sb.auth.verifyOtp({ email, token:box.value(), type:'email_change' }); } catch (err) { res = { error:{ network:true } }; }
    if (!res.error) { box.accept(); return true; }
    const key = authErr(res.error, 'code');
    if (key === 'code') box.wrong(); else showAlert(emAlert, key);
    return false;
  }

  codesForm.addEventListener('submit', async e => {
    e.preventDefault();
    hideAlert(emAlert);
    const todo = [oldBox, newBox].filter(b => !b.done);
    if (todo.some(b => b.locked)) return;
    const empty = todo.find(b => !b.complete());
    if (empty) { fieldError(empty.field, 'eCode'); shake(empty.field); empty.focus(); return; }
    busy(codesForm, true);
    // each code is checked with the address it was sent to (current first, then new)
    if (!oldBox.done && !await verifyCode(oldBox, ctx.user.email)) return busy(codesForm, false);
    if (!newBox.done && !await verifyCode(newBox, em.newEmail)) return busy(codesForm, false);

    let user = null;
    try { await ctx.sb.auth.refreshSession(); } catch (err) {}
    try { ({ data:{ user } } = await ctx.sb.auth.getUser()); } catch (err) {}
    busy(codesForm, false);
    if (!user || (user.email || '').toLowerCase() !== em.newEmail.toLowerCase()) {
      oldBox.reset(); newBox.reset();
      return showAlert(emAlert, 'eStillPending');
    }
    ctx.user = user;
    $('#p-email').textContent = user.email;
    $('#del-username').value = user.email;
    CS.renderUser({ ...CS.user, email:user.email });
    try { localStorage.removeItem(SENT_KEY); } catch (err) {}
    emShow('show');
    toast('emDone');
  });

  // a change started a few minutes ago (e.g. the page was reloaded): continue with the codes
  function resumePending(user) {
    const sentAt = user.email_change_sent_at ? Date.parse(user.email_change_sent_at) : 0;
    if (!user.new_email || !sentAt || Date.now() - sentAt > CODE_LIFE) return;
    em.newEmail = user.new_email;
    emShow('codes', false);
    startWait();
    showAlert(emAlert, 'emPending', { type:'info' });
  }

  /* ═════════ 3. Delete the profile ═════════ */
  const delForm = $('#form-delete'), delAlert = $('#del-alert'), delPw = $('#del-password'), delSure = $('#del-sure');

  $('#del-open').addEventListener('click', () => {
    $('#del-open').hidden = true;
    delForm.hidden = false;
    delPw.value = ''; delSure.checked = false;
    setError(delPw, ''); setError(delSure, ''); hideAlert(delAlert);
    delPw.focus();
  });
  $('#del-cancel').addEventListener('click', () => {
    delForm.hidden = true;
    delPw.value = ''; delSure.checked = false;
    $('#del-open').hidden = false;
    $('#del-open').focus();
  });
  delPw.addEventListener('input', () => { if (delPw.closest('.field').classList.contains('invalid')) setError(delPw, check(delPw)); hideAlert(delAlert); });
  delSure.addEventListener('change', () => setError(delSure, check(delSure)));
  $$('.eye').forEach(btn => btn.addEventListener('click', () => {
    const input = btn.parentElement.querySelector('input');
    const showIt = input.type === 'password';
    input.type = showIt ? 'text' : 'password';
    btn.setAttribute('aria-pressed', showIt);
    btn.setAttribute('aria-label', say(showIt ? 'hidePw' : 'showPw'));
  }));

  delForm.addEventListener('submit', async e => {
    e.preventDefault();
    hideAlert(delAlert);
    if (!validate(delForm)) return;
    busy(delForm, true);
    let res;
    try { res = await ctx.sb.rpc('delete_my_account', { p_password:delPw.value }); } catch (err) { res = { error:{ network:true } }; }
    busy(delForm, false);
    if (res.error) {
      console.warn('[CallSliven] delete_my_account:', res.error);
      return showAlert(delAlert, res.error.network ? 'eNetwork' : 'eDelete');
    }
    switch (res.data) {
      case 'deleted': return finishDeleted();
      case 'wrong_password':
        delPw.value = ''; setError(delPw, 'ePwWrong'); shake(delPw.closest('.field')); delPw.focus(); return;
      case 'too_many_attempts': return showAlert(delAlert, 'eDelLimit');
      case 'staff_account': return showAlert(delAlert, 'eDelStaff');
      default: return showAlert(delAlert, 'eDelete');
    }
  });

  async function finishDeleted() {
    // the account no longer exists: forget the session and everything this site saved in the browser (except the language)
    try { await ctx.sb.auth.signOut({ scope:'local' }); } catch (err) {}
    try {
      Object.keys(localStorage).forEach(k => { if (/^sb-.+-auth-token$/.test(k) || (k.startsWith('cs_') && k !== 'language')) localStorage.removeItem(k); });
      sessionStorage.clear();
    } catch (err) {}
    CS.renderUser(null);
    ['#page-head', '#card', '#email-card', '#meta', '#del-card'].forEach(s => { $(s).hidden = true; });
    $('#deleted').hidden = false;
    scrollTo({ top:0, behavior:'smooth' });
    $('#deleted-title').focus({ preventScroll:true });
  }

  /* ═════════ Facts, language, start ═════════ */
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
    $$('.field.invalid').forEach(f => { if (f._err) fieldError(f, f._err.key, f._err.arg); });
    $$('.alert.show').forEach(el => { if (el._state) $('.alert-text', el).textContent = say(el._state.key, el._state.arg); });
    [oldBox, newBox].forEach(b => b.setLabels(n => say('otpDigit', n)));
    $$('.eye').forEach(b => b.setAttribute('aria-label', say(b.getAttribute('aria-pressed') === 'true' ? 'hidePw' : 'showPw')));
    if (ctx && em.step === 'codes') renderCodeLabels();
    renderResend();
  });

  CS.start();
  document.title = CS.t('docTitle') + ' · CallSliven';

  CS.requireUser().then(c => {
    if (!c) return;                       // requireUser already sends the visitor to log in
    ctx = c;
    $('#loading').hidden = true;
    $('#card').setAttribute('aria-busy', 'false');
    if (!c.profile) return showAlert(alertEl, 'eLoad'), (form.hidden = false);
    fill(c.profile);
    renderMeta();
    form.hidden = false;

    $('#p-email').textContent = c.user.email || '';
    $('#del-username').value = c.user.email || '';
    $('#email-card').hidden = false;
    resumePending(c.user);

    const staff = c.profile.role === 'admin' || c.profile.role === 'super_admin';
    $('#del-staff').hidden = !staff;
    $('#del-open').hidden = staff;
    $('#del-card').hidden = false;
    $('#meta').hidden = false;
  });
})();
