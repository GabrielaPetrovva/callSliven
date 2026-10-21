/* CallSliven — legal pages: "back to top" button; drop a missing crest image (no inline onerror, SEC-3). */
(() => {
  const btn = document.querySelector('.to-top');
  addEventListener('scroll', () => btn.classList.toggle('show', scrollY > 600), { passive:true });
  btn.addEventListener('click', () => scrollTo({ top:0, behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
  document.querySelectorAll('img').forEach(img => {
    if (img.complete && !img.naturalWidth) img.remove(); else img.addEventListener('error', () => img.remove());
  });
})();
