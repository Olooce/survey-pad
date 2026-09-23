import { initApp } from '../common.js';
import { Store } from '../store.js';
import { el, icon, slugify, formatDate } from '../utils.js';
import { confirmAction } from '../components/confirm.js';
import { toast } from '../components/toast.js';

initApp();

const tbody = document.getElementById('surveys-tbody');
const tableWrap = document.getElementById('surveys-table-wrap');
const emptyState = document.getElementById('surveys-empty');

const dialog = document.getElementById('survey-dialog');
const dialogTitle = document.getElementById('survey-dialog-title');
const form = document.getElementById('survey-form');
const idInput = document.getElementById('survey-id');
const titleInput = document.getElementById('survey-title');
const slugInput = document.getElementById('survey-slug');
const slugError = document.getElementById('survey-slug-error');
const descInput = document.getElementById('survey-desc');
const submitBtn = document.getElementById('survey-submit-btn');

let slugTouched = false;

function openSurveyDialog(survey) {
  form.reset();
  slugError.hidden = true;
  slugTouched = !!survey;
  idInput.value = survey?.id || '';
  titleInput.value = survey?.title || '';
  slugInput.value = survey?.slug || '';
  descInput.value = survey?.description || '';
  dialogTitle.textContent = survey ? 'Edit survey' : 'New survey';
  submitBtn.textContent = survey ? 'Save changes' : 'Create survey';
  dialog.showModal();
  titleInput.focus();
}

titleInput.addEventListener('input', () => {
  if (!slugTouched) slugInput.value = slugify(titleInput.value);
});
slugInput.addEventListener('input', () => {
  slugTouched = true;
  slugInput.value = slugify(slugInput.value);
  slugError.hidden = true;
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!form.reportValidity()) return;
  const slug = slugify(slugInput.value);
  const survey = idInput.value ? Store.getSurvey(idInput.value) : null;
  if (Store.isSlugTaken(slug, survey?.id)) {
    slugError.hidden = false;
    slugInput.focus();
    return;
  }
  const data = { title: titleInput.value.trim(), slug, description: descInput.value.trim() };
  if (survey) {
    Store.updateSurvey(survey.id, data);
    toast('Survey updated.');
  } else {
    Store.createSurvey(data);
    toast('Survey created.');
  }
  dialog.close('confirm');
  renderRows();
});

document.getElementById('new-survey-btn').addEventListener('click', () => openSurveyDialog());

function copyLink(survey) {
  const url = `${window.location.origin}${window.location.pathname.replace(/index\.html$/, '')}take.html?slug=${survey.slug}`;
  navigator.clipboard?.writeText(url).then(
    () => toast('Survey link copied.'),
    () => toast('Could not copy link.', 'danger'),
  );
}

async function removeSurvey(survey) {
  const ok = await confirmAction({
    title: 'Delete survey',
    message: `Delete "${survey.title}"? This also deletes its ${Store.listQuestions(survey.id).length} question(s) and any responses. This cannot be undone.`,
    confirmLabel: 'Delete survey',
  });
  if (!ok) return;
  Store.deleteSurvey(survey.id);
  toast('Survey deleted.');
  renderRows();
}

function buildRow(survey) {
  const actions = el('div', { class: 'row-actions' }, [
    el('button', { class: 'icon-button', type: 'button', title: 'Edit', onClick: () => openSurveyDialog(survey) }, icon('edit')),
    el('a', { class: 'icon-button', title: 'Take survey', href: `take.html?slug=${encodeURIComponent(survey.slug)}` }, icon('eye')),
    el('button', { class: 'icon-button', type: 'button', title: 'Copy link', onClick: () => copyLink(survey) }, icon('link')),
    el('button', { class: 'icon-button icon-button--danger', type: 'button', title: 'Delete', onClick: () => removeSurvey(survey) }, icon('trash')),
  ]);

  return el('tr', {}, [
    el('td', { 'data-label': 'Title' }, el('a', { class: 'row-title', href: `survey.html?id=${encodeURIComponent(survey.id)}` }, survey.title)),
    el('td', { 'data-label': 'Questions' }, String(Store.listQuestions(survey.id).length)),
    el('td', { 'data-label': 'Responses' }, String(Store.countResponses(survey.id))),
    el('td', { 'data-label': 'Updated' }, formatDate(survey.updatedAt)),
    el('td', { 'data-label': 'Actions' }, actions),
  ]);
}

function renderRows() {
  const surveys = Store.listSurveys();
  tbody.innerHTML = '';
  if (!surveys.length) {
    tableWrap.hidden = true;
    emptyState.hidden = false;
    return;
  }
  tableWrap.hidden = false;
  emptyState.hidden = true;
  surveys.forEach((s) => tbody.append(buildRow(s)));
}

renderRows();
