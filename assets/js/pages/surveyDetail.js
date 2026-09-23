import { initApp } from '../common.js';
import { Store } from '../store.js';
import { el, icon, uid } from '../utils.js';
import { typeDef, defaultOptions, renderQuestionField } from '../inputTypes.js';
import { confirmAction } from '../components/confirm.js';
import { toast } from '../components/toast.js';

initApp();

const surveyId = new URLSearchParams(window.location.search).get('id');
const survey = surveyId ? Store.getSurvey(surveyId) : null;

if (!survey) {
  document.getElementById('survey-not-found').hidden = false;
} else {
  document.getElementById('survey-detail-content').hidden = false;
  initSurveyDetail(survey);
}

function initSurveyDetail(survey) {
  document.title = `${survey.title} – Survey Pad`;
  document.getElementById('survey-title-heading').textContent = survey.title;
  const descEl = document.getElementById('survey-desc-text');
  if (survey.description) { descEl.textContent = survey.description; descEl.hidden = false; }
  document.getElementById('survey-slug-chip').textContent = survey.slug;
  document.getElementById('open-live-link').href = `take.html?slug=${encodeURIComponent(survey.slug)}`;

  const tbody = document.getElementById('questions-tbody');
  const tableWrap = document.getElementById('questions-table-wrap');
  const emptyState = document.getElementById('questions-empty');

  const dialog = document.getElementById('question-dialog');
  const dialogTitle = document.getElementById('question-dialog-title');
  const form = document.getElementById('question-form');
  const idInput = document.getElementById('q-id');
  const typeSelect = document.getElementById('q-type');
  const labelInput = document.getElementById('q-label');
  const helpInput = document.getElementById('q-help');
  const requiredInput = document.getElementById('q-required');
  const placeholderInput = document.getElementById('q-placeholder');
  const rowsInput = document.getElementById('q-rows');
  const minInput = document.getElementById('q-min');
  const maxInput = document.getElementById('q-max');
  const stepInput = document.getElementById('q-step');
  const acceptInput = document.getElementById('q-accept');
  const patternInput = document.getElementById('q-pattern');
  const minLenInput = document.getElementById('q-minlen');
  const maxLenInput = document.getElementById('q-maxlen');
  const optionsEditor = document.getElementById('options-editor');
  const addOptionBtn = document.getElementById('add-option-btn');
  const submitBtn = document.getElementById('question-submit-btn');

  const GROUP_FLAGS = {
    placeholder: 'hasPlaceholder', rows: 'hasRows', minmax: 'hasMinMax',
    step: 'hasStep', accept: 'hasAccept', pattern: 'hasPattern', options: 'hasOptions',
  };

  let currentOptions = [];

  function refreshGroups() {
    const def = typeDef(typeSelect.value);
    for (const [group, flag] of Object.entries(GROUP_FLAGS)) {
      const groupEl = form.querySelector(`[data-group="${group}"]`);
      groupEl.hidden = !def[flag];
    }
  }

  function renderOptionsEditor() {
    optionsEditor.innerHTML = '';
    currentOptions.forEach((opt, i) => {
      const labelField = el('input', { type: 'text', placeholder: 'Label', value: opt.label });
      const valueField = el('input', { type: 'text', placeholder: 'Value', value: opt.value });
      labelField.addEventListener('input', () => { opt.label = labelField.value; });
      valueField.addEventListener('input', () => { opt.value = valueField.value; });
      const removeBtn = el('button', {
        class: 'icon-button', type: 'button', 'aria-label': 'Remove option',
        onClick: () => { currentOptions.splice(i, 1); renderOptionsEditor(); },
      }, icon('trash'));
      optionsEditor.append(el('div', { class: 'option-row' }, [labelField, valueField, removeBtn]));
    });
  }

  addOptionBtn.addEventListener('click', () => {
    currentOptions.push({ id: uid('opt'), label: `Option ${currentOptions.length + 1}`, value: `option-${currentOptions.length + 1}` });
    renderOptionsEditor();
  });

  typeSelect.addEventListener('change', refreshGroups);

  function openQuestionDialog(question) {
    form.reset();
    idInput.value = question?.id || '';
    typeSelect.value = question?.type || 'text';
    labelInput.value = question?.label || '';
    helpInput.value = question?.help || '';
    requiredInput.checked = !!question?.required;
    placeholderInput.value = question?.placeholder || '';
    rowsInput.value = question?.rows || 4;
    minInput.value = question?.min ?? '';
    maxInput.value = question?.max ?? '';
    stepInput.value = question?.step ?? '';
    acceptInput.value = question?.accept || '';
    patternInput.value = question?.pattern || '';
    minLenInput.value = question?.minLength ?? '';
    maxLenInput.value = question?.maxLength ?? '';
    currentOptions = question?.options?.length ? question.options.map((o) => ({ ...o })) : defaultOptions();
    renderOptionsEditor();
    refreshGroups();
    dialogTitle.textContent = question ? 'Edit question' : 'Add question';
    submitBtn.textContent = question ? 'Save question' : 'Add question';
    dialog.showModal();
    labelInput.focus();
  }

  document.getElementById('add-question-btn').addEventListener('click', () => openQuestionDialog());

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const def = typeDef(typeSelect.value);
    if (def.hasOptions && currentOptions.filter((o) => o.label.trim()).length === 0) {
      alert('Add at least one option.');
      return;
    }
    const data = {
      type: typeSelect.value,
      label: labelInput.value.trim(),
      help: helpInput.value.trim(),
      required: requiredInput.checked,
      placeholder: def.hasPlaceholder ? placeholderInput.value : '',
      rows: def.hasRows ? Number(rowsInput.value) || 4 : '',
      min: def.hasMinMax ? minInput.value : '',
      max: def.hasMinMax ? maxInput.value : '',
      step: def.hasStep ? stepInput.value : '',
      accept: def.hasAccept ? acceptInput.value.trim() : '',
      pattern: def.hasPattern ? patternInput.value.trim() : '',
      minLength: def.hasPattern ? minLenInput.value : '',
      maxLength: def.hasPattern ? maxLenInput.value : '',
      options: def.hasOptions ? currentOptions.filter((o) => o.label.trim()).map((o) => ({ ...o, value: o.value || o.label })) : [],
    };
    const questionId = idInput.value;
    if (questionId) Store.updateQuestion(questionId, data);
    else Store.createQuestion(survey.id, data);
    toast(questionId ? 'Question updated.' : 'Question added.');
    dialog.close('confirm');
    renderRows();
  });

  async function removeQuestion(question) {
    const ok = await confirmAction({
      title: 'Delete question',
      message: `Delete "${question.label}"? This cannot be undone.`,
      confirmLabel: 'Delete question',
    });
    if (!ok) return;
    Store.deleteQuestion(question.id);
    toast('Question deleted.');
    renderRows();
  }

  function buildRow(question) {
    const actions = el('div', { class: 'row-actions' }, [
      el('button', { class: 'icon-button', type: 'button', title: 'Move up', onClick: () => { Store.moveQuestion(question.id, 'up'); renderRows(); } }, icon('chevron-up')),
      el('button', { class: 'icon-button', type: 'button', title: 'Move down', onClick: () => { Store.moveQuestion(question.id, 'down'); renderRows(); } }, icon('chevron-down')),
      el('button', { class: 'icon-button', type: 'button', title: 'Edit', onClick: () => openQuestionDialog(question) }, icon('edit')),
      el('button', { class: 'icon-button icon-button--danger', type: 'button', title: 'Delete', onClick: () => removeQuestion(question) }, icon('trash')),
    ]);
    return el('tr', {}, [
      el('td', { 'data-label': '#' }, String(question.order + 1)),
      el('td', { 'data-label': 'Label' }, question.label),
      el('td', { 'data-label': 'Type' }, typeDef(question.type).label),
      el('td', { 'data-label': 'Required' }, question.required ? 'Yes' : '—'),
      el('td', { 'data-label': 'Actions' }, actions),
    ]);
  }

  function renderRows() {
    const questions = Store.listQuestions(survey.id);
    tbody.innerHTML = '';
    if (!questions.length) {
      tableWrap.hidden = true;
      emptyState.hidden = false;
      return;
    }
    tableWrap.hidden = false;
    emptyState.hidden = true;
    questions.forEach((q) => tbody.append(buildRow(q)));
  }

  const previewDialog = document.getElementById('preview-dialog');
  const previewContent = document.getElementById('preview-content');
  const previewEmpty = document.getElementById('preview-empty');
  document.getElementById('preview-btn').addEventListener('click', () => {
    previewDialog.querySelector('#preview-dialog-title').textContent = `Preview – ${survey.title}`;
    const questions = Store.listQuestions(survey.id);
    previewContent.innerHTML = '';
    const answers = {};
    if (!questions.length) {
      previewContent.hidden = true;
      previewEmpty.hidden = false;
    } else {
      previewContent.hidden = false;
      previewEmpty.hidden = true;
      questions.forEach((q) => {
        previewContent.append(renderQuestionField(q, { value: answers[q.id], onChange: (v) => { answers[q.id] = v; } }));
      });
    }
    previewDialog.showModal();
  });

  renderRows();
}
