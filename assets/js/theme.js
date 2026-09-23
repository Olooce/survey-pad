const THEME_KEY = 'sp:theme';

export const FONT_OPTIONS = [
  { value: "'Inter', sans-serif", label: 'Inter' },
  { value: "'Lexend Deca', sans-serif", label: 'Lexend Deca' },
  { value: "'Asap', sans-serif", label: 'Asap' },
];

export const DEFAULT_THEME = {
  fontFamily: FONT_OPTIONS[0].value,
  fontSize: 16,
  primary: '#4f46e5',
  radius: 10,
  spacing: 1,
};

function apply(theme) {
  const root = document.documentElement.style;
  root.setProperty('--font-family', theme.fontFamily);
  root.setProperty('--font-size-base', `${theme.fontSize}px`);
  root.setProperty('--color-primary', theme.primary);
  root.setProperty('--radius-base', `${theme.radius}px`);
  root.setProperty('--space-scale', theme.spacing);
}

export function loadTheme() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(THEME_KEY)) || {};
  } catch {
    saved = {};
  }
  const theme = { ...DEFAULT_THEME, ...saved };
  apply(theme);
  return theme;
}

export function saveTheme(theme) {
  const merged = { ...DEFAULT_THEME, ...theme };
  localStorage.setItem(THEME_KEY, JSON.stringify(merged));
  apply(merged);
  return merged;
}

export function resetTheme() {
  localStorage.removeItem(THEME_KEY);
  apply(DEFAULT_THEME);
  return { ...DEFAULT_THEME };
}
