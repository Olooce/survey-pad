const THEME_KEY = 'sp:theme';

export const THEMES = [
    {value: 'light', label: 'Light'},
    {value: 'dark', label: 'Dark'},
    {value: 'contrast', label: 'High contrast'},
];

export const FONT_OPTIONS = [
    {value: "'Inter', sans-serif", label: 'Inter'},
    {value: "'Lexend Deca', sans-serif", label: 'Lexend Deca'},
    {value: "'Asap', sans-serif", label: 'Asap'},
];

function systemTheme() {
    if (matchMedia('(prefers-contrast: more)').matches) return 'contrast';
    if (matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
    return 'light';
}

export const DEFAULT_THEME = {
    theme: systemTheme(),
    fontFamily: FONT_OPTIONS[0].value,
    fontSize: 16,
    radius: 10,
    spacing: 1,
};

function num(value, fallback, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

function sanitize(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const t = {...DEFAULT_THEME, ...src};

    for (const k of Object.keys(t)) {
        if (!(k in DEFAULT_THEME)) delete t[k];
    }

    if (!THEMES.some((x) => x.value === t.theme)) t.theme = DEFAULT_THEME.theme;
    if (!FONT_OPTIONS.some((f) => f.value === t.fontFamily)) t.fontFamily = DEFAULT_THEME.fontFamily;
    t.fontSize = num(t.fontSize, DEFAULT_THEME.fontSize, 13, 20);
    t.radius = num(t.radius, DEFAULT_THEME.radius, 0, 24);
    t.spacing = num(t.spacing, DEFAULT_THEME.spacing, 0.8, 1.4);
    return t;
}

function apply(t) {
    const root = document.documentElement;
    root.dataset.theme = t.theme;

    const s = root.style;
    s.setProperty('--font-family', t.fontFamily);
    s.setProperty('--font-size-base', `${t.fontSize}px`);
    s.setProperty('--radius-base', `${t.radius}px`);
    s.setProperty('--space-scale', t.spacing);

    s.removeProperty('--color-primary');
    s.removeProperty('--color-on-primary');

    const bg = getComputedStyle(root).getPropertyValue('--color-bg').trim();
    if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
}

export function loadTheme() {
    let saved = null;
    try {
        saved = JSON.parse(localStorage.getItem(THEME_KEY));
    } catch {
        saved = null;
    }
    const theme = sanitize(saved);
    apply(theme);
    return theme;
}

export function saveTheme(theme) {
    const merged = sanitize(theme);
    try {
        localStorage.setItem(THEME_KEY, JSON.stringify(merged));
    } catch {
        /* storage unavailable or full: still apply for this session */
    }
    apply(merged);
    return merged;
}

export function resetTheme() {
    try {
        localStorage.removeItem(THEME_KEY);
    } catch {
        /* ignore */
    }
    const theme = sanitize(null);
    apply(theme);
    return theme;
}

export function renderThemeOptions(container, currentValue, onChange) {
    container.replaceChildren();
    THEMES.forEach((item, i) => {
        const id = `theme-opt-${i}`;
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'theme-choice';
        input.id = id;
        input.value = item.value;
        input.checked = item.value === currentValue;
        input.addEventListener('change', () => input.checked && onChange(item.value));

        const label = document.createElement('label');
        label.htmlFor = id;
        label.textContent = item.label;

        container.append(input, label);
    });
}