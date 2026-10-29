/* CallSliven — legal pages (privacy, terms): always open at the top, "back to top" button,
   drop a missing crest image (no inline onerror, SEC-3). */
(() => {
  /* Always start at the top, even when the link has #section (e.g. the footer's "Cookies" → privacy.html#storage)
     or the browser would restore an old scroll position (Back, reload, page from the cache).
     For a #section link the matching row in the table of contents lights up, so the reader sees where it is. */
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  const hash = location.hash;
  if (hash) history.replaceState(null, '', location.pathname + location.search);   // the browser no longer jumps there
  const toTop = () => scrollTo({ top:0, left:0, behavior:'instant' });
  toTop();
  addEventListener('DOMContentLoaded', toTop);
  addEventListener('load', toTop);
  addEventListener('pageshow', e => { if (e.persisted) toTop(); });     // back from another page (from the cache)
  addEventListener('DOMContentLoaded', () => {
    const link = hash && /^#[\w-]+$/.test(hash) && document.querySelector('.toc a[href="' + hash + '"]');
    if (!link) return;
    const li = link.closest('li') || link;
    li.classList.add('flash');
    li.addEventListener('animationend', () => li.classList.remove('flash'), { once:true });
  });

  // links inside the page (table of contents) still scroll to their section as before
  const btn = document.querySelector('.to-top');
  if (btn) {
    addEventListener('scroll', () => btn.classList.toggle('show', scrollY > 600), { passive:true });
    btn.addEventListener('click', () => scrollTo({ top:0, behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
  }
  document.querySelectorAll('img').forEach(img => {
    if (img.complete && !img.naturalWidth) img.remove(); else img.addEventListener('error', () => img.remove());
  });
})();
