import { el } from '../utils.js';

let container = null;

export function toast(message, tone = 'default') {
  if (!container) {
    container = document.getElementById('toast-host');
  }
  const node = el('div', { class: `toast toast--${tone}` }, message);
  container.append(node);
  requestAnimationFrame(() => node.classList.add('toast--visible'));
  setTimeout(() => {
    node.classList.remove('toast--visible');
    setTimeout(() => node.remove(), 200);
  }, 2600);
}
