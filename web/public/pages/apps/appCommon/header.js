const pages = [
  { key: 'trade', label: 'Trade', href: '/pages/apps/trade.html' },
  { key: 'transaction', label: 'Transaction', href: '/pages/apps/transaction.html' },
  { key: 'hayday', label: 'Hay Day', href: '/pages/apps/hayday.html' },
  { key: 'tool', label: 'Tool', href: '/pages/apps/tool.html' },
];
let moduleSettingsVersion = 0;

function renderHeaders(settings = { trade: true, transaction: true }) {
  document.querySelectorAll('[data-shared-header]').forEach((header) => {
    const activePage = header.dataset.activePage;
    const navigation = activePage
      ? `<nav class="module-tabs" aria-label="Module navigation">
          ${pages.filter((page) => settings[page.key] !== false).map((page) => `<a class="module-tab${page.key === activePage ? ' is-active' : ''}" href="${page.href}"${page.key === activePage ? ' aria-current="page"' : ''}>${page.label}</a>`).join('')}
        </nav>`
      : '';
    const calendarToggle = activePage === 'log'
      ? '<button id="toggle-calendar" class="button secondary mobile-only" type="button">Show calendar</button>'
      : '';

    header.innerHTML = `
      <div class="title-row">
        <div class="title-stack">
          <h1><a href="/" class="no-underline brand-link"><img src="/corelog-logo.png" alt="" class="brand-icon"><span class="brand-name">Core Log</span></a></h1>
          ${navigation}
        </div>
        ${calendarToggle}
      </div>
    `;
  });
}

renderHeaders();

window.addEventListener('corelog:module-settings-changed', (event) => {
  moduleSettingsVersion += 1;
  renderHeaders(event.detail);
});

const initialSettingsVersion = moduleSettingsVersion;
fetch('/api/tool/module-settings')
  .then((response) => response.ok ? response.json() : Promise.reject(new Error('Unable to load module settings.')))
  .then((settings) => {
    if (moduleSettingsVersion === initialSettingsVersion) renderHeaders(settings);
  })
  .catch(() => {
    // Keep all tabs visible if settings cannot be loaded.
  });
