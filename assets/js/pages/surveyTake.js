import { initApp } from '../common.js';
import { Store } from '../store.js';
import { renderQuestionField } from '../inputTypes.js';

initApp();

const slug = new URLSearchParams(window.location.search).get('slug');
const surveys = Store.listSurveys();
const survey = slug ? Store.getSurveyBySlug(slug) : null;

if (!survey) {
  const msg = document.getElementById('take-not-found-message');
  msg.textContent = slug ? `No survey found for "${slug}".` : 'No survey selected.';
  document.getElementById('take-not-found').hidden = false;
} else {
  document.getElementById('take-content').hidden = false;
  initTakePage(survey);
}

function setNav(surveys, idx) {
  const atFirst = idx <= 0;
  const atLast = idx >= surveys.length - 1;
  const targets = { first: surveys[0], prev: surveys[idx - 1], next: surveys[idx + 1], last: surveys[surveys.length - 1] };
  const disabled = { first: atFirst, prev: atFirst, next: atLast, last: atLast };

  for (const key of Object.keys(targets)) {
    document.querySelectorAll(`[data-nav="${key}"]`).forEach((link) => {
      if (disabled[key] || !targets[key]) {
        link.setAttribute('aria-disabled', 'true');
        link.removeAttribute('href');
      } else {
        link.removeAttribute('aria-disabled');
        link.href = `take.html?slug=${encodeURIComponent(targets[key].slug)}`;
      }
    });
  }

  document.querySelectorAll('[data-nav-position]').forEach((span) => {
    span.textContent = surveys.length ? `Survey ${idx + 1} of ${surveys.length}` : '';
  });
}

function initTakePage(survey) {
  document.title = `${survey.title} – Survey Pad`;
  const idx = surveys.findIndex((s) => s.id === survey.id);
  setNav(surveys, idx);

  document.getElementById('take-title').textContent = survey.title;
  const descEl = document.getElementById('take-desc');
  if (survey.description) { descEl.textContent = survey.description; descEl.hidden = false; }

  const questions = Store.listQuestions(survey.id);
  const fieldsContainer = document.getElementById('take-fields');
  const formEl = document.getElementById('take-form');
  const submitBtn = document.getElementById('take-submit-btn');
  const answers = {};

  if (!questions.length) {
    document.getElementById('take-empty').hidden = false;
    submitBtn.hidden = true;
  } else {
    questions.forEach((q) => {
      fieldsContainer.append(renderQuestionField(q, { value: answers[q.id], onChange: (v) => { answers[q.id] = v; } }));
    });
  }

  const successPanel = document.getElementById('success-panel');

  formEl.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!formEl.reportValidity()) return;
    Store.saveResponse(survey.id, answers);
    formEl.hidden = true;
    successPanel.hidden = false;
  });

  document.getElementById('submit-another-btn').addEventListener('click', () => {
    successPanel.hidden = true;
    formEl.hidden = false;
    formEl.reset();
  });
}
