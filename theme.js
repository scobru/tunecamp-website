// Apply saved theme immediately to prevent flash
(function () {
  if (localStorage.getItem('tc-theme') === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();

function toggleTheme() {
  var html = document.documentElement;
  var isLight = html.getAttribute('data-theme') === 'light';
  if (isLight) {
    html.removeAttribute('data-theme');
    localStorage.removeItem('tc-theme');
  } else {
    html.setAttribute('data-theme', 'light');
    localStorage.setItem('tc-theme', 'light');
  }
  _syncThemeIcons();
}

function _syncThemeIcons() {
  var isLight = document.documentElement.getAttribute('data-theme') === 'light';
  document.querySelectorAll('[data-theme-icon]').forEach(function (el) {
    el.className = isLight ? 'fas fa-moon text-sm' : 'fas fa-sun text-sm';
  });
}

document.addEventListener('DOMContentLoaded', _syncThemeIcons);
