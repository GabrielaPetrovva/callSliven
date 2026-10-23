/* CallSliven — TOTP setup for staff (ADM-1). Uses Supabase Auth MFA: enroll → scan → challengeAndVerify → aal2.
   Only TOTP, as in MVP.md. No email codes, no recovery codes: a Super Admin resets a lost factor. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const sb = window.SB;
  const ADMIN_HOME = 'admin.html', CITIZEN_HOME = 'auth.html';

  const T = {
    bg: {
      logOut:'Изход', pageTitle:'Втори <em>фактор</em>', pageLead:'Администраторският достъп изисква парола и код от приложение за удостоверяване.',
      cardTitle:'Приложение за удостоверяване (TOTP)', cardSub:'Google Authenticator, Microsoft Authenticator, Authy или друго. Кодът се сменя на 30 секунди и работи без интернет.',
      how1:'Отвори приложението и избери „Добави“ (+).', how2:'Сканирай QR кода.', how3:'Въведи 6-цифрения код, който приложението показва.',
      cantScan:'Не можеш да сканираш? Въведи ключа ръчно:', copy:'Копирай', copied:'Копирано',
      codeLabel:'Код от приложението', verifyBtn:'Потвърди', otpDigit:n => `Цифра ${n} от 6`,
      lostNote:'Ако смениш или загубиш телефона, Super Admin нулира втория фактор и го настройваш отново.',
      doneText:'Вторият фактор е настроен. При всеки вход ще въвеждаш и код от приложението.', alreadyText:'Вторият фактор вече е настроен.',
      toAdmin:'Към админ панела', deniedText:'Тази страница е само за администратори.', toHome:'Към началото',
      eCode:'Въведи всичките 6 цифри.', eCodeWrong:'Грешен код. Провери часа на телефона и опитай с новия код.',
      eNetwork:'Няма връзка със сървъра. Опитай отново.', eGeneric:'Нещо се обърка. Презареди страницата.', docTitle:'Втори фактор'
    },
    en: {
      logOut:'Log out', pageTitle:'Second <em>factor</em>', pageLead:'Administrator access needs a password and a code from an authenticator app.',
      cardTitle:'Authenticator app (TOTP)', cardSub:'Google Authenticator, Microsoft Authenticator, Authy or similar. The code changes every 30 seconds and works offline.',
      how1:'Open the app and choose “Add” (+).', how2:'Scan the QR code.', how3:'Enter the 6-digit code the app shows.',
      cantScan:"Can't scan? Enter this key by hand:", copy:'Copy', copied:'Copied',
      codeLabel:'Code from the app', verifyBtn:'Verify', otpDigit:n => `Digit ${n} of 6`,
      lostNote:'If you change or lose your phone, a Super Admin resets the factor and you set it up again.',
      doneText:"Your second factor is set. Every log in will also ask for a code from the app.", alreadyText:'Your second factor is already set.',
      toAdmin:'Go to the admin panel', deniedText:'This page is for administrators only.', toHome:'Back to home',
      eCode:'Enter all 6 digits.', eCodeWrong:"Wrong code. Check your phone's clock and try the new code.",
      eNetwork:'No connection to the server. Try again.', eGeneric:'Something went wrong. Reload the page.', docTitle:'Second factor'
    }
  };
  let lang = 'bg';
  try { lang = localStorage.getItem('language') === 'en' ? 'en' : 'bg'; } catch (e) {}
  const t = k => T[lang][k];

  const alertEl = $('#alert');
  let alertKey = null, errKey = null, doneKey = 'doneText';
  function showAlert(key) { alertKey = key; $('.alert-text', alertEl).textContent = t(key); alertEl.classList.add('show'); }
  function hideAlert() { alertKey = null; alertEl.classList.remove('show'); }
  const ERR_ICO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>';
  const field = $('#code-field');
  function fieldError(key) {
    errKey = key;
    field.classList.toggle('invalid', !!key);
    $('.err', field).innerHTML = key ? ERR_ICO : '';
    if (key) { $('.err', field).append(t(key)); field.classList.remove('shake'); void field.offsetWidth; field.classList.add('shake'); }
  }
  function showPane(name) { $$('.pane').forEach(p => { p.hidden = p.dataset.pane !== name; }); }
  const errOf = e => (e && (e.status === 0 || e.name === 'AuthRetryableFetchError')) ? 'eNetwork' : 'eGeneric';

  let factorId = null, secret = '';
  // Supabase returns "data:image/svg+xml;utf-8,<svg…>" with raw characters; encode it so every browser shows it
  function qrSrc(q) {
    const m = /^data:image\/svg\+xml;(?:utf-8|charset=utf-8),(.*)$/s.exec(q || '');
    if (m && m[1].trim().startsWith('<')) return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(m[1]);
    if (q && q.trim().startsWith('<svg')) return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(q);
    return q;
  }
  const otp = OtpInput($('[data-otp]', field), {
    onComplete: () => $('#form-enroll').requestSubmit(),
    onInput: () => { if (errKey) fieldError(null); hideAlert(); }
  });

  async function start() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { location.href = 'auth.html?next=mfa-setup.html'; return; }
    const { data: profile } = await sb.from('profiles').select('role, active').eq('id', session.user.id).maybeSingle();
    if (!profile || !['admin', 'super_admin'].includes(profile.role) || profile.active === false) return showPane('denied');

    const { data: factors, error } = await sb.auth.mfa.listFactors();
    if (error) { showPane('loading'); return showAlert(errOf(error)); }
    if ((factors.totp || []).some(f => f.status === 'verified')) {
      const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal && aal.currentLevel !== 'aal2') { location.href = 'auth.html?next=' + encodeURIComponent(ADMIN_HOME); return; }   // has a factor, must enter the code first
      doneKey = 'alreadyText'; $('#done-text').textContent = t(doneKey);
      return showPane('done');
    }
    // remove half-finished attempts from earlier visits, then start a fresh one
    for (const f of factors.all || []) if (f.factor_type === 'totp' && f.status !== 'verified') await sb.auth.mfa.unenroll({ factorId:f.id });
    const { data, error: enrollError } = await sb.auth.mfa.enroll({ factorType:'totp', friendlyName:'CallSliven' });
    if (enrollError) { showPane('loading'); return showAlert(errOf(enrollError)); }
    factorId = data.id;
    secret = data.totp.secret;
    $('#qr').src = qrSrc(data.totp.qr_code);                     // SVG made by Supabase: nothing leaves the browser
    $('#secret').textContent = secret.replace(/(.{4})/g, '$1 ').trim();
    showPane('enroll');
    setTimeout(() => otp.focus(), 150);
  }

  $('#form-enroll').addEventListener('submit', async e => {
    e.preventDefault();
    hideAlert();
    if (!otp.complete()) { fieldError('eCode'); otp.focus(); return; }
    const btn = $('button[type=submit]', e.target);
    btn.classList.add('loading'); btn.disabled = true;
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code:otp.value() });
    btn.classList.remove('loading'); btn.disabled = false;
    if (error) {
      if (errOf(error) === 'eNetwork') return showAlert('eNetwork');
      otp.clear(); fieldError('eCodeWrong'); otp.focus(); return;
    }
    otp.success();
    doneKey = 'doneText'; $('#done-text').textContent = t(doneKey);
    setTimeout(() => showPane('done'), 450);
  });

  $('#copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(secret); } catch (e) {}
    const el = $('#toast'); el.textContent = t('copied'); el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2200);
  });
  $('#logout').addEventListener('click', async () => { await sb.auth.signOut(); location.href = CITIZEN_HOME; });
  $('#to-admin').setAttribute('href', ADMIN_HOME);

  function applyLang(next) {
    lang = next === 'en' ? 'en' : 'bg';
    try { localStorage.setItem('language', lang); } catch (e) {}
    document.documentElement.lang = lang;
    document.title = t('docTitle') + ' · CallSliven';
    $$('[data-i18n]').forEach(el => { const v = T[lang][el.dataset.i18n]; if (typeof v === 'string') el.innerHTML = v; });
    $('#done-text').textContent = t(doneKey);
    $$('.lang button').forEach(b => { const on = b.dataset.lang === lang; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on); });
    otp.setLabels(t('otpDigit'));
    if (alertKey) $('.alert-text', alertEl).textContent = t(alertKey);
    if (errKey) { $('.err', field).innerHTML = ERR_ICO; $('.err', field).append(t(errKey)); }
  }
  $$('.lang button').forEach(b => b.addEventListener('click', () => applyLang(b.dataset.lang)));
  $$('img:not(#qr)').forEach(img => { if (img.complete && !img.naturalWidth) img.remove(); else img.addEventListener('error', () => img.remove()); });

  applyLang(lang);
  start().catch(() => showAlert('eNetwork'));
})();
