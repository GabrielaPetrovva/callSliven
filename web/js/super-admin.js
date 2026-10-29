/* CallSliven — Super Admin page: accounts and roles (SA-1), contacts with a reason (SA-3),
   sending switches (SA-2) and the log (Audit Log + system events).
   The browser decides nothing about access: every function checks is_super_admin() (role + aal2) in the database,
   and every change needs a reason that goes into the Audit Log. Texts from the database go in with textContent (SEC-5).
   Email and phone are never listed: they come only from super_admin_get_contact, are kept in memory only
   while that account is open, and are gone after closing it or reloading the page. */
(() => {
  const { $, $$ } = CS;

  CS.addStrings({
    bg: {
      saTitle:'Super <em>Admin</em>', saLead:'Акаунти и роли, изпращане към институциите и журнал. Всяко действие иска причина и се записва в журнала.',
      docTitle:'Super Admin', deniedT:'Нямаш достъп', deniedX:'Тази страница е само за Super Admin.', deniedAdminX:'Тази страница е само за Super Admin. Сигналите са в админ панела.',
      toHome:'Към началото', close:'Затвори', more:'Покажи още', cancel:'Отказ',
      tabAccounts:'Акаунти', tabSending:'Изпращане', tabLog:'Журнал', flagPaused:'спряно',
      // accounts
      uSearchLabel:'Търсене на акаунт', uSearchPh:'Име, точен имейл или № на сигнал', fRole:'Роля',
      uHint:'Имейл се търси само по точен адрес. Имейлът и телефонът не се показват в списъка — само с бутона „Покажи имейл и телефон“ и причина.',
      roleAll:'Всички роли', r_citizen:'Гражданин', r_admin:'Администратор', r_super_admin:'Super Admin',
      uStaff:'Служители', uResults:'Резултати', uFound:n => `${n} ${n === 1 ? 'акаунт' : 'акаунта'}`, uMany:'Показани са първите 100 — стесни търсенето.',
      uEmpty:'Няма акаунт по това търсене.', uEmptyStaff:'Няма служители.', eQuery:'Напиши поне 2 букви, точен имейл или номер на сигнал.',
      noName:'Без име', you:'Ти', inactive:'Деактивиран', restricted:d => `Ограничен до ${d}`, noMfa:'Без втори фактор', unconfirmed:'Непотвърден имейл',
      byReport:n => `Подател на сигнал №${n}`, byEmail:'Намерен по имейл',
      joined:'Регистриран', lastIn:'Последен вход', never:'Никога', reportsN:n => `${n} ${n === 1 ? 'сигнал' : 'сигнала'}`,
      fState:'Състояние', sActive:'Активен', sInactive:'Деактивиран', fMfa:'Втори фактор (TOTP)', mfaYes:'Настроен', mfaNo:'Не е настроен', mfaNotNeeded:'Не е нужен',
      fEmailOk:'Имейл', emailYes:'Потвърден', emailNo:'Не е потвърден', fReports:'Подадени сигнали', fRestricted:'Ограничен до',
      openReport:n => `Отвори сигнал №${n} в админ панела`,
      boxNoMfa:'Няма настроен втори фактор. При следващия вход ще бъде пратен да го настрои; дотогава няма достъп до панела.',
      boxUnconfirmed:'Имейлът не е потвърден, затова човекът още не може да влезе.',
      boxSelf:'Това е твоят акаунт.',
      actions:'Действия', aRole:'Смени ролята', aDeactivate:'Деактивирай', aActivate:'Активирай', aContact:'Покажи имейл и телефон',
      fNewRole:'Нова роля', roleX_citizen:'Вижда и подава само собствените си сигнали.',
      roleX_admin:'Вижда всички сигнали и имената на подателите и действа по тях. Без имейли, телефони и настройки. Трябва да настрои втори фактор (TOTP) при първия вход.',
      roleX_super_admin:'Всичко на администратора, плюс роли, настройки за изпращане, контакти с причина и целия журнал. Трябва да има втори фактор.',
      fReason:'Причина', fReasonHint:'Задължително, поне 5 знака. Записва се в журнала заедно с твоето име.',
      fRoleNotice:'Човекът получава имейл, че ролята му е сменена.',
      fDeactX:'Акаунтът не се изтрива. Човекът не може да влиза в панела и да подава сигнали; ако е влязъл, излиза при следващото отваряне на сайта. Сигналите му остават.',
      fActX:'Акаунтът отново може да влиза със същата роля.',
      warnSelfRole:'Сменяш собствената си роля. Ако не си Super Admin, губиш достъпа до тази страница веднага.',
      warnSelfOff:'Деактивираш собствения си акаунт. Ще излезеш от сайта и няма да можеш да влезеш.',
      fContactX:'Имейлът и телефонът се показват само с причина. Причината и твоето име се записват в журнала, а другите Super Admin получават известие по имейл.',
      fContactReason:'Причина за достъпа', fContactHint:'Задължително, поне 10 знака. Например: „Уточнение на адреса по сигнал №123“.',
      saveRole:'Запази ролята', showContact:'Покажи',
      cEmail:'Имейл', cPhone:'Телефон', cNoPhone:'няма', cShownAt:t => `Показано в ${t}. Достъпът е записан в журнала. Данните изчезват, когато затвориш акаунта.`, cHide:'Скрий',
      okRole:'Ролята е сменена', okOff:'Акаунтът е деактивиран', okOn:'Акаунтът е активиран',
      eSameRole:'Това вече е ролята на акаунта.', eShort:n => `Поне ${n} знака.`, eEmail:'Въведи валиден имейл.',
      // sending
      swOnT:'Изпращането е включено', swOnX:'Администраторите изпращат сигнали към институциите. Писмата тръгват от опашката всяка минута.',
      swOffT:'Всички изпращания са спрени', swOffX:n => `Новите сигнали не могат да се изпращат, а писмата в опашката (${n}) чакат. Тръгват сами, когато пуснеш изпращанията отново. Писмата до гражданите не се спират.`,
      swQueue:n => `В опашката в момента: ${n}.`, aPause:'Спри всички изпращания', aResume:'Пусни изпращанията',
      fPauseX:'Използвай го при грешка в писмата, проблем с имейл доставчика или съмнение за злоупотреба. Записва се в журнала.',
      fResumeX:'Писмата в опашката тръгват при следващото минаване (до минута).',
      demoT:'Демо имейл', demoNone:'Не е настроен', demoX:'Тук отиват писмата за институциите с изключено реално изпращане. Докато домейнът в Resend не е проверен, сложи имейла на Resend акаунта.',
      demoUsers:n => `${n} ${n === 1 ? 'институция получава' : 'институции получават'} писмата си тук.`, aDemo:'Смени', fDemoEmail:'Нов демо имейл',
      okPause:'Изпращанията са спрени', okResume:'Изпращанията са пуснати', okDemo:'Демо имейлът е сменен',
      instTitle:'Реално изпращане по институция', instCount:(n, t) => `реално: ${n} от ${t}`,
      instHint:'Докато е изключено, писмата до институцията отиват на демо имейла. Може да се включи само за институция с имейл и контакт, потвърден от официален източник. Промяната важи за следващите изпращания — писмата, които вече са в опашката, не се пренасочват.',
      v_confirmed:'Потвърден контакт', v_partial:'Частично потвърден', v_not_found:'Непотвърден контакт',
      iReal:'Реално', iDemo:'Демо', iManual:'Без имейл — ръчно', iInactive:'Неактивна', iNoEmail:'Няма имейл — администраторът я уведомява ръчно.',
      iNeedVerify:'За реално изпращане контактът трябва да е потвърден (обновява се с миграция).',
      aRealOn:'Включи реално изпращане', aRealOff:'Изключи',
      fRealOnX:(n, e) => `Писмата за „${n}“ ще отиват на истинския ѝ имейл: ${e}. Увери се, че институцията знае за платформата и очаква писма от нея.`,
      fRealOffX:n => `Писмата за „${n}“ отново ще отиват на демо имейла.`,
      okRealOn:'Реалното изпращане е включено', okRealOff:'Реалното изпращане е изключено',
      // log
      fGroup:'Вид', gAll:'Всички действия', gReports:'Сигнали и изпращания', gUsers:'Акаунти и роли', gContacts:'Достъп до контакти', gSettings:'Настройки за изпращане', gSystem:'Системни събития',
      logHint:'Журналът се пази 12 месеца и не може да се променя или трие.', sysHint:'Системните събития се пазят 30 дни и не съдържат лични данни.',
      logEmpty:'Няма записи.', system:'Система', by:'от',
      'a_report.created':'Подаден сигнал', 'a_report.withdrawn':'Оттеглен от подателя', 'a_report.approved':'Одобрен подозрителен сигнал',
      'a_report.rejected':'Отхвърлен сигнал', 'a_report.status_changed':'Сменен статус', 'a_report.classification_changed':'Сменена класификация',
      'a_report.linked_duplicate':'Свързан като дубликат', 'a_report.sent':'Изпратен към институция', 'a_report.resent':'Изпратен отново',
      'a_dispatch.failed':'Неуспешна доставка', 'a_dispatch.forwarded_manually':'Отбелязан като препратен ръчно',
      'a_user.restricted':'Ограничен акаунт', 'a_user.role_changed':'Сменена роля или състояние', 'a_contact.accessed':'Прегледани имейл и телефон',
      'a_settings.changed':'Сменени настройки за изпращане', 'a_institution.real_send_changed':'Реално изпращане за институция', 'a_consent.accepted':'Прието ново съгласие с политиката',
      dFrom:(a, b) => `${a} → ${b}`, dAttempt:n => `опит ${n}`, dDays:n => n === 0 ? 'ограничението е свалено' : `за ${n} ${n === 1 ? 'ден' : 'дни'}`,
      dSuspicious:'скрит до преглед', dDemoChanged:'сменен демо имейл', dOn:'включено', dOff:'изключено', dActive:'активен', dInactive:'деактивиран',
      dSub:'подкатегория', dInst:'институция', dPrio:'приоритет', dMain:n => `към №${n}`, dWebhook:'по известие от доставчика',
      s_new:'Нов', s_sent:'Изпратен', s_in_progress:'В обработка', s_resolved:'Решен', s_closed:'Затворен', s_rejected:'Отхвърлен', s_withdrawn:'Оттеглен',
      p_critical:'Критичен', p_high:'Висок', p_medium:'Среден', p_low:'Нисък',
      rj_insufficient_info:'Недостатъчна информация', rj_out_of_scope:'Извън компетенциите на общината', rj_inappropriate:'Неприемливо съдържание', rj_spam:'Спам',
      l_info:'инфо', l_warning:'внимание', l_error:'грешка',
      // shared
      inIn:x => `след ${x}`, ago:x => `преди ${x}`, uMin:n => `${n} мин`, uH:n => `${n} ч`, uD:n => `${n} ${n === 1 ? 'ден' : 'дни'}`,
      eLoad:'Данните не се заредиха. Провери връзката и опитай пак.', eAction:'Действието не мина. Опитай отново.',
      e_not_super_admin:'Сесията без втори фактор е изтекла или нямаш права. Влез отново.',
      e_reason_required:'Напиши причина (поне 5 знака; за контакти — поне 10).', e_last_super_admin:'Това е последният активен Super Admin. Първо дай роля Super Admin на друг човек.',
      e_user_not_found:'Акаунтът вече не съществува.', e_invalid_query:'Напиши поне 2 букви, точен имейл или номер на сигнал.',
      e_contact_not_verified:'Институцията няма имейл или контактът ѝ не е потвърден.', e_invalid_institution:'Институцията не е намерена.',
      e_invalid_group:'Непознат вид записи.'
    },
    en: {
      saTitle:'Super <em>Admin</em>', saLead:'Accounts and roles, sending to institutions, and the log. Every action needs a reason and is saved in the log.',
      docTitle:'Super Admin', deniedT:'No access', deniedX:'This page is for a Super Admin only.', deniedAdminX:'This page is for a Super Admin only. Reports are in the admin panel.',
      toHome:'Back to home', close:'Close', more:'Show more', cancel:'Cancel',
      tabAccounts:'Accounts', tabSending:'Sending', tabLog:'Log', flagPaused:'paused',
      uSearchLabel:'Search accounts', uSearchPh:'Name, exact email or report number', fRole:'Role',
      uHint:'Email is matched only exactly. Email and phone are not shown in the list — only with the "Show email and phone" button and a reason.',
      roleAll:'All roles', r_citizen:'Citizen', r_admin:'Administrator', r_super_admin:'Super Admin',
      uStaff:'Staff', uResults:'Results', uFound:n => `${n} ${n === 1 ? 'account' : 'accounts'}`, uMany:'Showing the first 100 — narrow the search.',
      uEmpty:'No account matches this search.', uEmptyStaff:'No staff yet.', eQuery:'Type at least 2 letters, an exact email or a report number.',
      noName:'No name', you:'You', inactive:'Deactivated', restricted:d => `Restricted until ${d}`, noMfa:'No second factor', unconfirmed:'Email not confirmed',
      byReport:n => `Submitted report #${n}`, byEmail:'Found by email',
      joined:'Signed up', lastIn:'Last log in', never:'Never', reportsN:n => `${n} ${n === 1 ? 'report' : 'reports'}`,
      fState:'State', sActive:'Active', sInactive:'Deactivated', fMfa:'Second factor (TOTP)', mfaYes:'Set up', mfaNo:'Not set up', mfaNotNeeded:'Not needed',
      fEmailOk:'Email', emailYes:'Confirmed', emailNo:'Not confirmed', fReports:'Reports sent', fRestricted:'Restricted until',
      openReport:n => `Open report #${n} in the admin panel`,
      boxNoMfa:'No second factor yet. At the next log in they are sent to set it up; until then they cannot open the panel.',
      boxUnconfirmed:'The email is not confirmed, so this person cannot log in yet.',
      boxSelf:'This is your account.',
      actions:'Actions', aRole:'Change role', aDeactivate:'Deactivate', aActivate:'Activate', aContact:'Show email and phone',
      fNewRole:'New role', roleX_citizen:'Sees and sends only their own reports.',
      roleX_admin:'Sees all reports and submitter names and acts on them. No emails, phones or settings. Must set up a second factor (TOTP) at the first log in.',
      roleX_super_admin:'Everything an administrator has, plus roles, sending settings, contacts with a reason and the whole log. Needs a second factor.',
      fReason:'Reason', fReasonHint:'Required, at least 5 characters. Saved in the log with your name.',
      fRoleNotice:'The person gets an email that their role changed.',
      fDeactX:'The account is not deleted. The person cannot open the panel or send reports; if logged in, they are logged out the next time they open the site. Their reports stay.',
      fActX:'The account can log in again with the same role.',
      warnSelfRole:'You are changing your own role. If you are no longer a Super Admin, you lose this page at once.',
      warnSelfOff:'You are deactivating your own account. You will be logged out and cannot log in again.',
      fContactX:'Email and phone are shown only with a reason. The reason and your name are saved in the log, and the other Super Admins get an email notice.',
      fContactReason:'Reason for access', fContactHint:'Required, at least 10 characters. For example: "Checking the address for report #123".',
      saveRole:'Save role', showContact:'Show',
      cEmail:'Email', cPhone:'Phone', cNoPhone:'none', cShownAt:t => `Shown at ${t}. The access is saved in the log. The data is gone when you close the account.`, cHide:'Hide',
      okRole:'Role changed', okOff:'Account deactivated', okOn:'Account activated',
      eSameRole:'The account already has this role.', eShort:n => `At least ${n} characters.`, eEmail:'Enter a valid email.',
      swOnT:'Sending is on', swOnX:'Administrators send reports to institutions. The queue is sent every minute.',
      swOffT:'All sending is paused', swOffX:n => `New reports cannot be sent, and the emails in the queue (${n}) wait. They go out by themselves when you resume sending. Emails to citizens are not paused.`,
      swQueue:n => `In the queue now: ${n}.`, aPause:'Pause all sending', aResume:'Resume sending',
      fPauseX:'Use it for a mistake in the emails, a problem with the email provider or suspected abuse. It is saved in the log.',
      fResumeX:'The emails in the queue go out on the next run (within a minute).',
      demoT:'Demo email', demoNone:'Not set', demoX:'Emails for institutions with real sending off go here. Until the domain is verified in Resend, use the Resend account email.',
      demoUsers:n => `${n} ${n === 1 ? 'institution gets' : 'institutions get'} their emails here.`, aDemo:'Change', fDemoEmail:'New demo email',
      okPause:'Sending paused', okResume:'Sending resumed', okDemo:'Demo email changed',
      instTitle:'Real sending by institution', instCount:(n, t) => `real: ${n} of ${t}`,
      instHint:'While off, emails to the institution go to the demo address. It can be turned on only for an institution with an email and a contact confirmed by an official source. The change applies to the next sends — emails already in the queue are not redirected.',
      v_confirmed:'Contact confirmed', v_partial:'Partly confirmed', v_not_found:'Contact not confirmed',
      iReal:'Real', iDemo:'Demo', iManual:'No email — by hand', iInactive:'Inactive', iNoEmail:'No email — an administrator notifies it by hand.',
      iNeedVerify:'Real sending needs a confirmed contact (updated with a migration).',
      aRealOn:'Turn on real sending', aRealOff:'Turn off',
      fRealOnX:(n, e) => `Emails for "${n}" will go to its real address: ${e}. Make sure the institution knows about the platform and expects its emails.`,
      fRealOffX:n => `Emails for "${n}" will go to the demo address again.`,
      okRealOn:'Real sending turned on', okRealOff:'Real sending turned off',
      fGroup:'Kind', gAll:'All actions', gReports:'Reports and sending', gUsers:'Accounts and roles', gContacts:'Contact access', gSettings:'Sending settings', gSystem:'System events',
      logHint:'The log is kept for 12 months and cannot be changed or deleted.', sysHint:'System events are kept for 30 days and contain no personal data.',
      logEmpty:'No entries.', system:'System', by:'by',
      'a_report.created':'Report sent', 'a_report.withdrawn':'Withdrawn by the submitter', 'a_report.approved':'Suspicious report approved',
      'a_report.rejected':'Report rejected', 'a_report.status_changed':'Status changed', 'a_report.classification_changed':'Classification changed',
      'a_report.linked_duplicate':'Linked as a duplicate', 'a_report.sent':'Sent to the institution', 'a_report.resent':'Sent again',
      'a_dispatch.failed':'Delivery failed', 'a_dispatch.forwarded_manually':'Marked as forwarded by hand',
      'a_user.restricted':'Account restricted', 'a_user.role_changed':'Role or state changed', 'a_contact.accessed':'Email and phone viewed',
      'a_settings.changed':'Sending settings changed', 'a_institution.real_send_changed':'Real sending for an institution', 'a_consent.accepted':'New policy accepted',
      dFrom:(a, b) => `${a} → ${b}`, dAttempt:n => `attempt ${n}`, dDays:n => n === 0 ? 'restriction lifted' : `for ${n} ${n === 1 ? 'day' : 'days'}`,
      dSuspicious:'hidden until review', dDemoChanged:'demo email changed', dOn:'on', dOff:'off', dActive:'active', dInactive:'deactivated',
      dSub:'subcategory', dInst:'institution', dPrio:'priority', dMain:n => `to #${n}`, dWebhook:'from the provider notice',
      s_new:'New', s_sent:'Sent', s_in_progress:'In progress', s_resolved:'Resolved', s_closed:'Closed', s_rejected:'Rejected', s_withdrawn:'Withdrawn',
      p_critical:'Critical', p_high:'High', p_medium:'Medium', p_low:'Low',
      rj_insufficient_info:'Not enough information', rj_out_of_scope:"Outside the municipality's competence", rj_inappropriate:'Inappropriate content', rj_spam:'Spam',
      l_info:'info', l_warning:'warning', l_error:'error',
      inIn:x => `in ${x}`, ago:x => `${x} ago`, uMin:n => `${n} min`, uH:n => `${n} h`, uD:n => `${n} ${n === 1 ? 'day' : 'days'}`,
      eLoad:"The data didn't load. Check the connection and try again.", eAction:"The action didn't go through. Try again.",
      e_not_super_admin:'Your second-factor session expired or you have no rights. Log in again.',
      e_reason_required:'Write a reason (at least 5 characters; at least 10 for contacts).', e_last_super_admin:'This is the last active Super Admin. Give the Super Admin role to someone else first.',
      e_user_not_found:'The account no longer exists.', e_invalid_query:'Type at least 2 letters, an exact email or a report number.',
      e_contact_not_verified:'The institution has no email or its contact is not confirmed.', e_invalid_institution:'Institution not found.',
      e_invalid_group:'Unknown kind of entries.'
    }
  });

  /* ═════════ Small helpers (same as admin.js) ═════════ */
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const tr = (key, ...a) => { const v = CS.t(key); return typeof v === 'function' ? v(...a) : (v === undefined ? key : v); };
  const has = key => CS.t(key) !== undefined;
  const loc = () => CS.lang === 'bg' ? 'bg-BG' : 'en-GB';
  const fmt = iso => iso ? new Date(iso).toLocaleString(loc(), { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
  const fmtDay = iso => iso ? new Date(iso).toLocaleDateString(loc(), { day:'numeric', month:'short', year:'numeric' }) : '—';
  const hhmm = d => d.toLocaleTimeString(loc(), { hour:'2-digit', minute:'2-digit' });
  function rel(iso) {
    const ms = new Date(iso) - Date.now(), a = Math.abs(ms);
    const x = a < 3600e3 ? tr('uMin', Math.max(1, Math.round(a / 60e3))) : a < 48 * 3600e3 ? tr('uH', Math.round(a / 3600e3)) : tr('uD', Math.round(a / 864e5));
    return ms >= 0 ? tr('inIn', x) : tr('ago', x);
  }
  const pill = (cls, text) => el('span', 'a-pill ' + cls, text);
  const fullName = u => [u.out_first_name, u.out_last_name].map(s => (s || '').trim()).filter(Boolean).join(' ');
  const isStaff = r => r === 'admin' || r === 'super_admin';
  const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;          // same rule as app_settings.demo_email in the database
  const errCode = (error, codes) => codes.find(c => ((error && error.message) || '').includes(c));
  const ACTION_ERRORS = ['not_super_admin', 'reason_required', 'last_super_admin', 'user_not_found', 'invalid_query',
    'contact_not_verified', 'invalid_institution', 'invalid_group'];

  let alertKey = null;
  function showAlert(key) { alertKey = key; $('#alert .alert-text').textContent = CS.t(key); $('#alert').classList.add('show'); }
  function hideAlert() { alertKey = null; $('#alert').classList.remove('show'); }
  let toastT;
  function toast(text) { const t = $('#toast'); t.textContent = text; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3200); }

  /* a small form: fields + error line + Cancel / Confirm. read() returns the job or throws a message key */
  function actForm({ parts, go, danger, read, run, onCancel }) {
    const form = el('form', 'act-form'); form.noValidate = true;
    parts.forEach(p => p && form.append(p));
    const err = el('p', 'act-err'); err.setAttribute('role', 'alert');
    const nav = el('div', 'act-nav');
    const no = el('button', 'btn btn-sm btn-ghost', CS.t('cancel')); no.type = 'button';
    const yes = el('button', 'btn btn-sm ' + (danger ? 'btn-danger' : 'btn-accent')); yes.type = 'submit';
    yes.innerHTML = '<span class="spin" aria-hidden="true"></span>'; yes.append(el('span', null, go));
    no.addEventListener('click', onCancel);
    nav.append(no, yes); form.append(err, nav);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      err.classList.remove('show');
      let job;
      try { job = read(); }
      catch (k) { err.textContent = Array.isArray(k) ? tr(k[0], k[1]) : CS.t(k); err.classList.add('show'); return; }
      yes.classList.add('loading'); yes.disabled = no.disabled = true;
      const msg = await run(job);
      yes.classList.remove('loading'); yes.disabled = no.disabled = false;
      if (msg) { err.textContent = msg; err.classList.add('show'); }
    });
    setTimeout(() => { const f = form.querySelector('textarea, input, .dd-btn'); f && f.focus({ preventScroll:true }); }, 30);
    return form;
  }
  function field(labelKey, control, hintKey) {
    const f = el('div', 'act-field');
    const l = el('label', 'act-label', CS.t(labelKey));
    if (control.id) l.htmlFor = control.id;
    f.append(l, control);
    if (hintKey) f.append(el('p', 'act-hint', CS.t(hintKey)));
    return f;
  }
  function textArea(id, max) { const t = el('textarea', 'input act-input'); t.id = id; t.maxLength = max; t.rows = 3; return t; }
  // calls a database function; returns null when it worked, or the message to show
  async function call(fn, args) {
    const { data, error } = await sb.rpc(fn, args);
    if (!error) return { data };
    console.warn('[CallSliven] ' + fn + ':', error);
    const code = errCode(error, ACTION_ERRORS);
    if (code === 'not_super_admin') showAlert('e_not_super_admin');
    return { msg:CS.t(code ? 'e_' + code : 'eAction') };
  }

  /* ═════════ State ═════════ */
  let sb = null, me = null, tab = 'accounts';

  /* ═════════ Tabs (#accounts, #sending, #log) ═════════ */
  const TABS = ['accounts', 'sending', 'log'];
  function showTab(t) {
    tab = TABS.includes(t) ? t : 'accounts';
    TABS.forEach(x => {
      const b = $('#tab-' + x), on = x === tab;
      b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1;
      $('#pane-' + x).hidden = !on;
    });
    if (location.hash !== '#' + tab) history.replaceState(null, '', '#' + tab);
    if (tab === 'sending') loadSending();
    if (tab === 'log' && !logLoaded) loadLog(true);
    if (tab !== 'accounts') document.body.classList.remove('detail-open');
    else if (sel) document.body.classList.add('detail-open');
  }
  $$('.sa-tabs [role="tab"]').forEach((b, i, all) => {
    b.addEventListener('click', () => showTab(b.dataset.tab));
    b.addEventListener('keydown', e => {           // arrow keys move between tabs
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const next = all[(i + d + all.length) % all.length];
      next.focus(); showTab(next.dataset.tab);
    });
  });
  addEventListener('hashchange', () => { if (sb) showTab(location.hash.slice(1)); });

  /* ═════════════════════ Accounts (SA-1, SA-3) ═════════════════════ */
  let uq = '', urole = '', users = [], uSeq = 0, uError = null;
  let sel = null;          // the open account (a row from super_admin_find_users)
  let uAct = null;         // open form: role | active | contact
  let contact = null;      // { id, email, phone, at } — memory only, for the open account

  const ddRole = CS.dropdown($('#dd-role'), { label:() => CS.t('fRole'), value:'', isActive:v => !!v,
    onChange:v => { urole = v; loadUsers(); } });
  function renderRoleFilter() {
    ddRole.update([{ value:'', label:CS.t('roleAll') }, ...['citizen', 'admin', 'super_admin'].map(r => ({ value:r, label:CS.t('r_' + r) }))], urole);
  }

  async function loadUsers() {
    const my = ++uSeq;
    const q = uq.trim();
    // the database needs 2+ letters for a name; say so here instead of asking it
    if (q && !/^\d+$/.test(q) && !q.includes('@') && q.length < 2) { users = []; uError = 'eQuery'; renderUsers(); return; }
    $('#u-loading').hidden = false; $('#u-list').innerHTML = ''; $('#u-empty').hidden = true; $('#u-count').textContent = '';
    const { data, error } = await sb.rpc('super_admin_find_users', { p_query:q || null, p_role:urole || null, p_limit:100 });
    if (my !== uSeq) return;
    $('#u-loading').hidden = true;
    if (error) {
      console.warn('[CallSliven] super_admin_find_users:', error);
      const code = errCode(error, ['not_super_admin', 'invalid_query']);
      users = []; uError = code ? 'e_' + code : 'eLoad';
      if (code === 'not_super_admin') showAlert('e_not_super_admin');
    } else {
      users = data || []; uError = null;
      if (sel) { const fresh = users.find(u => u.out_id === sel.out_id); if (fresh) sel = fresh; renderUser(); }
    }
    renderUsers();
  }

  function userPills(u, box) {
    box.append(pill('ro-' + u.out_role, CS.t('r_' + u.out_role)));
    if (u.out_id === me) box.append(pill('ro-you', CS.t('you')));
    if (!u.out_active) box.append(pill('u-off', CS.t('inactive')));
    if (u.out_restricted_until && new Date(u.out_restricted_until) > Date.now()) box.append(pill('late-warn', tr('restricted', fmtDay(u.out_restricted_until))));
    if (isStaff(u.out_role) && !u.out_has_mfa) box.append(pill('late-warn', CS.t('noMfa')));
    if (!u.out_email_confirmed) box.append(pill('st-withdrawn', CS.t('unconfirmed')));
  }

  function renderUsers() {
    const q = uq.trim();
    $('#u-list-h').textContent = CS.t(!q && !urole ? 'uStaff' : 'uResults');
    const list = $('#u-list'); list.innerHTML = '';
    users.forEach(u => {
      const li = el('li', 'a-row' + (sel && sel.out_id === u.out_id ? ' selected' : '') + (u.out_active ? '' : ' off'));
      const b = el('button', 'a-row-link sa-user'); b.type = 'button';
      const ava = el('span', 'sa-ava', ((u.out_first_name || '').trim()[0] || '') + ((u.out_last_name || '').trim()[0] || '') || '?');
      const main = el('span', 'sa-user-main');
      const top = el('span', 'a-row-top');
      top.append(el('span', 'a-row-title' + (fullName(u) ? '' : ' none'), fullName(u) || CS.t('noName')));
      userPills(u, top);
      const sub = [];
      if (u.out_match === 'report') sub.push(tr('byReport', q.replace(/\D/g, '')));
      if (u.out_match === 'email') sub.push(CS.t('byEmail'));
      sub.push(CS.t('joined') + ' ' + fmtDay(u.out_created_at));
      sub.push(CS.t('lastIn') + ': ' + (u.out_last_sign_in_at ? rel(u.out_last_sign_in_at) : CS.t('never').toLowerCase()));
      if (Number(u.out_report_count)) sub.push(tr('reportsN', Number(u.out_report_count)));
      main.append(top, el('span', 'a-row-sub', sub.join(' · ')));
      b.append(ava, main);
      b.addEventListener('click', () => openUser(u));
      li.append(b); list.append(li);
    });
    const n = users.length;
    $('#u-count').textContent = n ? tr('uFound', n) : '';
    const empty = $('#u-empty');
    empty.hidden = !!n || !$('#u-loading').hidden;
    empty.textContent = uError ? CS.t(uError) : CS.t(!q && !urole ? 'uEmptyStaff' : 'uEmpty');
    if (n >= 100) { empty.hidden = false; empty.textContent = CS.t('uMany'); }
  }

  let qTimer;
  $('#u-q').addEventListener('input', e => { clearTimeout(qTimer); qTimer = setTimeout(() => { uq = e.target.value; loadUsers(); }, 400); });
  $('#u-form').addEventListener('submit', e => { e.preventDefault(); clearTimeout(qTimer); uq = $('#u-q').value; loadUsers(); });

  function openUser(u) {
    if (!sel || sel.out_id !== u.out_id) { uAct = null; contact = null; }
    sel = u;
    $('#u-detail').hidden = false; $('#u-grid').classList.add('with-detail'); document.body.classList.add('detail-open');
    renderUser(); renderUsers();
    $('#u-detail').scrollTop = 0;
  }
  function closeUser() {
    sel = null; uAct = null; contact = null;      // the contacts are forgotten here
    $('#u-detail').hidden = true; $('#u-grid').classList.remove('with-detail'); document.body.classList.remove('detail-open');
    renderUsers();
  }
  $('#u-close').addEventListener('click', closeUser);
  addEventListener('keydown', e => { if (e.key === 'Escape' && sel && tab === 'accounts' && !document.querySelector('.dd.open')) closeUser(); });

  const fact = (label, value, cls = '') => {
    const d = el('div', 'fact ' + cls);
    d.append(el('dt', null, label));
    const dd = el('dd'); if (value instanceof Node) dd.append(value); else dd.textContent = value; d.append(dd);
    return d;
  };

  function renderUser() {
    if (!sel) return;
    const u = sel, self = u.out_id === me;
    const body = $('#u-body'); body.innerHTML = '';

    const head = el('div', 'd-head sa-u-head');
    const ava = el('span', 'sa-ava big', ((u.out_first_name || '').trim()[0] || '') + ((u.out_last_name || '').trim()[0] || '') || '?');
    const txt = el('div');
    const h = el('h2', 'd-title' + (fullName(u) ? '' : ' none'), fullName(u) || CS.t('noName')); h.id = 'u-d-title';
    const pills = el('div', 'd-pills'); userPills(u, pills);
    txt.append(h, pills); head.append(ava, txt); body.append(head);

    // contacts shown after a reason (SA-3)
    if (contact && contact.id === u.out_id) {
      const box = el('div', 'sa-contact');
      const dl = el('dl', 'facts');
      dl.append(fact(CS.t('cEmail'), contact.email || '—'), fact(CS.t('cPhone'), contact.phone || CS.t('cNoPhone')));
      const foot = el('div', 'sa-contact-foot');
      foot.append(el('p', 'act-hint', tr('cShownAt', hhmm(contact.at))));
      const hide = el('button', 'btn btn-sm btn-ghost', CS.t('cHide')); hide.type = 'button';
      hide.addEventListener('click', () => { contact = null; renderUser(); });
      foot.append(hide);
      box.append(dl, foot); body.append(box);
    }

    if (self) body.append(el('div', 'd-box sa-info', CS.t('boxSelf')));
    if (isStaff(u.out_role) && !u.out_has_mfa) body.append(el('div', 'd-box sa-warn', CS.t('boxNoMfa')));
    if (!u.out_email_confirmed) body.append(el('div', 'd-box sa-warn', CS.t('boxUnconfirmed')));

    // actions
    const sec = el('section', 'd-actions');
    sec.append(el('h3', 'd-h', CS.t('actions')));
    const bar = el('div', 'act-bar');
    const ACTS = [
      ['role', 'aRole', 'btn-soft'],
      ['active', u.out_active ? 'aDeactivate' : 'aActivate', u.out_active ? 'btn-danger-soft' : 'btn-soft'],
      ['contact', 'aContact', 'btn-soft']
    ];
    ACTS.forEach(([k, key, cls]) => {
      if (k === 'contact' && contact && contact.id === u.out_id) return;
      const b = el('button', 'btn btn-sm ' + cls + (uAct === k ? ' on' : ''), CS.t(key));
      b.type = 'button'; b.setAttribute('aria-expanded', uAct === k);
      b.addEventListener('click', () => { uAct = uAct === k ? null : k; renderUser(); });
      bar.append(b);
    });
    sec.append(bar);
    if (uAct) sec.append(userForm(uAct, u, self));
    body.append(sec);

    // facts
    const fs = el('section', 'd-sec');
    const dl = el('dl', 'facts');
    dl.append(fact(CS.t('fRole'), CS.t('r_' + u.out_role)));
    dl.append(fact(CS.t('fState'), CS.t(u.out_active ? 'sActive' : 'sInactive'), u.out_active ? '' : 'bad'));
    dl.append(fact(CS.t('joined'), fmt(u.out_created_at)));
    dl.append(fact(CS.t('lastIn'), u.out_last_sign_in_at ? fmt(u.out_last_sign_in_at) + ' · ' + rel(u.out_last_sign_in_at) : CS.t('never')));
    dl.append(fact(CS.t('fMfa'), CS.t(u.out_has_mfa ? 'mfaYes' : isStaff(u.out_role) ? 'mfaNo' : 'mfaNotNeeded'), isStaff(u.out_role) && !u.out_has_mfa ? 'warn' : ''));
    dl.append(fact(CS.t('fEmailOk'), CS.t(u.out_email_confirmed ? 'emailYes' : 'emailNo'), u.out_email_confirmed ? '' : 'warn'));
    dl.append(fact(CS.t('fReports'), String(Number(u.out_report_count) || 0)));
    if (u.out_restricted_until && new Date(u.out_restricted_until) > Date.now()) dl.append(fact(CS.t('fRestricted'), fmt(u.out_restricted_until), 'warn'));
    fs.append(dl);
    if (u.out_match === 'report' && /^\d+$/.test(uq.trim())) {
      const a = el('a', 'link', tr('openReport', uq.trim()) + ' →'); a.href = 'admin.html#n=' + uq.trim();
      const p = el('p', 'sa-link'); p.append(a); fs.append(p);
    }
    body.append(fs);
  }

  function userForm(kind, u, self) {
    const cancel = () => { uAct = null; renderUser(); };
    if (kind === 'role') {
      const roles = ['citizen', 'admin', 'super_admin'];
      const box = el('div');
      const desc = el('p', 'act-hint sa-role-x');
      const warn = el('p', 'act-warn soft'); warn.hidden = true;
      const setRole = r => {
        desc.textContent = CS.t('roleX_' + r);
        warn.textContent = CS.t('warnSelfRole'); warn.hidden = !(self && r !== 'super_admin');
      };
      const dd = CS.dropdown(box, { label:() => CS.t('fNewRole'), value:u.out_role, onChange:setRole });
      dd.update(roles.map(r => ({ value:r, label:CS.t('r_' + r) })), u.out_role);
      setRole(u.out_role);
      const f1 = field('fNewRole', box); f1.append(desc);
      const reason = textArea('sa-reason', 500);
      return actForm({
        parts:[f1, warn, field('fReason', reason, 'fReasonHint'), el('p', 'act-text', CS.t('fRoleNotice'))],
        go:CS.t('saveRole'), onCancel:cancel,
        read:() => {
          if (dd.value === u.out_role) throw 'eSameRole';
          if (reason.value.trim().length < 5) throw ['eShort', 5];
          return { p_user_id:u.out_id, p_role:dd.value, p_active:u.out_active, p_reason:reason.value.trim() };
        },
        run:async args => {
          const r = await call('super_admin_set_role', args);
          if (r.msg) return r.msg;
          toast(CS.t('okRole'));
          if (self && args.p_role !== 'super_admin') { location.href = 'admin.html'; return null; }
          sel = { ...u, out_role:args.p_role }; uAct = null; renderUser(); loadUsers();
          return null;
        }
      });
    }
    if (kind === 'active') {
      const off = u.out_active;
      const reason = textArea('sa-reason', 500);
      const warn = self && off ? el('p', 'act-warn', CS.t('warnSelfOff')) : null;
      return actForm({
        parts:[el('p', 'act-text', CS.t(off ? 'fDeactX' : 'fActX')), warn, field('fReason', reason, 'fReasonHint')],
        go:CS.t(off ? 'aDeactivate' : 'aActivate'), danger:off, onCancel:cancel,
        read:() => {
          if (reason.value.trim().length < 5) throw ['eShort', 5];
          return { p_user_id:u.out_id, p_role:u.out_role, p_active:!off, p_reason:reason.value.trim() };
        },
        run:async args => {
          const r = await call('super_admin_set_role', args);
          if (r.msg) return r.msg;
          toast(CS.t(off ? 'okOff' : 'okOn'));
          if (self && off) { CS.logout(); return null; }
          sel = { ...u, out_active:!off }; uAct = null; renderUser(); loadUsers();
          return null;
        }
      });
    }
    // contact (SA-3): the reason goes into the Audit Log before the answer
    const reason = textArea('sa-reason', 500);
    return actForm({
      parts:[el('p', 'act-text', CS.t('fContactX')), field('fContactReason', reason, 'fContactHint')],
      go:CS.t('showContact'), onCancel:cancel,
      read:() => {
        if (reason.value.trim().length < 10) throw ['eShort', 10];
        return { p_user_id:u.out_id, p_reason:reason.value.trim() };
      },
      run:async args => {
        const r = await call('super_admin_get_contact', args);
        if (r.msg) return r.msg;
        const row = Array.isArray(r.data) ? r.data[0] : r.data;
        contact = { id:u.out_id, email:row && row.out_email, phone:row && row.out_phone, at:new Date() };
        uAct = null; renderUser();
        if (logLoaded) loadLog(true);
        return null;
      }
    });
  }

  /* ═════════════════════ Sending (SA-2) ═════════════════════ */
  let settings = null, insts = [], queued = 0, sAct = null, instAct = null, sSeq = 0;

  async function loadSending() {
    const my = ++sSeq;
    const [s, i, q] = await Promise.all([
      sb.from('app_settings').select('sending_enabled, demo_email, updated_at').maybeSingle(),
      sb.from('institutions').select('id, name, email, real_send, active, verification_status').order('name'),
      sb.from('report_dispatches').select('id', { count:'exact', head:true }).in('status', ['queued', 'sending'])
    ]);
    if (my !== sSeq) return;
    if (s.error || i.error) { console.warn('[CallSliven] sending:', s.error || i.error); showAlert('eLoad'); return; }
    settings = s.data; insts = i.data || []; queued = q.error ? 0 : (q.count || 0);
    renderSending();
  }

  function renderSending() {
    if (!settings) return;
    const on = settings.sending_enabled !== false;
    $('#flag-paused').hidden = on;

    // the big switch
    const sw = $('#switch-card'); sw.innerHTML = ''; sw.className = 'sa-card sa-switch ' + (on ? 'is-on' : 'is-off');
    const top = el('div', 'sa-card-top');
    const dot = el('span', 'sa-state-dot'); dot.setAttribute('aria-hidden', 'true');
    top.append(dot, el('h3', null, CS.t(on ? 'swOnT' : 'swOffT')));
    sw.append(top, el('p', 'sa-card-x', on ? CS.t('swOnX') + (queued ? ' ' + tr('swQueue', queued) : '') : tr('swOffX', queued)));
    const b = el('button', 'btn btn-sm ' + (on ? 'btn-danger-soft' : 'btn-accent') + (sAct === 'switch' ? ' on' : ''), CS.t(on ? 'aPause' : 'aResume'));
    b.type = 'button'; b.setAttribute('aria-expanded', sAct === 'switch');
    b.addEventListener('click', () => { sAct = sAct === 'switch' ? null : 'switch'; renderSending(); });
    if (sAct !== 'switch') sw.append(b);
    if (sAct === 'switch') {
      const reason = textArea('sa-sw-reason', 500);
      sw.append(actForm({
        parts:[el('p', 'act-text', CS.t(on ? 'fPauseX' : 'fResumeX')), field('fReason', reason, 'fReasonHint')],
        go:CS.t(on ? 'aPause' : 'aResume'), danger:on, onCancel:() => { sAct = null; renderSending(); },
        read:() => {
          if (reason.value.trim().length < 5) throw ['eShort', 5];
          return { p_demo_email:settings.demo_email, p_sending_enabled:!on, p_reason:reason.value.trim() };
        },
        run:async args => {
          const r = await call('super_admin_update_settings', args);
          if (r.msg) return r.msg;
          toast(CS.t(on ? 'okPause' : 'okResume')); sAct = null; await loadSending(); afterChange();
          return null;
        }
      }));
    }

    // demo email
    const dc = $('#demo-card'); dc.innerHTML = ''; dc.className = 'sa-card sa-demo';
    const usersOfDemo = insts.filter(x => x.active && x.email && !x.real_send).length;
    const dTop = el('div', 'sa-card-top');
    dTop.append(el('h3', null, CS.t('demoT')));
    dc.append(dTop);
    dc.append(el('p', 'sa-demo-mail' + (settings.demo_email ? '' : ' none'), settings.demo_email || CS.t('demoNone')));
    dc.append(el('p', 'sa-card-x', CS.t('demoX') + ' ' + tr('demoUsers', usersOfDemo)));
    if (sAct !== 'demo') {
      const db = el('button', 'btn btn-sm btn-soft', CS.t('aDemo')); db.type = 'button';
      db.addEventListener('click', () => { sAct = 'demo'; renderSending(); });
      dc.append(db);
    } else {
      const input = el('input', 'input act-input'); input.id = 'sa-demo'; input.type = 'email'; input.maxLength = 254; input.autocomplete = 'off';
      input.value = settings.demo_email || '';
      const reason = textArea('sa-demo-reason', 500);
      dc.append(actForm({
        parts:[field('fDemoEmail', input), field('fReason', reason, 'fReasonHint')],
        go:CS.t('aDemo'), onCancel:() => { sAct = null; renderSending(); },
        read:() => {
          const v = input.value.trim();
          if (!EMAIL_RE.test(v)) throw 'eEmail';
          if (reason.value.trim().length < 5) throw ['eShort', 5];
          return { p_demo_email:v, p_sending_enabled:settings.sending_enabled !== false, p_reason:reason.value.trim() };
        },
        run:async args => {
          const r = await call('super_admin_update_settings', args);
          if (r.msg) return r.msg;
          toast(CS.t('okDemo')); sAct = null; await loadSending(); afterChange();
          return null;
        }
      }));
    }

    // institutions
    const list = $('#inst-list'); list.innerHTML = '';
    const sorted = [...insts].sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name, 'bg'));
    sorted.forEach(x => {
      const li = el('li', 'a-row sa-inst-row' + (x.active ? '' : ' off') + (x.real_send ? ' real' : ''));
      const card = el('div', 'a-row-link');
      const line = el('div', 'sa-inst-line');
      const main = el('div', 'sa-inst-main');
      const top = el('span', 'a-row-top');
      top.append(el('span', 'a-row-title', x.name));
      if (!x.active) top.append(pill('st-withdrawn', CS.t('iInactive')));
      else if (!x.email) top.append(pill('d-manual', CS.t('iManual')));
      else top.append(pill(x.real_send ? 'd-delivered' : 'd-demo', CS.t(x.real_send ? 'iReal' : 'iDemo')));
      top.append(pill('v-' + x.verification_status, CS.t('v_' + x.verification_status)));
      const eligible = !!x.email && x.verification_status === 'confirmed';
      const sub = !x.email ? CS.t('iNoEmail') : x.email + (!x.real_send && !eligible ? ' · ' + CS.t('iNeedVerify') : '');
      main.append(top, el('span', 'a-row-sub', sub));
      line.append(main);
      // the switch: off is always possible; on only with an email and a confirmed contact (the database checks again)
      if (x.active && (x.real_send || eligible) && instAct !== x.id) {
        const tb = el('button', 'btn btn-sm ' + (x.real_send ? 'btn-soft' : 'btn-accent'), CS.t(x.real_send ? 'aRealOff' : 'aRealOn'));
        tb.type = 'button';
        tb.addEventListener('click', () => { instAct = x.id; renderSending(); });
        line.append(tb);
      }
      card.append(line);
      if (instAct === x.id) {
        const turnOn = !x.real_send;
        const reason = textArea('sa-inst-reason', 500);
        card.append(actForm({
          parts:[el('p', 'act-text', turnOn ? tr('fRealOnX', x.name, x.email) : tr('fRealOffX', x.name)), field('fReason', reason, 'fReasonHint')],
          go:CS.t(turnOn ? 'aRealOn' : 'aRealOff'), onCancel:() => { instAct = null; renderSending(); },
          read:() => {
            if (reason.value.trim().length < 5) throw ['eShort', 5];
            return { p_institution_id:x.id, p_enabled:turnOn, p_reason:reason.value.trim() };
          },
          run:async args => {
            const r = await call('super_admin_set_real_send', args);
            if (r.msg) return r.msg;
            toast(CS.t(turnOn ? 'okRealOn' : 'okRealOff')); instAct = null; await loadSending(); afterChange();
            return null;
          }
        }));
      }
      li.append(card); list.append(li);
    });
    const act = insts.filter(x => x.active);
    $('#inst-count').textContent = tr('instCount', act.filter(x => x.real_send).length, act.length);
  }
  // a change shows up in the log at once
  function afterChange() { if (logLoaded) loadLog(true); }

  /* ═════════════════════ Log ═════════════════════ */
  const PAGE = 50;
  let group = '', logRows = [], logLoaded = false, logSeq = 0, logDone = false;
  const ddGroup = CS.dropdown($('#dd-group'), { label:() => CS.t('fGroup'), value:'', isActive:v => !!v,
    onChange:v => { group = v; loadLog(true); } });
  function renderGroupFilter() {
    ddGroup.update([['', 'gAll'], ['reports', 'gReports'], ['users', 'gUsers'], ['contacts', 'gContacts'], ['settings', 'gSettings'], ['system', 'gSystem']]
      .map(([v, k]) => ({ value:v, label:CS.t(k) })), group);
  }

  async function loadLog(reset) {
    const my = ++logSeq;
    logLoaded = true;
    if (reset) { logRows = []; logDone = false; $('#log-list').innerHTML = ''; $('#log-loading').hidden = false; $('#log-empty').hidden = true; $('#log-more').hidden = true; }
    const before = logRows.length ? logRows[logRows.length - 1].id : null;
    let rows = [], error = null;
    if (group === 'system') {
      let q = sb.from('system_events').select('id, created_at, source, level, message').order('id', { ascending:false }).limit(PAGE);
      if (before) q = q.lt('id', before);
      const r = await q; error = r.error;
      rows = (r.data || []).map(x => ({ kind:'system', id:x.id, at:x.created_at, ...x }));
    } else {
      const r = await sb.rpc('super_admin_audit', { p_group:group || null, p_before_id:before, p_limit:PAGE });
      error = r.error;
      rows = (r.data || []).map(x => ({ kind:'audit', id:x.out_id, at:x.out_created_at, ...x }));
    }
    if (my !== logSeq) return;
    $('#log-loading').hidden = true;
    $('#log-more').classList.remove('loading'); $('#log-more').disabled = false;
    if (error) {
      console.warn('[CallSliven] log:', error);
      if (errCode(error, ['not_super_admin'])) showAlert('e_not_super_admin'); else showAlert('eLoad');
      return;
    }
    if (alertKey === 'eLoad') hideAlert();
    logRows = logRows.concat(rows);
    logDone = rows.length < PAGE;
    renderLog();
  }
  $('#log-more').addEventListener('click', () => { $('#log-more').classList.add('loading'); $('#log-more').disabled = true; loadLog(false); });

  const st = s => has('s_' + s) ? CS.t('s_' + s) : s;
  const ro = r => r ? CS.t('r_' + r) : '—';
  const from = (o, f) => o && typeof o === 'object' ? tr('dFrom', f(o.from), f(o.to)) : '';
  // a short human line for what changed; details hold no personal data (008)
  function describe(r) {
    const d = r.out_details || {};
    switch (r.out_action) {
      case 'report.created': return d.needs_review ? CS.t('dSuspicious') : '';
      case 'report.status_changed': return tr('dFrom', st(d.from), st(d.to));
      case 'report.rejected': return d.reason ? tr('rj_' + d.reason) : '';
      case 'report.classification_changed': {
        const parts = [];
        if (d.subcategory && d.subcategory.from !== d.subcategory.to) parts.push(CS.t('dSub'));
        if (d.institution && d.institution.from !== d.institution.to) parts.push(CS.t('dInst'));
        if (d.priority && d.priority.from !== d.priority.to) parts.push(CS.t('dPrio') + ' ' + from(d.priority, p => CS.t('p_' + p)));
        return parts.join(', ');
      }
      case 'report.linked_duplicate': return d.main_number ? tr('dMain', d.main_number) : '';
      case 'report.sent': case 'report.resent': return d.attempt ? tr('dAttempt', d.attempt) : '';
      case 'dispatch.failed': return [d.attempt ? tr('dAttempt', d.attempt) : '', d.via === 'webhook' ? CS.t('dWebhook') : ''].filter(Boolean).join(', ');
      case 'user.restricted': return d.days != null ? tr('dDays', Number(d.days)) : '';
      case 'user.role_changed': {
        const parts = [];
        if (d.role && d.role.from !== d.role.to) parts.push(from(d.role, ro));
        if (d.active && d.active.from !== d.active.to) parts.push(from(d.active, a => CS.t(a ? 'dActive' : 'dInactive')));
        return parts.join(', ');
      }
      case 'settings.changed': {
        const parts = [];
        if (d.sending_enabled && d.sending_enabled.from !== d.sending_enabled.to) parts.push(from(d.sending_enabled, v => CS.t(v ? 'dOn' : 'dOff')));
        if (d.demo_email_changed) parts.push(CS.t('dDemoChanged'));
        return parts.join(', ');
      }
      case 'institution.real_send_changed': return from(d, v => CS.t(v ? 'dOn' : 'dOff'));
      case 'consent.accepted': return d.version ? CS.t('cVersion') + ' ' + d.version : '';
      default: return '';
    }
  }
  const KIND = a => a.startsWith('contact.') ? 'k-contact' : a.startsWith('user.') ? 'k-user' : a.startsWith('settings.') || a.startsWith('institution.') ? 'k-settings' : a.startsWith('dispatch.failed') ? 'k-bad' : '';

  function renderLog() {
    const list = $('#log-list'); list.innerHTML = '';
    $('#log-hint').textContent = CS.t(group === 'system' ? 'sysHint' : 'logHint');
    logRows.forEach(r => {
      const li = el('li', 'sa-log-row');
      const time = el('time', 'sa-log-time', fmt(r.at)); time.dateTime = r.at;
      const main = el('div', 'sa-log-main');
      if (r.kind === 'system') {
        li.classList.add('lv-' + r.level);
        const top = el('div', 'sa-log-top');
        top.append(pill('lv-' + r.level, CS.t('l_' + r.level)), el('b', null, r.source));
        main.append(top, el('p', 'sa-log-msg', r.message));
      } else {
        const k = KIND(r.out_action); if (k) li.classList.add(k);
        const top = el('div', 'sa-log-top');
        top.append(el('b', null, has('a_' + r.out_action) ? CS.t('a_' + r.out_action) : r.out_action));
        if (r.out_report_number) { const a = el('a', 'link', '№' + r.out_report_number); a.href = 'admin.html#n=' + r.out_report_number; top.append(a); }
        if (r.out_entity_name) top.append(el('span', 'sa-log-target', r.out_entity_name));
        const what = describe(r);
        if (what) top.append(el('span', 'sa-log-what', what));
        main.append(top);
        const who = el('p', 'sa-log-who');
        who.textContent = r.out_actor_name || r.out_actor_role
          ? CS.t('by') + ' ' + (r.out_actor_name || CS.t('noName')) + (r.out_actor_role ? ' · ' + ro(r.out_actor_role) : '')
          : CS.t('system');
        main.append(who);
        if (r.out_reason) main.append(el('p', 'sa-log-reason', '„' + r.out_reason + '“'));
      }
      li.append(time, main); list.append(li);
    });
    $('#log-empty').hidden = !!logRows.length || !$('#log-loading').hidden;
    $('#log-empty').textContent = CS.t('logEmpty');
    $('#log-more').hidden = logDone || !logRows.length;
  }

  /* ═════════ Language ═════════ */
  document.addEventListener('cs:lang', () => {
    document.title = CS.t('docTitle') + ' · CallSliven';
    if (!sb) return;
    renderRoleFilter(); renderGroupFilter(); renderUsers(); renderUser(); renderSending();
    if (logLoaded) renderLog();
    if (alertKey) $('#alert .alert-text').textContent = CS.t(alertKey);
  });

  /* ═════════ Start: only a Super Admin with a second factor ═════════ */
  CS.start();
  document.title = CS.t('docTitle') + ' · CallSliven';
  CS.requireUser().then(async ctx => {
    if (!ctx) return;
    const role = ctx.profile && ctx.profile.role;
    if (role !== 'super_admin') {
      $('#denied').hidden = false;
      if (role === 'admin') {          // an administrator gets a way back to the panel
        $('#denied p').dataset.i18n = 'deniedAdminX'; $('#denied p').textContent = CS.t('deniedAdminX');
        const a = $('#denied-link'); a.href = 'admin.html'; a.dataset.i18n = 'adminPanel'; a.textContent = CS.t('adminPanel');
      }
      return;
    }
    const { data:aal } = await ctx.sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (!aal || aal.currentLevel !== 'aal2') {
      location.href = aal && aal.nextLevel === 'aal2' ? 'auth.html?next=super-admin.html#login' : 'mfa-setup.html';
      return;
    }
    sb = ctx.sb; me = ctx.user.id;
    $('#panel').hidden = false;
    renderRoleFilter(); renderGroupFilter();
    showTab(location.hash.slice(1));
    if (tab !== 'sending') loadSending();        // the "paused" mark on the tab is right from the start
    loadUsers();
  });
})();
