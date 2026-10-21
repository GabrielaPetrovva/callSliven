/* CallSliven — 6-digit code input, shared by auth.js (log in) and security.js (MFA setup).
   Usage: const otp = OtpInput(document.querySelector('[data-otp]'), { onComplete(code){…}, onInput(){…} });
   Handles typing, Backspace, arrows, paste and the phone's one-time-code autofill. */
window.OtpInput = function (root, { onComplete = () => {}, onInput = () => {}, length = 6 } = {}) {
  root.classList.add('otp');
  root.setAttribute('role', 'group');
  root.innerHTML = '';
  const boxes = Array.from({ length }, (_, i) => {
    const b = document.createElement('input');
    b.inputMode = 'numeric';
    b.pattern = '[0-9]*';
    // the first box takes the whole code from autofill / SMS suggestions
    b.maxLength = i === 0 ? length : 1;
    b.autocomplete = i === 0 ? 'one-time-code' : 'off';
    root.appendChild(b);
    return b;
  });

  const value = () => boxes.map(b => b.value).join('');
  function fillFrom(i, digits) {
    digits.slice(0, length - i).split('').forEach((d, k) => { boxes[i + k].value = d; boxes[i + k].classList.add('filled'); });
    (boxes.find(b => !b.value) || boxes[length - 1]).focus();
    if (value().length === length) onComplete(value());
  }

  boxes.forEach((box, i) => {
    box.addEventListener('focus', () => box.select());
    box.addEventListener('input', () => {
      const digits = box.value.replace(/\D/g, '');
      box.value = '';
      box.classList.remove('filled');
      root.classList.remove('ok');
      onInput();
      if (digits) fillFrom(i, digits);
    });
    box.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !box.value && i > 0) {
        e.preventDefault();
        boxes[i - 1].value = '';
        boxes[i - 1].classList.remove('filled');
        boxes[i - 1].focus();
        onInput();
      } else if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); boxes[i - 1].focus(); }
      else if (e.key === 'ArrowRight' && i < length - 1) { e.preventDefault(); boxes[i + 1].focus(); }
    });
    box.addEventListener('paste', e => {
      const digits = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
      if (!digits) return;
      e.preventDefault();
      fillFrom(i, digits);
    });
  });

  return {
    el: root,
    value,
    complete: () => value().length === length,
    clear() { boxes.forEach(b => { b.value = ''; b.classList.remove('filled'); }); root.classList.remove('ok'); },
    focus() { (boxes.find(b => !b.value) || boxes[0]).focus(); },
    success() { root.classList.add('ok'); },
    setLabels(fn) { boxes.forEach((b, i) => b.setAttribute('aria-label', fn(i + 1))); },
    setInvalid(on) { boxes.forEach(b => b.setAttribute('aria-invalid', !!on)); }
  };
};
