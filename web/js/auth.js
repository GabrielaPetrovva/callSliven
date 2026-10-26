/* CallSliven — log in, sign up with an email code, password reset with a code, administrator second factor.
   Built on Supabase Auth (js/sb.js) exactly as MVP.md describes:
   AUTH-1 sign-up fields · AUTH-2 consent version · AUTH-3 6-digit email code · AUTH-4 24 h note
   AUTH-6 neutral messages · AUTH-7 Turnstile · AUTH-8 honeypot + minimum time · ADM-1 TOTP for staff (aal2). */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sb = window.SB;
  const { TURNSTILE_SITE_KEY, POLICY_VERSION } = window.CS_CONFIG;
  const CITIZEN_HOME = 'profile.html', ADMIN_HOME = 'admin.html', MFA_SETUP = 'mfa-setup.html';
  const params = new URLSearchParams(location.search);

  /* ═════════ Rules from MVP.md ═════════ */
  const PW_MIN = 12, PW_MAX = 72;          // AUTH-1 (Supabase/bcrypt reads at most 72 bytes)
  const CODE_TRIES = 5;                    // AUTH-3: 5 wrong attempts
  const RESEND_WAIT = 60;                  // AUTH-3: new code after 60 s
  const RESEND_PER_HOUR = 3;               // AUTH-3: up to 3 per hour
  const LOGIN_FAILS_FOR_CAPTCHA = 3;       // AUTH-7: visible check after 3 failed log ins
  const MIN_FILL_MS = 4000;                // AUTH-8: a person needs more than 4 s to fill in the form

  // only our own pages are allowed as ?next= (no open redirect)
  const safeNext = (() => { const n = params.get('next') || ''; return /^[\w\-/]+\.html(\?[\w=&%-]*)?$/.test(n) && !n.startsWith('//') ? n.replace(/^\//, '') : ''; })();

  /* ═════════ Translations ═════════ */
  const T = {
    bg: {
      brandSub:'Сигнали за община Сливен', back:'Към началото',
      sideTitle:'Един профил, <em>всички сигнали</em>', perk1:'Подаваш сигнал за минута', perk2:'Следиш всяка промяна в статуса', perk3:'Личните ти данни остават защитени',
      titleLogin:'Добре дошъл <em>отново</em>', leadLogin:'Влез, за да подаваш и следиш сигналите си.',
      titleRegister:'Създай <em>профил</em>', leadRegister:'Отнема минута. След регистрацията ще получиш код по имейл.',
      titleVerify:'Потвърди <em>имейла</em>', leadVerify:e => ['Изпратихме 6-цифрен код на ', e, '. Кодът важи 10 минути.'],
      titleForgot:'Забравена <em>парола?</em>', leadForgot:'Въведи имейла си и ще ти изпратим код за нова парола.',
      titleReset:'Нова <em>парола</em>', leadReset:e => ['Ако има профил с ', e, ', изпратихме код. Въведи го заедно с новата парола.'],
      titleMfa:'Втори <em>фактор</em>', leadMfa:'Въведи 6-цифрения код от приложението за удостоверяване (напр. Google Authenticator).',
      tabLogin:'Вход', tabRegister:'Регистрация',
      email:'Имейл', password:'Парола', newPassword:'Нова парола', password2:'Повтори паролата', firstName:'Име', lastName:'Фамилия', phone:'Телефон', optional:'по желание',
      phoneHint:'Не е публичен и не се изпраща на институциите.',
      pwHint:'Поне 12 символа. Най-лесно е с няколко думи, напр. „зелен-балкон-сливен-7“.',
      forgot:'Забравена парола?', loginBtn:'Вход', noAccount:'Нямаш профил?', createOne:'Създай',
      registerBtn:'Създай профил', haveAccount:'Вече имаш профил?', logInLink:'Влез',
      strength:'Сила на паролата', s0:'–', s1:'Твърде кратка', s2:'Приемлива', s3:'Добра', s4:'Силна',
      consent:'Прочетох <a href="privacy.html" target="_blank">Политиката за поверителност</a> и приемам <a href="terms.html" target="_blank">Условията за ползване</a>.',
      otpLabel:'Код от имейла', totpLabel:'Код от приложението', otpDigit:n => `Цифра ${n} от 6`,
      confirmBtn:'Потвърди', sendCode:'Изпрати код', resetBtn:'Запази новата парола', verifyBtn:'Потвърди', logOut:'Изход',
      resendCode:'Изпрати нов код', resendIn:n => `Нов код след ${n} сек.`, resendLimit:n => `Нов код след ${n} мин. (до 3 на час)`,
      verifyNote:'Не виждаш писмото? Провери папка „Спам“. Ако не потвърдиш до 24 часа, регистрацията се изтрива.',
      wrongEmail:'Сгрешен имейл? Регистрирай се отново', backToLogin:'Обратно към вход',
      mfaLost:'Нямаш достъп до приложението? Свържи се със Super Admin, за да нулира втория фактор.',
      privacy:'Политика за поверителност', terms:'Условия за ползване',
      stPwOkT:'Паролата е сменена', stPwOkX:'Излязохме от профила ти на всички устройства. Влез с новата парола.', actLogin:'Към вход',
      eRequired:'Попълни това поле.', eEmail:'Въведи валиден имейл, напр. name@example.com.', eName:'Само букви от една азбука (кирилица или латиница), поне 2.',
      ePhone:'Въведи български номер, напр. +359 88 123 4567.', ePassword:`Паролата трябва да е поне ${PW_MIN} символа.`, ePasswordLong:`Паролата може да е най-много ${PW_MAX} символа.`,
      eMatch:'Паролите не съвпадат.', eConsent:'Трябва да се съгласиш, за да продължиш.',
      eLogin:'Грешен имейл или парола.', eLoginCaptcha:'Грешен имейл или парола. Потвърди, че не си робот, и опитай отново.',
      eUnconfirmed:'Имейлът ти още не е потвърден. Въведи кода от писмото или поискай нов.',
      eDeactivated:'Профилът е деактивиран. Свържи се с общината.',
      eCode:'Въведи всичките 6 цифри.', eCodeWrong:n => `Грешен или изтекъл код. ${n === 1 ? 'Остава 1 опит' : `Остават ${n} опита`}.`,
      eCodeLocked:'Твърде много грешни опити. Поискай нов код.',
      eTooMany:'Твърде много опити. Изчакай малко и опитай отново.', eEmailLimit:'Изпратихме твърде много писма. Опитай отново след час.',
      eWeak:'Тази парола е твърде лесна или е изтекла в интернет. Избери друга.', eSame:'Новата парола трябва да е различна от старата.',
      eCaptcha:'Потвърди, че не си робот.', eCaptchaServer:'Сървърът не прие проверката срещу ботове. Изчакай отметката и опитай отново.', eCaptchaErr:c => `Проверката срещу ботове даде грешка ${c}.`, eCaptchaLoad:'Проверката срещу ботове не се зареди. Изключи блокера на реклами или презареди страницата.',
      eNetwork:'Няма връзка със сървъра. Провери интернета си и опитай отново.', eGeneric:'Нещо се обърка. Опитай отново.',
      iCodeSent:'Изпратихме нов код.',
      st_new:'Нов', st_sent:'Изпратен', st_in_progress:'В обработка', st_resolved:'Решен', st_closed:'Затворен', showPw:'Покажи паролата', hidePw:'Скрий паролата', docTitle:'Вход'
    },
    en: {
      brandSub:'Reports for Sliven Municipality', back:'Back to home',
      sideTitle:'One profile, <em>every report</em>', perk1:'Report a problem in a minute', perk2:'Follow every status change', perk3:'Your personal data stays private',
      titleLogin:'Welcome <em>back</em>', leadLogin:'Log in to submit and follow your reports.',
      titleRegister:'Create your <em>profile</em>', leadRegister:"It takes a minute. You'll get a code by email afterwards.",
      titleVerify:'Confirm your <em>email</em>', leadVerify:e => ['We sent a 6-digit code to ', e, '. It is valid for 10 minutes.'],
      titleForgot:'Forgot your <em>password?</em>', leadForgot:"Enter your email and we'll send you a code to set a new password.",
      titleReset:'New <em>password</em>', leadReset:e => ['If ', e, ' has a profile, we sent a code. Enter it with your new password.'],
      titleMfa:'Second <em>factor</em>', leadMfa:'Enter the 6-digit code from your authenticator app (e.g. Google Authenticator).',
      tabLogin:'Log in', tabRegister:'Sign up',
      email:'Email', password:'Password', newPassword:'New password', password2:'Repeat password', firstName:'First name', lastName:'Last name', phone:'Phone', optional:'optional',
      phoneHint:'It is not public and is not sent to institutions.',
      pwHint:'At least 12 characters. A few words work well, e.g. “green-balcony-sliven-7”.',
      forgot:'Forgot your password?', loginBtn:'Log in', noAccount:'No account yet?', createOne:'Create one',
      registerBtn:'Create profile', haveAccount:'Already have a profile?', logInLink:'Log in',
      strength:'Password strength', s0:'–', s1:'Too short', s2:'Acceptable', s3:'Good', s4:'Strong',
      consent:'I have read the <a href="privacy.html" target="_blank">Privacy policy</a> and accept the <a href="terms.html" target="_blank">Terms of use</a>.',
      otpLabel:'Code from the email', totpLabel:'Code from the app', otpDigit:n => `Digit ${n} of 6`,
      confirmBtn:'Confirm', sendCode:'Send code', resetBtn:'Save new password', verifyBtn:'Verify', logOut:'Log out',
      resendCode:'Send a new code', resendIn:n => `New code in ${n} s`, resendLimit:n => `New code in ${n} min (up to 3 per hour)`,
      verifyNote:"Can't see the email? Check your spam folder. If you don't confirm within 24 hours, the sign-up is deleted.",
      wrongEmail:'Wrong email? Sign up again', backToLogin:'Back to log in',
      mfaLost:"Can't open your app? Contact a Super Admin to reset your second factor.",
      privacy:'Privacy policy', terms:'Terms of use',
      stPwOkT:'Password changed', stPwOkX:'We logged you out on every device. Log in with your new password.', actLogin:'Go to log in',
      eRequired:'Fill in this field.', eEmail:'Enter a valid email, e.g. name@example.com.', eName:'Letters of one alphabet only (Cyrillic or Latin), at least 2.',
      ePhone:'Enter a Bulgarian number, e.g. +359 88 123 4567.', ePassword:`The password must be at least ${PW_MIN} characters.`, ePasswordLong:`The password can be at most ${PW_MAX} characters.`,
      eMatch:"Passwords don't match.", eConsent:'You need to agree to continue.',
      eLogin:'Wrong email or password.', eLoginCaptcha:"Wrong email or password. Confirm you're not a robot and try again.",
      eUnconfirmed:'Your email is not confirmed yet. Enter the code from the email or ask for a new one.',
      eDeactivated:'This profile is deactivated. Contact the municipality.',
      eCode:'Enter all 6 digits.', eCodeWrong:n => `Wrong or expired code. ${n} ${n === 1 ? 'attempt' : 'attempts'} left.`,
      eCodeLocked:'Too many wrong attempts. Ask for a new code.',
      eTooMany:'Too many attempts. Wait a little and try again.', eEmailLimit:'We sent too many emails. Try again in an hour.',
      eWeak:'This password is too easy or has leaked online. Choose another one.', eSame:'The new password must differ from the old one.',
      eCaptcha:"Confirm that you're not a robot.", eCaptchaServer:'The server did not accept the anti-bot check. Wait for the tick and try again.', eCaptchaErr:c => `The anti-bot check returned error ${c}.`, eCaptchaLoad:'The anti-bot check did not load. Turn off your ad blocker or reload the page.',
      eNetwork:'No connection to the server. Check your internet and try again.', eGeneric:'Something went wrong. Try again.',
      iCodeSent:'We sent a new code.',
      st_new:'New', st_sent:'Sent', st_in_progress:'In progress', st_resolved:'Resolved', st_closed:'Closed', showPw:'Show password', hidePw:'Hide password', docTitle:'Log in'
    }
  };
  let lang = 'bg';
  try { lang = localStorage.getItem('language') === 'en' ? 'en' : 'bg'; } catch (e) {}
  const t = k => T[lang][k];

  /* ═════════ Supabase error → message ═════════ */
  let lastTech = '';     // technical reason of the last error, shown in small text so it can be reported
  function errKey(error, fallback = 'eGeneric') {
    if (!error) return null;
    lastTech = [error.code, error.status, error.message].filter(Boolean).join(' · ');
    // the raw answer from Supabase, for F12 → Console (no personal data in it)
    console.warn('[CallSliven] Supabase Auth:', error.status, error.code, error.message);
    const code = error.code || '', status = error.status;
    if (status === 0 || error.name === 'AuthRetryableFetchError') return 'eNetwork';
    if (code === 'captcha_failed' || /captcha/i.test(error.message || '')) return 'eCaptchaServer';
    if (code === 'over_email_send_rate_limit') return 'eEmailLimit';
    if (code === 'over_request_rate_limit' || status === 429) return 'eTooMany';
    if (code === 'weak_password') return 'eWeak';
    if (code === 'same_password') return 'eSame';
    if (code === 'email_address_invalid' || code === 'validation_failed') return 'eEmail';
    return fallback;
  }

  /* ═════════ Messages ═════════ */
  // showAlert(el, key, { arg, type:'err'|'warn'|'info' })
  function showAlert(el, key, opts = {}) {
    el._state = { key, tech: opts.type && opts.type !== 'err' ? '' : lastTech, ...opts };
    lastTech = '';
    el.classList.remove('warn', 'info');
    if (opts.type && opts.type !== 'err') el.classList.add(opts.type);
    renderAlert(el);
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }
  function renderAlert(el) {
    const st = el._state; if (!st) return;
    const v = t(st.key);
    $('.alert-text', el).textContent = typeof v === 'function' ? v(st.arg) : v;
    let tech = $('.alert-tech', el);
    if (!tech) { tech = document.createElement('small'); tech.className = 'alert-tech'; $('.alert-body', el).appendChild(tech); }
    tech.textContent = st.tech ? '(' + st.tech + ')' : '';
    tech.hidden = !st.tech;
    $('.alert-act', el).hidden = true;
  }
  function hideAlert(el) { el.classList.remove('show'); el._state = null; }
  const ERR_ICO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>';
  function fieldError(field, key, arg) {
    field.classList.toggle('invalid', !!key);
    field._err = key ? { key, arg } : null;
    const err = $('.err', field);
    err.innerHTML = key ? ERR_ICO : '';
    if (key) { const v = t(key); err.append(typeof v === 'function' ? v(arg) : v); }
  }
  function shake(field) { field.classList.remove('shake'); void field.offsetWidth; field.classList.add('shake'); }
  function busy(form, on) { const b = $('button[type=submit]', form); b.classList.toggle('loading', on); b.disabled = on; }

  /* ═════════ Views ═════════ */
  const tabs = $('#tabs'), views = $('#views');
  let current = 'login';
  let pendingEmail = '';      // email waiting for a code (sign up or reset)
  const heads = {
    login:['titleLogin','leadLogin'], register:['titleRegister','leadRegister'], verify:['titleVerify','leadVerify'],
    forgot:['titleForgot','leadForgot'], reset:['titleReset','leadReset'], mfa:['titleMfa','leadMfa']
  };
  function show(name, focus = true) {
    const from = views.offsetHeight;
    current = name;
    $$('.view', views).forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
    const isTab = name === 'login' || name === 'register';
    tabs.style.display = isTab ? '' : 'none';
    if (isTab) {
      tabs.dataset.active = name;
      $$('.tab', tabs).forEach(b => b.setAttribute('aria-selected', b.id === 'tab-' + name));
    }
    renderHead();
    captcha.mountIn($('#view-' + name));
    if (name === 'register') regOpenedAt = Date.now();
    const to = views.scrollHeight;
    if (!reduce && from && from !== to) {
      views.style.height = from + 'px'; views.style.overflow = 'hidden';
      requestAnimationFrame(() => { views.style.height = to + 'px'; });
      setTimeout(() => { views.style.height = ''; views.style.overflow = ''; }, 480);
    }
    if (['login','register','forgot'].includes(name)) history.replaceState(null, '', location.pathname + location.search + '#' + name);
    if (focus) {
      const otpBox = $('#view-' + name + ' [data-otp] input');
      const first = otpBox || $('#view-' + name + ' .input');
      first && setTimeout(() => first.focus({ preventScroll:true }), 120);
    }
  }
  function renderHead() {
    const h = heads[current];
    $('#head').hidden = !h;
    if (!h) { if (current === 'status') renderStatus(); return; }
    $('#title').innerHTML = t(h[0]);                 // static translations only
    const lead = $('#lead'), v = t(h[1]);
    lead.textContent = '';
    if (typeof v === 'function') {                     // email goes in as text, never as HTML (SEC-5)
      const [a, e, b] = v(pendingEmail);
      const strong = document.createElement('b'); strong.textContent = e;
      lead.append(a, strong, b);
    } else lead.textContent = v;
    lead.style.display = lead.textContent ? '' : 'none';
  }
  $('#tab-login').addEventListener('click', () => show('login'));
  $('#tab-register').addEventListener('click', () => show('register'));
  $$('[data-go]').forEach(b => b.addEventListener('click', () => show(b.dataset.go)));
  $('#to-forgot').addEventListener('click', () => { $('#forgot-email').value = $('#login-email').value; show('forgot'); });
  tabs.addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const next = current === 'login' ? 'register' : 'login';
    show(next, false); $('#tab-' + next).focus();
  });

  /* ═════════ Field validation ═════════ */
  const reEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  // same rules as the database (migration 022): 2–60 letters, space, ' ’ -, one alphabet only
  const reName = /^\p{L}[\p{L} '’-]{1,59}$/u;
  const mixedScript = v => /[Ѐ-ӿ]/.test(v) && /[A-Za-z]/.test(v);
  // only plain spaces or dashes between the digits (the database rejects tabs and other blanks)
  const rePhone = /^(\+359|0) ?\d{2,3}[ -]?\d{2,3}[ -]?\d{2,4}$/;
  function check(input) {
    const raw = input.type === 'checkbox' ? input.checked : input.value;
    const v = typeof raw === 'string' ? raw.trim() : raw;
    switch (input.dataset.rule) {
      case 'required': return v ? '' : 'eRequired';
      case 'email': return !v ? 'eRequired' : reEmail.test(v) ? '' : 'eEmail';
      case 'name': return !v ? 'eRequired' : reName.test(v) && !mixedScript(v) ? '' : 'eName';
      case 'phone': return !v ? '' : rePhone.test(v) ? '' : 'ePhone';
      case 'password': return !raw ? 'eRequired' : raw.length < PW_MIN ? 'ePassword' : new TextEncoder().encode(raw).length > PW_MAX ? 'ePasswordLong' : '';
      case 'match': return !raw ? 'eRequired' : raw === $('#' + input.dataset.match).value ? '' : 'eMatch';
      case 'consent': return v ? '' : 'eConsent';
    }
    return '';
  }
  function setState(input, key) {
    const field = input.closest('.field');
    fieldError(field, key);
    field.classList.toggle('valid', !key && input.type !== 'checkbox' && input.value.trim() !== '');
    input.setAttribute('aria-invalid', !!key);
  }
  function validateForm(form) {
    let firstBad = null;
    $$('[data-rule]', form).forEach(input => {
      const key = check(input);
      setState(input, key);
      if (key && !firstBad) firstBad = input;
    });
    if (firstBad) { shake(firstBad.closest('.field')); firstBad.focus(); }
    return !firstBad;
  }
  $$('[data-rule]').forEach(input => {
    const evt = input.type === 'checkbox' ? 'change' : 'blur';
    input.addEventListener(evt, () => { if (input.value || input.type === 'checkbox' || input.closest('.field').classList.contains('invalid')) setState(input, check(input)); });
    input.addEventListener('input', () => {
      if (input.closest('.field').classList.contains('invalid')) setState(input, check(input));
      $$(`[data-match="${input.id}"]`).forEach(m => { if (m.value) setState(m, check(m)); });
    });
  });

  /* password strength: only guidance — the rule itself is just the length (AUTH-1) */
  const meters = $$('[data-rule=password]').map(input => {
    const field = input.closest('.field');
    const m = { bar:$('.meter', field), label:$('.meter-label', field) };
    m.update = () => {
      const v = input.value;
      const kinds = [/\p{Ll}/u, /\p{Lu}/u, /\d/, /[^\p{L}\d]/u].filter(r => r.test(v)).length;
      let score = 0;
      if (v) score = v.length < PW_MIN ? 1 : v.length >= 16 && kinds >= 2 ? 4 : v.length >= 16 || kinds >= 3 ? 3 : 2;
      m.bar.dataset.score = score;
      m.label.textContent = t('s' + score);
      m.label.style.color = ['', 'var(--danger)', 'var(--warn)', 'var(--g-600)', 'var(--g-700)'][score];
    };
    input.addEventListener('input', m.update);
    return m;
  });

  $$('.eye').forEach(btn => btn.addEventListener('click', () => {
    const input = btn.parentElement.querySelector('input');
    const showIt = input.type === 'password';
    input.type = showIt ? 'text' : 'password';
    btn.setAttribute('aria-pressed', showIt);
    btn.setAttribute('aria-label', t(showIt ? 'hidePw' : 'showPw'));
  }));

  /* ═════════ Turnstile (AUTH-7) ═════════
     Supabase Auth checks the token itself when "Captcha protection" (Turnstile) is on in Authentication → Attack Protection.
     Then sign up, log in, password reset and "send code again" each need a fresh token (they are single-use). */
  const captcha = (() => {
    const enabled = !!TURNSTILE_SITE_KEY;
    const widgets = new Map();   // element -> { id, token, appearance }
    let ready = false, loading = false, failed = false;
    if (!enabled) $$('.captcha-field').forEach(f => { f.hidden = true; });
    function load() {
      if (loading || ready) return; loading = true;
      window.onTurnstileLoad = () => { ready = true; $$('.view.active [data-captcha]').forEach(el => render(el)); };
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad';
      s.async = true;
      s.onerror = () => { failed = true; $$('.captcha-field').forEach(f => fieldError(f, 'eCaptchaLoad')); };
      document.head.appendChild(s);
    }
    // invisible unless Cloudflare needs a click: log in (until 3 failures) and "send a new code" on the code screens
    function appearanceFor(el) {
      if (el.closest('#login-captcha')) return loginFails < LOGIN_FAILS_FOR_CAPTCHA ? 'interaction-only' : 'always';
      if (el.closest('#verify-captcha, #reset-captcha')) return 'interaction-only';
      return 'always';
    }
    function render(el) {
      if (!ready) return;
      const appearance = appearanceFor(el);
      const old = widgets.get(el);
      if (old && old.appearance === appearance) return;
      if (old) turnstile.remove(old.id);
      const w = { id:null, token:'', appearance };
      widgets.set(el, w);
      el.closest('.captcha-field').classList.toggle('quiet', appearance === 'interaction-only');
      w.id = turnstile.render(el, {
        sitekey: TURNSTILE_SITE_KEY, language: lang, theme: 'light', size: 'flexible', appearance,
        callback: tok => { w.token = tok; fieldError(el.closest('.field'), null); },
        'expired-callback': () => { w.token = ''; },
        'error-callback': code => {
          w.token = '';
          const field = el.closest('.field');
          field.classList.remove('quiet');
          fieldError(field, 'eCaptchaErr', code);
          console.warn('[CallSliven] Turnstile error:', code);
          return true;   // handled; Turnstile retries by itself
        }
      });
    }
    return {
      enabled,
      mountIn(view) { if (!enabled || !view) return; $$('[data-captcha]', view).forEach(el => ready ? render(el) : load()); },
      refresh(el) { if (ready) render(el); },
      // returns a token, waiting a few seconds for the invisible check; '' if there is none
      async token(el) {
        if (!enabled) return undefined;
        if (failed) { fieldError(el.closest('.field'), 'eCaptchaLoad'); return ''; }
        for (let i = 0; i < 25; i++) {
          const w = widgets.get(el);
          if (w && w.token) return w.token;
          if (w && w.appearance === 'always' && i > 0) break;
          await new Promise(r => setTimeout(r, 200));
        }
        const field = el.closest('.field');
        field.classList.remove('quiet');
        fieldError(field, 'eCaptcha'); shake(field);
        return '';
      },
      reset(el) { const w = widgets.get(el); if (w && ready) { turnstile.reset(w.id); w.token = ''; } },
      relang() {
        if (!ready) return;
        widgets.forEach(w => turnstile.remove(w.id));
        widgets.clear();
        $$('.view.active [data-captcha]').forEach(el => render(el));
      },
      refreshError() { if (failed) $$('.captcha-field').forEach(f => fieldError(f, 'eCaptchaLoad')); }
    };
  })();
  const capEl = id => $(`#${id} [data-captcha]`);

  /* ═════════ After a successful log in: deactivated? staff? second factor? ═════════ */
  async function routeAfterLogin() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return show('login');
    const { data: profile } = await sb.from('profiles').select('role, active').eq('id', user.id).maybeSingle();
    if (profile && profile.active === false) {
      await sb.auth.signOut();
      show('login');
      return showAlert($('#login-alert'), 'eDeactivated');
    }
    const staff = profile && (profile.role === 'admin' || profile.role === 'super_admin');
    const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') return startMfa();   // has TOTP, not used yet
    if (staff && (!aal || aal.currentLevel !== 'aal2')) { location.href = MFA_SETUP; return; } // staff without TOTP must set it up (ADM-1)
    location.href = safeNext || (staff ? ADMIN_HOME : CITIZEN_HOME);
  }

  /* ═════════ Log in ═════════ */
  const loginAlert = $('#login-alert');
  let loginFails = 0;
  try { loginFails = +sessionStorage.getItem('cs_login_fails') || 0; } catch (e) {}
  function setLoginFails(n) {
    loginFails = n;
    try { sessionStorage.setItem('cs_login_fails', String(n)); } catch (e) {}
    captcha.refresh(capEl('login-captcha'));
  }

  $('#form-login').addEventListener('submit', async e => {
    e.preventDefault();
    hideAlert(loginAlert);
    if (!validateForm(e.target)) return;
    const email = $('#login-email').value.trim();
    busy(e.target, true);
    const captchaToken = await captcha.token(capEl('login-captcha'));
    if (captchaToken === '') { busy(e.target, false); return; }
    const { error } = await sb.auth.signInWithPassword({ email, password:$('#login-password').value, options:{ captchaToken } });
    captcha.reset(capEl('login-captcha'));
    busy(e.target, false);
    if (!error) { setLoginFails(0); return routeAfterLogin(); }

    if (error.code === 'email_not_confirmed') {        // only possible with the right password, so it reveals nothing (AUTH-6)
      pendingEmail = email;
      openVerify(false);
      return showAlert($('#verify-alert'), 'eUnconfirmed', { type:'warn' });
    }
    const key = errKey(error, 'eLogin');
    if (key === 'eLogin' || key === 'eCaptchaServer') {
      setLoginFails(loginFails + 1);
      $('#login-password').value = '';
      return showAlert(loginAlert, loginFails >= LOGIN_FAILS_FOR_CAPTCHA ? 'eLoginCaptcha' : 'eLogin');
    }
    showAlert(loginAlert, key);
  });

  /* ═════════ Sign up ═════════ */
  let regOpenedAt = Date.now();
  $('#form-register').addEventListener('submit', async e => {
    e.preventDefault();
    const al = $('#register-alert'); hideAlert(al);
    if (!validateForm(e.target)) return;
    const email = $('#reg-email').value.trim();
    // AUTH-8: a bot that fills the hidden field gets the normal next screen, but nothing is sent.
    if ($('#reg-hp').value) { pendingEmail = email; return openVerify(false); }

    busy(e.target, true);
    // AUTH-8: minimum time. A form sent too fast (bot, or browser autofill) simply waits the rest of the time.
    const left = MIN_FILL_MS - (Date.now() - regOpenedAt);
    if (left > 0) await new Promise(r => setTimeout(r, left));
    const captchaToken = await captcha.token(capEl('register-captcha'));
    if (captchaToken === '') { busy(e.target, false); return; }
    const { error } = await sb.auth.signUp({
      email,
      password: $('#reg-password').value,
      options: {
        captchaToken,
        // read by public.handle_new_user() (migration 006) to create the profile
        data: {
          first_name: $('#reg-first').value.trim(),
          last_name: $('#reg-last').value.trim(),
          phone: $('#reg-phone').value.trim() || null,
          consent_version: POLICY_VERSION
        }
      }
    });
    captcha.reset(capEl('register-captcha'));
    busy(e.target, false);
    // an email that already has a profile gives no error (Supabase hides it), so the next screen is the same for everyone (AUTH-6)
    if (error) {
      const key = errKey(error);
      if (key === 'eWeak') return setState($('#reg-password'), 'eWeak');
      if (key === 'eEmail') return setState($('#reg-email'), 'eEmail');
      return showAlert(al, key);
    }
    pendingEmail = email;
    openVerify(true);
  });

  /* ═════════ Code screens: shared resend timer (AUTH-3) ═════════ */
  const HOUR = 3600e3;
  function sentLog() { try { return JSON.parse(localStorage.getItem('cs_code_sent') || '[]').filter(x => Date.now() - x < HOUR); } catch (e) { return []; } }
  function logSent() { const l = sentLog(); l.push(Date.now()); try { localStorage.setItem('cs_code_sent', JSON.stringify(l)); } catch (e) {} }
  let waitUntil = 0, waitTimer = null;
  function resendState() {
    const l = sentLog();
    if (l.length >= RESEND_PER_HOUR) return { blocked:true, min:Math.ceil((HOUR - (Date.now() - l[0])) / 60000) };
    return { blocked:false, sec:Math.max(0, Math.ceil((waitUntil - Date.now()) / 1000)) };
  }
  function renderResend() {
    $$('#verify-resend, #reset-resend').forEach(b => {
      const s = resendState();
      b.textContent = s.blocked ? t('resendLimit')(s.min) : s.sec > 0 ? t('resendIn')(s.sec) : t('resendCode');
      b.disabled = s.blocked || s.sec > 0;
    });
  }
  function startWait(sent = true) {
    if (sent) logSent();
    waitUntil = Date.now() + RESEND_WAIT * 1000;
    clearInterval(waitTimer);
    renderResend();
    waitTimer = setInterval(() => { renderResend(); if (resendState().sec <= 0 && !resendState().blocked) clearInterval(waitTimer); }, 1000);
  }

  function makeCodeBox(fieldId, formId) {
    const field = $('#' + fieldId);
    const box = OtpInput($('[data-otp]', field), {
      onComplete: () => { if (!box.locked) $('#' + formId).requestSubmit(); },
      onInput: () => { if (field.classList.contains('invalid') && !box.locked) { fieldError(field, null); box.setInvalid(false); } }
    });
    box.field = field; box.tries = 0; box.locked = false;
    box.reset = () => { box.clear(); box.tries = 0; box.locked = false; fieldError(field, null); box.setInvalid(false); $$('input', field).forEach(i => { i.disabled = false; }); };
    box.wrong = () => {
      box.tries++;
      box.clear(); box.setInvalid(true); shake(field);
      if (box.tries >= CODE_TRIES) {
        box.locked = true;
        $$('input', field).forEach(i => { i.disabled = true; });
        fieldError(field, 'eCodeLocked');
      } else { fieldError(field, 'eCodeWrong', CODE_TRIES - box.tries); box.focus(); }
    };
    return box;
  }
  const verifyBox = makeCodeBox('verify-otp', 'form-verify');
  const resetBox = makeCodeBox('reset-otp', 'form-reset');
  const mfaBox = makeCodeBox('mfa-otp', 'form-mfa');

  /* ═════════ Confirm the email with the code ═════════ */
  function openVerify(sent) {
    verifyBox.reset(); hideAlert($('#verify-alert'));
    if (sent) startWait(); else renderResend();
    show('verify');
  }
  $('#form-verify').addEventListener('submit', async e => {
    e.preventDefault();
    hideAlert($('#verify-alert'));
    if (verifyBox.locked) return;
    if (!verifyBox.complete()) { fieldError(verifyBox.field, 'eCode'); shake(verifyBox.field); return; }
    busy(e.target, true);
    const { error } = await sb.auth.verifyOtp({ email:pendingEmail, token:verifyBox.value(), type:'signup' });
    busy(e.target, false);
    if (error) {
      const key = errKey(error, 'code');
      return key === 'code' ? verifyBox.wrong() : showAlert($('#verify-alert'), key);
    }
    verifyBox.success();
    setTimeout(routeAfterLogin, reduce ? 0 : 500);   // the code also logs the user in
  });
  $('#verify-resend').addEventListener('click', async () => {
    if (resendState().blocked || resendState().sec > 0) return;
    const btn = $('#verify-resend');
    const captchaToken = await captcha.token(capEl('verify-captcha'));
    if (captchaToken === '') return;
    btn.disabled = true;
    const { error } = await sb.auth.resend({ type:'signup', email:pendingEmail, options:{ captchaToken } });
    captcha.reset(capEl('verify-captcha'));
    if (error) { renderResend(); return showAlert($('#verify-alert'), errKey(error)); }
    verifyBox.reset(); verifyBox.focus(); startWait();
    showAlert($('#verify-alert'), 'iCodeSent', { type:'info' });
  });

  /* ═════════ Forgot password → code + new password ═════════ */
  $('#form-forgot').addEventListener('submit', async e => {
    e.preventDefault();
    const al = $('#forgot-alert'); hideAlert(al);
    if (!validateForm(e.target)) return;
    const email = $('#forgot-email').value.trim();
    busy(e.target, true);
    const captchaToken = await captcha.token(capEl('forgot-captcha'));
    if (captchaToken === '') { busy(e.target, false); return; }
    const { error } = await sb.auth.resetPasswordForEmail(email, { captchaToken });
    captcha.reset(capEl('forgot-captcha'));
    busy(e.target, false);
    const key = errKey(error, null);
    if (key) return showAlert(al, key);           // only real problems (network, captcha, limits); never "no such email" (AUTH-6)
    pendingEmail = email;
    openReset();
  });
  let recoveryVerified = false;
  function openReset() {
    recoveryVerified = false;
    resetBox.reset(); hideAlert($('#reset-alert'));
    $('#reset-username').value = pendingEmail;
    $('#reset-password').value = ''; $('#reset-password2').value = '';
    meters.forEach(m => m.update());
    startWait();
    show('reset');
  }
  $('#form-reset').addEventListener('submit', async e => {
    e.preventDefault();
    const al = $('#reset-alert'); hideAlert(al);
    if (!recoveryVerified) {
      if (resetBox.locked) return;
      if (!resetBox.complete()) { fieldError(resetBox.field, 'eCode'); shake(resetBox.field); resetBox.focus(); return; }
    }
    if (!validateForm(e.target)) return;
    busy(e.target, true);
    if (!recoveryVerified) {
      const { error } = await sb.auth.verifyOtp({ email:pendingEmail, token:resetBox.value(), type:'recovery' });
      if (error) {
        busy(e.target, false);
        const key = errKey(error, 'code');
        return key === 'code' ? resetBox.wrong() : showAlert(al, key);
      }
      recoveryVerified = true;     // a weak-password retry must not ask for the code again
      resetBox.success();
    }
    const { error } = await sb.auth.updateUser({ password:$('#reset-password').value });
    if (error) {
      busy(e.target, false);
      const key = errKey(error);
      return key === 'eWeak' || key === 'eSame' ? setState($('#reset-password'), key) : showAlert(al, key);
    }
    await sb.auth.signOut({ scope:'global' });      // every device logs out after a password change
    busy(e.target, false);
    $('#login-email').value = pendingEmail;
    openStatus({ kind:'ok', key:'stPwOk', act:'actLogin', go:'login' });
  });
  $('#reset-resend').addEventListener('click', async () => {
    if (resendState().blocked || resendState().sec > 0) return;
    const captchaToken = await captcha.token(capEl('reset-captcha'));
    if (captchaToken === '') return;
    $('#reset-resend').disabled = true;
    const { error } = await sb.auth.resetPasswordForEmail(pendingEmail, { captchaToken });
    captcha.reset(capEl('reset-captcha'));
    const key = errKey(error, null);
    if (key) { renderResend(); return showAlert($('#reset-alert'), key); }
    recoveryVerified = false; resetBox.reset(); resetBox.focus(); startWait();
    showAlert($('#reset-alert'), 'iCodeSent', { type:'info' });
  });

  /* ═════════ Second factor for staff (ADM-1) ═════════ */
  let mfaFactorId = null;
  async function startMfa() {
    const { data, error } = await sb.auth.mfa.listFactors();
    const factor = !error && data && data.totp && data.totp.find(f => f.status === 'verified');
    if (!factor) { location.href = MFA_SETUP; return; }
    mfaFactorId = factor.id;
    mfaBox.reset(); hideAlert($('#mfa-alert'));
    show('mfa');
  }
  $('#form-mfa').addEventListener('submit', async e => {
    e.preventDefault();
    hideAlert($('#mfa-alert'));
    if (mfaBox.locked) return;
    if (!mfaBox.complete()) { fieldError(mfaBox.field, 'eCode'); shake(mfaBox.field); return; }
    busy(e.target, true);
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId:mfaFactorId, code:mfaBox.value() });
    busy(e.target, false);
    if (error) {
      const key = errKey(error, 'code');
      if (key !== 'code') return showAlert($('#mfa-alert'), key);
      mfaBox.wrong();
      if (mfaBox.locked) { await sb.auth.signOut(); show('login'); showAlert(loginAlert, 'eTooMany'); }
      return;
    }
    mfaBox.success();
    setTimeout(routeAfterLogin, reduce ? 0 : 400);
  });
  $('#mfa-back').addEventListener('click', async () => { await sb.auth.signOut(); show('login'); });

  /* ═════════ Result screen ═════════ */
  const ICONS = { ok:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>' };
  let status = null;
  function openStatus(s) { status = s; show('status', false); setTimeout(() => $('#status-act').focus(), 150); }
  function renderStatus() {
    if (!status) return;
    const ico = $('#status-ico');
    ico.className = 'done-ico';
    ico.innerHTML = ICONS.ok;
    $('#status-title').textContent = t(status.key + 'T');
    $('#status-text').textContent = t(status.key + 'X');
    $('.btn-text', $('#status-act')).textContent = t(status.act);
  }
  $('#status-act').addEventListener('click', () => status && show(status.go));

  /* ═════════ Language ═════════ */
  function applyLang(next) {
    lang = next === 'en' ? 'en' : 'bg';
    try { localStorage.setItem('language', lang); } catch (e) {}
    document.documentElement.lang = lang;
    document.title = t('docTitle') + ' · CallSliven';
    $$('[data-i18n]').forEach(el => { const v = T[lang][el.dataset.i18n]; if (typeof v === 'string') el.innerHTML = v; });
    $$('.lang button').forEach(b => { const on = b.dataset.lang === lang; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on); });
    $$('.eye').forEach(b => b.setAttribute('aria-label', t(b.getAttribute('aria-pressed') === 'true' ? 'hidePw' : 'showPw')));
    [verifyBox, resetBox, mfaBox].forEach(b => b.setLabels(t('otpDigit')));
    renderHead(); meters.forEach(m => m.update()); renderResend(); renderLive();
    $$('.field.invalid').forEach(f => { if (f._err) fieldError(f, f._err.key, f._err.arg); });
    $$('.alert.show').forEach(renderAlert);
    captcha.relang(); captcha.refreshError();
  }
  $$('.lang button').forEach(b => b.addEventListener('click', () => applyLang(b.dataset.lang)));

  /* ═════════ Images: drop a missing photo/crest quietly (no inline onerror, SEC-3) ═════════ */
  $$('img').forEach(img => {
    const drop = () => img.remove();
    if (img.complete && !img.naturalWidth) drop(); else img.addEventListener('error', drop);
  });

  /* ═════════ Card on the photo: the latest real public report (search_public_reports) ═════════
     Hidden when there is none or the request fails — no made-up examples. */
  const live = $('#live-status'), liveCard = $('.live');
  const LIVE_CLS = { new:'st-new', sent:'st-sent', in_progress:'st-progress', resolved:'st-resolved', closed:'st-new' };
  let latest = null;
  function renderLive() {
    liveCard.hidden = !latest;
    if (!latest) return;
    $('.live-title', liveCard).textContent = latest.title;
    $('.live-sub', liveCard).textContent = latest.sub;
    $('span', live).textContent = t('st_' + latest.status) || '';
    live.className = 'status ' + (LIVE_CLS[latest.status] || 'st-new');
  }
  sb.rpc('search_public_reports', { p_limit:1 }).then(({ data }) => {
    const r = data && data[0];
    if (r) latest = { title:r.out_title, sub:[r.out_subcategory, r.out_address].filter(Boolean).join(' · '), status:r.out_status };
    renderLive();
  }, () => renderLive());

  /* ═════════ Start ═════════ */
  applyLang(lang);
  const start = location.hash.replace('#', '');
  show(['login','register','forgot'].includes(start) ? start : 'login', false);
  // already logged in (e.g. came back to this page): finish the second factor or go on
  sb.auth.getSession().then(({ data }) => { if (data && data.session) routeAfterLogin(); }).catch(() => {});
})();