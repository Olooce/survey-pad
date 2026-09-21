// LocalStorage-backed data layer
import { uid, slugify, uniqueSlug } from './utils.js';

const KEYS = {
  surveys: 'sp:surveys',
  questions: 'sp:questions',
  responses: 'sp:responses',
  seeded: 'sp:seeded',
};

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

const nowIso = () => new Date().toISOString();

export const Store = {
  // ---- Surveys ----
  listSurveys() {
    return read(KEYS.surveys).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  },
  getSurvey(id) {
    return read(KEYS.surveys).find((s) => s.id === id) || null;
  },
  getSurveyBySlug(slug) {
    return read(KEYS.surveys).find((s) => s.slug === slug) || null;
  },
  isSlugTaken(slug, excludeId) {
    return read(KEYS.surveys).some((s) => s.slug === slug && s.id !== excludeId);
  },
  createSurvey({ title, slug, description }) {
    const surveys = read(KEYS.surveys);
    const finalSlug = slug ? slugify(slug) : uniqueSlug(title, (c) => this.isSlugTaken(c));
    const survey = {
      id: uid('survey'),
      title: title?.trim() || 'Untitled survey',
      slug: finalSlug || uniqueSlug('survey', (c) => this.isSlugTaken(c)),
      description: description?.trim() || '',
      order: surveys.length,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    surveys.push(survey);
    write(KEYS.surveys, surveys);
    return survey;
  },
  updateSurvey(id, patch) {
    const surveys = read(KEYS.surveys);
    const idx = surveys.findIndex((s) => s.id === id);
    if (idx === -1) return null;
    const next = { ...surveys[idx], ...patch, updatedAt: nowIso() };
    if (patch.slug) next.slug = slugify(patch.slug);
    surveys[idx] = next;
    write(KEYS.surveys, surveys);
    return next;
  },
  deleteSurvey(id) {
    write(KEYS.surveys, read(KEYS.surveys).filter((s) => s.id !== id));
    write(KEYS.questions, read(KEYS.questions).filter((q) => q.surveyId !== id));
    write(KEYS.responses, read(KEYS.responses).filter((r) => r.surveyId !== id));
  },

  // ---- Questions ----
  listQuestions(surveyId) {
    return read(KEYS.questions)
      .filter((q) => q.surveyId === surveyId)
      .sort((a, b) => a.order - b.order);
  },
  getQuestion(id) {
    return read(KEYS.questions).find((q) => q.id === id) || null;
  },
  createQuestion(surveyId, data) {
    const questions = read(KEYS.questions);
    const order = questions.filter((q) => q.surveyId === surveyId).length;
    const question = {
      id: uid('q'),
      surveyId,
      order,
      type: data.type,
      label: data.label?.trim() || 'Untitled question',
      help: data.help?.trim() || '',
      required: !!data.required,
      placeholder: data.placeholder || '',
      options: data.options || [],
      min: data.min ?? '',
      max: data.max ?? '',
      step: data.step ?? '',
      rows: data.rows || '',
      accept: data.accept || '',
      pattern: data.pattern || '',
      minLength: data.minLength ?? '',
      maxLength: data.maxLength ?? '',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    questions.push(question);
    write(KEYS.questions, questions);
    this.updateSurvey(surveyId, {});
    return question;
  },
  updateQuestion(id, patch) {
    const questions = read(KEYS.questions);
    const idx = questions.findIndex((q) => q.id === id);
    if (idx === -1) return null;
    questions[idx] = { ...questions[idx], ...patch, updatedAt: nowIso() };
    write(KEYS.questions, questions);
    return questions[idx];
  },
  deleteQuestion(id) {
    const questions = read(KEYS.questions);
    const target = questions.find((q) => q.id === id);
    if (!target) return;
    const remaining = questions.filter((q) => q.id !== id);
    const siblings = remaining.filter((q) => q.surveyId === target.surveyId).sort((a, b) => a.order - b.order);
    siblings.forEach((q, i) => { q.order = i; });
    write(KEYS.questions, remaining);
  },
  moveQuestion(id, direction) {
    const questions = read(KEYS.questions);
    const target = questions.find((q) => q.id === id);
    if (!target) return;
    const siblings = questions.filter((q) => q.surveyId === target.surveyId).sort((a, b) => a.order - b.order);
    const idx = siblings.findIndex((q) => q.id === id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= siblings.length) return;
    const a = siblings[idx];
    const b = siblings[swapIdx];
    const tmp = a.order;
    a.order = b.order;
    b.order = tmp;
    write(KEYS.questions, questions);
  },

  // ---- Responses ----
  listResponses(surveyId) {
    return read(KEYS.responses).filter((r) => r.surveyId === surveyId);
  },
  countResponses(surveyId) {
    return this.listResponses(surveyId).length;
  },
  saveResponse(surveyId, answers) {
    const responses = read(KEYS.responses);
    const response = { id: uid('resp'), surveyId, answers, submittedAt: nowIso() };
    responses.push(response);
    write(KEYS.responses, responses);
    return response;
  },

  KEYS,
};
