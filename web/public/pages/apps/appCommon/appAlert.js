let alertBackdrop;

function closeAlert() {
  alertBackdrop?.classList.remove('open');
}

function ensureAlert() {
  if (alertBackdrop?.isConnected) return alertBackdrop;

  alertBackdrop = document.createElement('section');
  alertBackdrop.id = 'app-alert-backdrop';
  alertBackdrop.className = 'dialog-backdrop';
  alertBackdrop.setAttribute('aria-modal', 'true');
  alertBackdrop.setAttribute('role', 'alertdialog');
  alertBackdrop.setAttribute('aria-labelledby', 'app-alert-title');
  alertBackdrop.innerHTML = `
    <article class="dialog app-alert-dialog">
      <div class="app-alert-heading">
        <span class="app-alert-icon" aria-hidden="true">!</span>
        <h2 id="app-alert-title"></h2>
      </div>
      <p class="app-alert-message"></p>
      <div class="dialog-actions app-alert-actions">
        <button class="button secondary" type="button" data-close-app-alert>Close</button>
      </div>
    </article>
  `;

  alertBackdrop.querySelector('[data-close-app-alert]').addEventListener('click', closeAlert);
  alertBackdrop.addEventListener('click', (event) => {
    if (event.target === alertBackdrop) closeAlert();
  });
  document.body.appendChild(alertBackdrop);
  return alertBackdrop;
}

export function showAlert(title, message) {
  const backdrop = ensureAlert();
  backdrop.querySelector('#app-alert-title').textContent = String(title ?? 'Notice');
  backdrop.querySelector('.app-alert-message').textContent = String(message ?? '');
  backdrop.classList.add('open');
  window.requestAnimationFrame(() => backdrop.querySelector('[data-close-app-alert]')?.focus());
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && alertBackdrop?.classList.contains('open')) closeAlert();
});
