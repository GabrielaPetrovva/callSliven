/* CallSliven — shared helpers for the public pages (reports list, single report).
   Statuses, colours and category icons. All report data itself comes from the database. */
(() => {
  CS.addStrings({
    bg: { s_new:'Нов', s_sent:'Изпратен', s_in_progress:'В обработка', s_resolved:'Решен', s_closed:'Затворен' },
    en: { s_new:'New', s_sent:'Sent', s_in_progress:'In progress', s_resolved:'Resolved', s_closed:'Closed' }
  });
  // only these statuses are public (PUB-5, PUB-6)
  const STATUSES = ['new', 'sent', 'in_progress', 'resolved', 'closed'];
  const COLORS = { new:'#6B7A70', sent:'#A26A35', in_progress:'#C99A06', resolved:'#1F7A3A', closed:'#3E5468' };
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
  const OTHER = '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>';

  window.PUB = {
    STATUSES, COLORS,
    icon: name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICO[name] || OTHER}</svg>`,
    // status pill as an element (texts go in with textContent)
    pill(status) {
      const s = document.createElement('span');
      s.className = 'pub-pill';
      s.style.setProperty('--c', COLORS[status] || COLORS.new);
      s.textContent = CS.t('s_' + status) || status;
      return s;
    },
    when(iso) {
      const d = new Date(iso);
      return d.toLocaleDateString(CS.lang === 'bg' ? 'bg-BG' : 'en-GB', { day:'numeric', month:'long', year:'numeric' });
    },
    ago(iso) {
      const days = Math.floor((Date.now() - new Date(iso)) / 864e5);
      return CS.ago(Math.max(0, days));
    }
  };
})();
