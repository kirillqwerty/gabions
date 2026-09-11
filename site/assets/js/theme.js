/* Runs before CSS to avoid a flash of the wrong theme. Only the theme is stored. */
(() => {
  let theme;
  try { theme = localStorage.getItem('gabions-theme'); } catch {}
  if (!['light', 'dark'].includes(theme)) theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
})();
