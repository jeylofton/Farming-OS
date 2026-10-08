// Shared helpers: confirm dialogs for destructive actions, auto-submit filters.
document.addEventListener('submit', (e) => {
  const msg = e.target.getAttribute('data-confirm');
  if (msg && !window.confirm(msg)) e.preventDefault();
});
document.querySelectorAll('[data-autosubmit]').forEach((el) => el.addEventListener('change', () => el.form.submit()));
