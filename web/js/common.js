/* CallSliven — shared behaviour for every page with the main navigation:
   language (EN/BG), navbar, mobile menu, scroll reveal, small helpers,
   and the logged-in state in the navigation (user menu instead of "Log in").
   Page scripts add their own strings with CS.addStrings({ en:{…}, bg:{…} })
   and call CS.start() once at the end. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* strings shared by all pages (navigation, footer, statuses, categories) */
  const strings = {
    en: {
      skip:'Skip to content', brandSub:'Reports for Sliven Municipality',
      navReports:'Reports', navLetters:'Letters, complaints, FOI', navHelp:'Help', login:'Log in', menu:'Menu',
      ctaSubmit:'Submit a report',
      stNew:'New', stSent:'Sent', stProgress:'In progress', stResolved:'Resolved',
      cRoads:'Roads', cUtil:'Utilities', cEnv:'Environment', cAnimals:'Animals', cBuild:'Construction',
      cTransport:'Transport and order', cSafety:'Safety', cHealth:'Health and hygiene', cOther:'Other',
      pLow:'Low', pMedium:'Medium', pHigh:'High', pCritical:'Critical',
      footAbout:'Report everyday problems in Sliven and follow how they get fixed.', footLinks:'Quick links', footLegal:'Legal', footContact:'Contact',
      privacy:'Privacy policy', terms:'Terms of use', cookies:'Cookies',
      addr:'Sliven Municipality<br>1 Tsar Osvoboditel Sq., 8800 Sliven', call112:'Emergency? Call 112',
      myReports:'My reports', profile:'Profile', adminPanel:'Admin panel', superAdmin:'Super Admin', logout:'Log out', accountMenu:'Account menu',
      today:'today', yesterday:'yesterday', daysAgo:n => `${n} days ago`
    },
    bg: {
      skip:'Към съдържанието', brandSub:'Сигнали за община Сливен',
      navReports:'Сигнали', navLetters:'Писма, жалби, ЗДОИ', navHelp:'Помощ', login:'Вход', menu:'Меню',
      ctaSubmit:'Подай сигнал',
      stNew:'Нов', stSent:'Изпратен', stProgress:'В обработка', stResolved:'Решен',
      cRoads:'Пътища', cUtil:'Комунални услуги', cEnv:'Околна среда', cAnimals:'Животни', cBuild:'Строителство',
      cTransport:'Транспорт и ред', cSafety:'Безопасност', cHealth:'Здраве и хигиена', cOther:'Друго',
      pLow:'Нисък', pMedium:'Среден', pHigh:'Висок', pCritical:'Критичен',
      footAbout:'Подай сигнал за проблем в Сливен и проследи как се решава.', footLinks:'Бързи връзки', footLegal:'Правна информация', footContact:'Контакт',
      privacy:'Политика за поверителност', terms:'Условия за ползване', cookies:'Бисквитки',
      addr:'Община Сливен<br>пл. „Цар Освободител“ 1, 8800 Сливен', call112:'Спешно? Звънни на 112',
      myReports:'Моите сигнали', profile:'Профил', adminPanel:'Админ панел', superAdmin:'Super Admin', logout:'Изход', accountMenu:'Меню на профила',
      today:'днес', yesterday:'вчера', daysAgo:n => `преди ${n} дни`
    }
  };

  let lang = 'bg';     // Bulgarian unless the visitor chose English (same as auth.html)
  try { lang = localStorage.getItem('language') === 'en' ? 'en' : 'bg'; } catch (e) {}

  const STATUS_KEYS = ['stNew', 'stSent', 'stProgress', 'stResolved'];
  const STATUS_CLASS = ['st-new', 'st-sent', 'st-progress', 'st-resolved'];

  const CS = {
    $, $$, reduce, STATUS_KEYS, STATUS_CLASS,
    get lang() { return lang; },
    t(key) { const v = strings[lang][key]; return v === undefined ? strings.en[key] : v; },
    /* pick the right language from a {bg, en} object */
    l(obj) { return obj ? (obj[lang] || obj.en || obj.bg || '') : ''; },
    addStrings(dict) { for (const k of ['en', 'bg']) Object.assign(strings[k], dict[k] || {}); },
    esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); },
    ago(days) { return days <= 0 ? CS.t('today') : days === 1 ? CS.t('yesterday') : CS.t('daysAgo')(days); },
    date(d) { return d.toLocaleDateString(lang === 'bg' ? 'bg-BG' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); },
    dateShort(d) { return d.toLocaleDateString(lang === 'bg' ? 'bg-BG' : 'en-GB', { day: 'numeric', month: 'short' }); },
    statusPill(i) {
      return `<span class="status ${STATUS_CLASS[i]}"><span class="s-dot"></span><span class="s-text">${CS.t(STATUS_KEYS[i])}</span></span>`;
    },

    setLang(next) {
      lang = next === 'en' ? 'en' : 'bg';
      try { localStorage.setItem('language', lang); } catch (e) {}
      document.documentElement.lang = lang;
      $$('[data-i18n]').forEach(el => { const v = CS.t(el.dataset.i18n); if (typeof v === 'string') el.innerHTML = v; });
      $$('[data-i18n-ph]').forEach(el => { el.placeholder = CS.t(el.dataset.i18nPh); });
      $$('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', CS.t(el.dataset.i18nAria)); });
      $$('.lang button').forEach(b => { const on = b.dataset.lang === lang; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on); });
      document.dispatchEvent(new CustomEvent('cs:lang', { detail: lang }));
    },

    /* Base map tiles: MapTiler (if a key is set in js/config.js) → CARTO light → OpenStreetMap.
       If a provider keeps failing, the next one is tried automatically. */
    tiles(map) {
      const cfg = window.CS_CONFIG || {};
      const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
      const providers = [];
      if (cfg.MAPTILER_KEY) providers.push({
        url: `https://api.maptiler.com/maps/${cfg.MAPTILER_STYLE || 'streets-v2'}/256/{z}/{x}/{y}.png?key=${cfg.MAPTILER_KEY}`,
        opt: { maxZoom: 20, attribution: '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> ' + OSM }
      });
      providers.push({ url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        opt: { maxZoom: 19, subdomains: 'abcd', attribution: OSM + ' &copy; <a href="https://carto.com/attributions">CARTO</a>' } });
      providers.push({ url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', opt: { maxZoom: 19, attribution: OSM } });

      let i = 0, layer = null, errors = 0, loaded = 0;
      const use = n => {
        if (layer) map.removeLayer(layer);
        errors = 0; loaded = 0;
        layer = L.tileLayer(providers[n].url, providers[n].opt).addTo(map);
        layer.on('tileload', () => { loaded++; });
        layer.on('tileerror', () => {
          errors++;
          if (errors >= 4 && loaded === 0 && i < providers.length - 1) { i++; use(i); }
        });
      };
      use(0);
    },

    /* Custom dropdown that looks the same in every browser (native <select> lists can't be styled).
       root: an empty element
       opts: { icon, label(), value, onChange(value), isActive(value),
               multi: true → value is an array; the option with value '' means "all" and clears the choice;
               many(n) → button text when several are chosen }
       options: [{ value, label, meta, icon }] — icon is optional HTML shown before the label */
    dropdown(root, opts) {
      const id = 'dd' + Math.random().toString(36).slice(2, 7);
      const chevron = '<svg class="dd-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
      const check = '<svg class="dd-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4 10-10"/></svg>';
      root.classList.add('dd');
      root.innerHTML = `<button type="button" class="dd-btn" aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}">
          ${opts.icon || ''}<span class="dd-value"></span>${chevron}</button>
        <ul class="dd-menu" id="${id}" role="listbox" tabindex="-1"${opts.multi ? ' aria-multiselectable="true"' : ''}></ul>`;
      if (opts.multi) root.classList.add('multi');
      const btn = $('.dd-btn', root), menu = $('.dd-menu', root), valueEl = $('.dd-value', root);
      let options = [], value = opts.value, active = 0;

      const isSel = o => opts.multi ? (o.value === '' ? value.length === 0 : value.includes(o.value)) : o.value === value;
      const text = () => {
        if (!opts.multi) { const cur = options.find(o => o.value === value) || options[0]; return cur ? cur.label : ''; }
        if (!value.length) return options[0] ? options[0].label : '';
        if (value.length === 1) { const o = options.find(x => x.value === value[0]); return o ? o.label : ''; }
        return opts.many ? opts.many(value.length) : value.length + '';
      };
      const render = () => {
        const t = text();
        valueEl.textContent = t;
        btn.setAttribute('aria-label', (opts.label ? opts.label() + ': ' : '') + t);
        root.classList.toggle('on', !!opts.isActive && opts.isActive(value));
        menu.innerHTML = options.map((o, i) => `<li role="option" id="${id}-${i}" data-i="${i}" aria-selected="${isSel(o)}"${o.value === '' ? ' class="dd-all"' : ''}>
          ${check}${o.icon || ''}<span class="dd-label">${CS.esc(o.label)}</span>${o.meta !== undefined ? `<span class="dd-meta">${o.meta}</span>` : ''}</li>`).join('');
      };
      const setActive = i => {
        active = (i + options.length) % options.length;
        $$('li', menu).forEach((li, j) => li.classList.toggle('active', j === active));
        menu.setAttribute('aria-activedescendant', `${id}-${active}`);
        const li = $$('li', menu)[active]; li && li.scrollIntoView({ block: 'nearest' });
      };
      const open = () => {
        if (root.classList.contains('open')) return;
        document.querySelectorAll('.dd.open').forEach(d => d !== root && d.dispatchEvent(new Event('dd:close')));
        root.classList.add('open'); btn.setAttribute('aria-expanded', 'true');
        setActive(Math.max(0, options.findIndex(isSel)));
        void menu.offsetWidth;                 // let the menu become visible before focusing it
        menu.focus({ preventScroll: true });
        if (document.activeElement !== menu) requestAnimationFrame(() => menu.focus({ preventScroll: true }));
      };
      const close = (focusBtn = true) => {
        if (!root.classList.contains('open')) return;
        root.classList.remove('open'); btn.setAttribute('aria-expanded', 'false');
        if (focusBtn) btn.focus({ preventScroll: true });
      };
      const choose = i => {
        const o = options[i]; if (!o) return;
        if (opts.multi) {
          // several can be ticked; the list stays open
          value = o.value === '' ? [] : value.includes(o.value) ? value.filter(v => v !== o.value) : [...value, o.value];
          render(); setActive(i);
          opts.onChange && opts.onChange([...value]);
          return;
        }
        value = o.value; render(); close();
        opts.onChange && opts.onChange(value);
      };
      root.addEventListener('dd:close', () => close(false));
      btn.addEventListener('click', () => root.classList.contains('open') ? close() : open());
      btn.addEventListener('keydown', e => { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); open(); } });
      menu.addEventListener('click', e => { const li = e.target.closest('li'); if (li) choose(+li.dataset.i); });
      menu.addEventListener('mousemove', e => { const li = e.target.closest('li'); if (li && +li.dataset.i !== active) setActive(+li.dataset.i); });
      menu.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
        else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
        else if (e.key === 'End') { e.preventDefault(); setActive(options.length - 1); }
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(active); }
        else if (e.key === 'Escape' || e.key === 'Tab') { close(e.key === 'Escape'); }
        else if (e.key.length === 1) { // jump to the first option starting with the typed letter
          const k = e.key.toLocaleLowerCase();
          const i = options.findIndex((o, j) => j > active && o.label.toLocaleLowerCase().startsWith(k));
          const f = i >= 0 ? i : options.findIndex(o => o.label.toLocaleLowerCase().startsWith(k));
          if (f >= 0) setActive(f);
        }
      });
      // composedPath() still knows the clicked row even if the list was re-drawn during the click
      document.addEventListener('click', e => { if (!e.composedPath().includes(root)) close(false); });

      return {
        update(newOptions, newValue) {
          options = newOptions; if (newValue !== undefined) value = newValue;
          render();
          if (root.classList.contains('open')) setActive(active);   // keep the highlighted row after a refresh
        },
        get value() { return value; }
      };
    },

    initNav() {
      const navbar = $('#navbar');
      if (!navbar) return;
      // pages without a photo hero keep the white bar from the start
      const solid = navbar.classList.contains('solid');
      const onScroll = () => navbar.classList.toggle('scrolled', solid || scrollY > 60);
      addEventListener('scroll', onScroll, { passive: true });
      onScroll();

      const links = $('#nav-links'), toggle = $('#menu-toggle');
      const setMenu = open => {
        links.classList.toggle('show', open);
        toggle.classList.toggle('active', open);
        toggle.setAttribute('aria-expanded', open);
        document.body.classList.toggle('menu-open', open);
      };
      toggle.addEventListener('click', () => setMenu(!links.classList.contains('show')));
      $$('a', links).forEach(a => a.addEventListener('click', () => setMenu(false)));
      addEventListener('resize', () => { if (innerWidth > 860) setMenu(false); });
      addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });

      // mark the current page in the navigation
      const here = location.pathname.split('/').pop() || 'index.html';
      $$('a', links).forEach(a => {
        const target = a.getAttribute('href').split('?')[0];
        if (target === here || (here === 'report.html' && target === 'reports.html')) a.classList.add('active');
      });
    },

    initReveal(root = document) {
      const targets = $$('.reveal, .reveal-left, .reveal-right, .stagger', root).filter(el => !el.classList.contains('visible'));
      if (!('IntersectionObserver' in window)) { targets.forEach(el => el.classList.add('visible')); return; }
      const io = new IntersectionObserver(entries => {
        entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } });
      }, { threshold: 0, rootMargin: '0px 0px -8% 0px' });
      targets.forEach(el => io.observe(el));
    },

    /* ═════════ Logged-in state ═════════
       supabase-js is loaded only when it is needed (a saved session, or a page that needs a user),
       so visitors who never logged in don't download it. */
    loadScript(src) {
      return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('load ' + src));
        document.head.appendChild(s);
      });
    },
    async client() {
      if (window.SB) return window.SB;
      if (!window.CS_CONFIG || !window.CS_CONFIG.SUPABASE_URL) await CS.loadScript('js/config.js');
      if (!window.supabase) await CS.loadScript('vendor/supabase-js-2.118.0/supabase.js');
      if (!window.SB) await CS.loadScript('js/sb.js');
      return window.SB;
    },
    // the session supabase-js saved in this browser (read without loading the library)
    savedSession() {
      try {
        const key = Object.keys(localStorage).find(k => /^sb-.+-auth-token$/.test(k));
        const v = key && JSON.parse(localStorage.getItem(key));
        return v && v.user ? v : null;
      } catch (e) { return null; }
    },
    user: null,       // { id, email, firstName, lastName, role } once known
    /* { sb, user, profile } for the logged-in user, or null. Pages that need a user call CS.requireUser(). */
    async session() {
      if (!CS.savedSession()) return null;
      try {
        const sb = await CS.client();
        const { data: { user } } = await sb.auth.getUser();      // asks the server: an old or revoked token gives null
        if (!user) return null;
        const { data: profile } = await sb.from('profiles')
          .select('first_name, last_name, phone, role, active, restricted_until, consent_version, consent_at, created_at')
          .eq('id', user.id).maybeSingle();
        if (profile && profile.active === false) { await sb.auth.signOut(); return null; }
        return { sb, user, profile };
      } catch (e) { return null; }
    },
    async requireUser() {
      const ctx = await CS.session();
      if (!ctx) {
        // some local servers drop ".html" from the address (/submit) — put it back so auth.html accepts it
        let here = location.pathname.split('/').pop() || 'index.html';
        if (!here.endsWith('.html')) here += '.html';
        location.href = 'auth.html?next=' + encodeURIComponent(here + location.search) + '#login';
        return null;
      }
      return ctx;
    },
    async logout() {
      try { const sb = await CS.client(); await sb.auth.signOut(); } catch (e) {}
      location.href = 'auth.html';
    },
    /* replace the "Log in" link with the user menu, or put it back.
       Anything on the page with class "super-only" (and the menu link) shows only for a Super Admin.
       This only hides links: the database still checks the role and MFA on every request. */
    renderUser(u) {
      CS.user = u;
      $$('.super-only').forEach(x => { x.hidden = !u || u.role !== 'super_admin'; });
      const right = $('.nav-right');
      if (!right) return;
      let menu = $('#user-menu', right), login = $('.login', right);
      if (!u) {
        if (menu) menu.remove();
        if (login) login.hidden = false;
        return;
      }
      if (login) login.hidden = true;
      if (!menu) {
        menu = document.createElement('div');
        menu.className = 'user-menu'; menu.id = 'user-menu';
        menu.innerHTML = `
          <button type="button" class="user-btn" aria-haspopup="true" aria-expanded="false" aria-controls="user-pop" data-i18n-aria="accountMenu">
            <span class="avatar" aria-hidden="true"></span><span class="user-name"></span>
            <svg class="user-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
          </button>
          <div class="user-pop" id="user-pop">
            <div class="user-head"><b class="user-full"></b><span class="user-mail"></span></div>
            <a href="submit.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg><span data-i18n="ctaSubmit">${CS.t('ctaSubmit')}</span></a>
            <a href="my-reports.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4h6M8 2h8v4H8z"/><rect x="4" y="4" width="16" height="18" rx="2.5"/><path d="M8 11h8M8 15h5"/></svg><span data-i18n="myReports">${CS.t('myReports')}</span></a>
            <a href="profile.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg><span data-i18n="profile">${CS.t('profile')}</span></a>
            <a href="admin.html" class="staff-only" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.3 7.5 9.5 4.4-1.2 7.5-4.9 7.5-9.5V6L12 3z"/></svg><span data-i18n="adminPanel">${CS.t('adminPanel')}</span></a>
            <a href="super-admin.html" class="super-only" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 8.7-8.7M16 7l3 3M18 5l2 2"/></svg><span data-i18n="superAdmin">${CS.t('superAdmin')}</span></a>
            <button type="button" class="user-logout"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11"/></svg><span data-i18n="logout">${CS.t('logout')}</span></button>
          </div>`;
        right.insertBefore(menu, login || $('.menu-toggle', right));
        const btn = $('.user-btn', menu);
        const setOpen = open => { menu.classList.toggle('open', open); btn.setAttribute('aria-expanded', open); };
        btn.addEventListener('click', () => setOpen(!menu.classList.contains('open')));
        document.addEventListener('click', e => { if (!menu.contains(e.target)) setOpen(false); });
        menu.addEventListener('keydown', e => { if (e.key === 'Escape') { setOpen(false); btn.focus(); } });
        $('.user-logout', menu).addEventListener('click', CS.logout);
        btn.setAttribute('aria-label', CS.t('accountMenu'));
      }
      // names go in as text, never as HTML (SEC-5)
      const initials = ((u.firstName || '').trim()[0] || '') + ((u.lastName || '').trim()[0] || '');
      $('.avatar', menu).textContent = (initials || (u.email || '?')[0]).toUpperCase();
      $('.user-name', menu).textContent = u.firstName || '';
      $('.user-full', menu).textContent = [u.firstName, u.lastName].filter(Boolean).join(' ');
      $('.user-mail', menu).textContent = u.email || '';
      $('.staff-only', menu).hidden = !(u.role === 'admin' || u.role === 'super_admin');
      $('.super-only', menu).hidden = u.role !== 'super_admin';
      const here = location.pathname.split('/').pop() || 'index.html';
      $$('.user-pop a', menu).forEach(x => x.classList.toggle('active', x.getAttribute('href') === here));
    },
    async initAuth() {
      const saved = CS.savedSession();
      if (!saved) return CS.renderUser(null);
      // 1) show the name at once from what the browser saved (no flicker of "Log in")
      const m = saved.user.user_metadata || {};
      CS.renderUser({ id:saved.user.id, email:saved.user.email, firstName:m.first_name, lastName:m.last_name, role:null });
      // 2) then check with the server and take the names and role from the profile
      const ctx = await CS.session();
      if (!ctx) return CS.renderUser(null);
      const p = ctx.profile || {};
      CS.renderUser({ id:ctx.user.id, email:ctx.user.email, firstName:p.first_name, lastName:p.last_name, role:p.role });
      ctx.sb.auth.onAuthStateChange(evt => { if (evt === 'SIGNED_OUT') CS.renderUser(null); });
      document.dispatchEvent(new CustomEvent('cs:user', { detail: CS.user }));
    },

    /* optional photos (assets/…): drop the <img> if the file is missing, so the drawn placeholder shows.
       Replaces inline onerror="this.remove()", which the CSP will block (SEC-3). */
    dropMissingImages(root = document) {
      $$('img', root).forEach(img => {
        if (img.complete && img.getAttribute('src') && !img.naturalWidth) img.remove();
        else img.addEventListener('error', () => img.remove(), { once: true });
      });
    },

    start() {
      CS.dropMissingImages();
      $$('.lang button').forEach(b => b.addEventListener('click', () => CS.setLang(b.dataset.lang)));
      CS.initNav();
      CS.setLang(lang);
      CS.initReveal();
      CS.initAuth();
    }
  };

  window.CS = CS;
})();
