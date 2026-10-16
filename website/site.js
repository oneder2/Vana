// Page enhancement only: downloads and installation help work without JS.
const toggle = document.querySelector('.history-toggle');
const reading = document.querySelector('#reading-example');
const history = document.querySelector('#history-example');
if (toggle && reading && history) {
  toggle.hidden = false;
  toggle.addEventListener('click', () => {
    const showingHistory = toggle.getAttribute('aria-pressed') !== 'true';
    toggle.setAttribute('aria-pressed', String(showingHistory));
    reading.hidden = showingHistory;
    history.hidden = !showingHistory;
    toggle.querySelector('span').textContent = showingHistory ? '回到正文阅读' : '看看修改对照';
    document.querySelector('#demo-caption').textContent = showingHistory ? '正文修改对照' : '正文阅读';
  });
}
const device = /Android/i.test(navigator.userAgent) ? 'android'
  : /Windows/i.test(navigator.userAgent) ? 'windows'
  : /Linux/i.test(navigator.userAgent) ? 'linux' : null;
if (device) document.querySelector(`[data-platform="${device}"]`)?.classList.add('is-device');
function openLinkedHelp() {
  const target = document.getElementById(location.hash.slice(1));
  if (target instanceof HTMLDetailsElement) target.open = true;
}
window.addEventListener('hashchange', openLinkedHelp);
openLinkedHelp();
