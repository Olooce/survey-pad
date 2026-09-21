import { loadTheme, saveTheme, resetTheme } from './theme.js';
import { seedIfEmpty } from './seed.js';

function wireDialogAutoClose() {
  document.addEventListener('click', (e) => {
    const closeBtn = e.target.closest('[data-dialog-close]');
    if (closeBtn) {
      closeBtn.closest('dialog')?.close('cancel');
      return;
    }
    const dialog = e.target.closest('dialog');
    if (dialog && e.target === dialog) {
      const rect = dialog.getBoundingClientRect();
      const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
      if (!inside) dialog.close('cancel');
    }
  });
}

function wireThemeDialog() {
  const themeBtn = document.getElementById('theme-btn');
  const dialog = document.getElementById('theme-dialog');
  if (!themeBtn || !dialog) return;

  const fontSelect = document.getElementById('theme-font');
  const fontSizeInput = document.getElementById('theme-font-size');
  const fontSizeOut = document.getElementById('theme-font-size-out');
  const primaryInput = document.getElementById('theme-primary');
  const radiusInput = document.getElementById('theme-radius');
  const radiusOut = document.getElementById('theme-radius-out');
  const spacingInput = document.getElementById('theme-spacing');
  const spacingOut = document.getElementById('theme-spacing-out');
  const resetBtn = document.getElementById('theme-reset');

  function fillControls(theme) {
    fontSelect.value = theme.fontFamily;
    fontSizeInput.value = theme.fontSize;
    fontSizeOut.textContent = `${theme.fontSize}px`;
    primaryInput.value = theme.primary;
    radiusInput.value = theme.radius;
    radiusOut.textContent = `${theme.radius}px`;
    spacingInput.value = theme.spacing;
    spacingOut.textContent = `${theme.spacing}x`;
  }

  function apply() {
    saveTheme({
      fontFamily: fontSelect.value,
      fontSize: Number(fontSizeInput.value),
      primary: primaryInput.value,
      radius: Number(radiusInput.value),
      spacing: Number(spacingInput.value),
    });
  }

  themeBtn.addEventListener('click', () => {
    fillControls(loadTheme());
    dialog.showModal();
  });
  fontSelect.addEventListener('change', apply);
  fontSizeInput.addEventListener('input', () => { fontSizeOut.textContent = `${fontSizeInput.value}px`; apply(); });
  primaryInput.addEventListener('input', apply);
  radiusInput.addEventListener('input', () => { radiusOut.textContent = `${radiusInput.value}px`; apply(); });
  spacingInput.addEventListener('input', () => { spacingOut.textContent = `${spacingInput.value}x`; apply(); });
  resetBtn.addEventListener('click', () => fillControls(resetTheme()));
}

export function initApp() {
  loadTheme();
  seedIfEmpty();
  wireDialogAutoClose();
  wireThemeDialog();
}
