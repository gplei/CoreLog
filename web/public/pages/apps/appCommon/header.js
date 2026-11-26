const pages = [
  { key: 'trade', label: 'Trade', href: '/pages/apps/trade.html' },
  { key: 'transaction', label: 'Transaction', href: '/pages/apps/transaction.html' },
  { key: 'hayday', label: 'Hay Day', href: '/pages/apps/hayday.html' },
  { key: 'tool', label: 'Tool', href: '/pages/apps/tool.html' },
];
let moduleSettingsVersion = 0;
let useThemeNow = false;

const NIGHT_START_HOUR = 20;
const NIGHT_END_HOUR = 6;
const THEME_STORAGE_KEY = 'corelog-theme';
const THEMES = ['rose-gold', 'sage-gold', 'denim-rose'];
const THEME_COLORS = {
  'rose-gold': ['#3a2933', '#4a3740', '#654e59', '#92727e', '#a77886', '#8c6370', '#5a3e48', '#c48695', '#a96878', '#754752'],
  'sage-gold': ['#2e3a32', '#3c4b40', '#5a6b5e', '#829386', '#718875', '#5d735f', '#435448', '#b5c58c', '#8ea874', '#657c54'],
  'denim-rose': ['#27384d', '#3b4b5f', '#526275', '#74879a', '#6f8298', '#5d7188', '#3f4d5f', '#b28a9b', '#956d81', '#604756'],
};
const THEME_COLOR_KEYS = ['entry-bg', 'panel-bg', 'control-bg', 'border', 'highlight-start', 'highlight-end', 'highlight-edge', 'selected-start', 'selected-end', 'selected-edge'];
const THEME_PAGE_COLORS = {
  'rose-gold': '#332f2a',
  'sage-gold': '#30332d',
  'denim-rose': '#2b3138',
};

function applyTheme(theme) {
  const selectedTheme = THEMES.includes(theme) ? theme : 'rose-gold';
  const colors = THEME_COLORS[selectedTheme];
  document.documentElement.dataset.theme = selectedTheme;
  THEMES.forEach((name) => document.documentElement.classList.toggle(`theme-${name}`, name === selectedTheme));
  THEME_COLOR_KEYS.forEach((key, index) => document.documentElement.style.setProperty(`--night-${key}`, colors[index]));
  document.documentElement.style.setProperty('--night-page-bg', THEME_PAGE_COLORS[selectedTheme]);

  if (document.documentElement.classList.contains('night-time') || document.documentElement.classList.contains('theme-preview')) {
    const setBackground = (selector, value) => document.querySelectorAll(selector).forEach((element) => {
      element.style.setProperty('background', value, 'important');
      element.style.setProperty('border-color', colors[3], 'important');
    });
    setBackground('.calendar-card, .calendar-links-card', colors[1]);
    setBackground('.entry-card', colors[0]);
    setBackground('#quick-link-group, .calendar-heading select, .qlink-tooltip', colors[2]);
    document.querySelectorAll('.calendar-card .day-cell.has-entry:not(.selected)').forEach((element) => {
      element.style.setProperty('background', `linear-gradient(180deg, ${colors[4]}, ${colors[5]})`, 'important');
      element.style.setProperty('box-shadow', `inset 0 1px 0 rgb(255 255 255 / 16%), 0 2px 0 ${colors[6]}, 0 4px 7px rgb(2 6 23 / 22%)`, 'important');
    });
    document.querySelectorAll('.calendar-card .day-cell.selected').forEach((element) => {
      element.style.setProperty('background', `linear-gradient(180deg, ${colors[7]}, ${colors[8]})`, 'important');
      element.style.setProperty('box-shadow', `inset 0 1px 0 rgb(255 255 255 / 32%), 0 3px 0 ${colors[9]}, 0 6px 10px rgb(2 6 23 / 30%)`, 'important');
    });
  }
  return selectedTheme;
}

window.corelogApplyTheme = applyTheme;

function applyThemeSettings(settings = {}) {
  useThemeNow = settings.useNow === true;
  applyTheme(settings.theme);
  updateTimeTheme();
}

applyTheme(localStorage.getItem(THEME_STORAGE_KEY));

window.addEventListener('corelog:theme-changed', (event) => {
  applyTheme(event.detail?.theme);
});

window.addEventListener('storage', (event) => {
  if (event.key === THEME_STORAGE_KEY) applyTheme(event.newValue);
});

function updateTimeTheme() {
  const hour = new Date().getHours();
  const isNight = hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR;
  const previewTheme = document.documentElement.classList.contains('theme-preview');
  document.documentElement.classList.toggle('night-time', isNight || useThemeNow || previewTheme);
}

window.corelogUpdateTimeTheme = updateTimeTheme;

updateTimeTheme();
window.setInterval(updateTimeTheme, 60 * 1000);

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
  applyThemeSettings(event.detail);
  renderHeaders(event.detail);
});

const initialSettingsVersion = moduleSettingsVersion;
fetch('/api/tool/module-settings')
  .then((response) => response.ok ? response.json() : Promise.reject(new Error('Unable to load module settings.')))
  .then((settings) => {
    applyThemeSettings(settings);
    if (moduleSettingsVersion === initialSettingsVersion) renderHeaders(settings);
  })
  .catch(() => {
    // Keep all tabs visible if settings cannot be loaded.
  });
