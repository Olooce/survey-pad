import {loadTheme, renderThemeOptions, resetTheme, saveTheme,} from './theme.js';

import {seedIfEmpty} from './seed.js';

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

    const themeOptions = document.getElementById('theme-options');
    const fontSelect = document.getElementById('theme-font');
    const fontSizeInput = document.getElementById('theme-font-size');
    const fontSizeOut = document.getElementById('theme-font-size-out');
    const radiusInput = document.getElementById('theme-radius');
    const radiusOut = document.getElementById('theme-radius-out');
    const spacingInput = document.getElementById('theme-spacing');
    const spacingOut = document.getElementById('theme-spacing-out');
    const resetBtn = document.getElementById('theme-reset');

    let theme = loadTheme();

    function update(patch) {
        theme = saveTheme({...theme, ...patch});
    }

    function fillControls() {
        if (themeOptions) {
            renderThemeOptions(themeOptions, theme.theme, (value) => update({theme: value}));
        }
        fontSelect.value = theme.fontFamily;
        fontSizeInput.value = theme.fontSize;
        fontSizeOut.textContent = `${theme.fontSize}px`;
        radiusInput.value = theme.radius;
        radiusOut.textContent = `${theme.radius}px`;
        spacingInput.value = theme.spacing;
        spacingOut.textContent = `${theme.spacing}x`;
    }

    themeBtn.addEventListener('click', () => {
        fillControls();
        dialog.showModal();
    });

    fontSelect.addEventListener('change', () => update({fontFamily: fontSelect.value}));
    fontSizeInput.addEventListener('input', () => {
        fontSizeOut.textContent = `${fontSizeInput.value}px`;
        update({fontSize: Number(fontSizeInput.value)});
    });
    radiusInput.addEventListener('input', () => {
        radiusOut.textContent = `${radiusInput.value}px`;
        update({radius: Number(radiusInput.value)});
    });
    spacingInput.addEventListener('input', () => {
        spacingOut.textContent = `${spacingInput.value}x`;
        update({spacing: Number(spacingInput.value)});
    });
    resetBtn.addEventListener('click', () => {
        theme = resetTheme();
        fillControls();
    });
}

export function initApp() {
    loadTheme();
    seedIfEmpty();
    wireDialogAutoClose();
    wireThemeDialog();
}
