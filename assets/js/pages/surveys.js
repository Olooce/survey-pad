import {initApp} from '../common.js';
import {Store} from '../store.js';
import {el, slugify, uniqueSlug} from '../utils.js';
import {confirmAction} from '../components/confirm.js';
import {toast} from '../components/toast.js';
import {createDataTable} from '../components/dataTable.js';
import {createFormValidator} from '../components/formValidation.js';

initApp();

const dialog = document.getElementById('survey-dialog');
const dialogTitle = document.getElementById('survey-dialog-title');
const form = document.getElementById('survey-form');
const idInput = document.getElementById('survey-id');
const titleInput = document.getElementById('survey-title');
const slugInput = document.getElementById('survey-slug');
const descInput = document.getElementById('survey-desc');
const submitBtn = document.getElementById('survey-submit-btn');

let slugTouched = false;

const slugTaken = (slug) => Store.isSlugTaken(slug, idInput.value || undefined);

const validator = createFormValidator(form, {
    rules: [{
        target: slugInput,
        watch: [titleInput],
        validate: () => {
            const slug = slugify(slugInput.value);
            if (!slugTaken(slug)) return null;
            return `Another survey already uses "${slug}". Try "${uniqueSlug(slug, slugTaken)}" instead.`;
        },
    }],
});

function openSurveyDialog(survey) {
    form.reset();
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
});

form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validator.validate()) return;
    const slug = slugify(slugInput.value);
    const survey = idInput.value ? Store.getSurvey(idInput.value) : null;
    const data = {title: titleInput.value.trim(), slug, description: descInput.value.trim()};
    if (survey) {
        Store.updateSurvey(survey.id, data);
        toast('Survey updated.');
    } else {
        Store.createSurvey(data);
        toast('Survey created.');
    }
    dialog.close('confirm');
    reload();
});

document.getElementById('new-survey-btn').addEventListener('click', () => openSurveyDialog());

const takeUrl = (survey) =>
    `${window.location.origin}${window.location.pathname.replace(/index\.html$/, '')}take.html?slug=${survey.slug}`;

function copyLink(survey) {
    navigator.clipboard?.writeText(takeUrl(survey)).then(
        () => toast('Survey link copied.'),
        () => toast('Could not copy link.', 'danger'),
    );
}

async function removeSurvey(survey) {
    const ok = await confirmAction({
        title: 'Delete survey',
        message: `Delete "${survey.title}"? This also deletes its ${survey.questionCount} question(s) and any responses. This cannot be undone.`,
        confirmLabel: 'Delete survey',
    });
    if (!ok) return;
    Store.deleteSurvey(survey.id);
    toast('Survey deleted.');
    reload();
}

const loadRows = () => Store.listSurveys().map((s) => ({
    ...s,
    questionCount: Store.listQuestions(s.id).length,
    responseCount: Store.countResponses(s.id),
}));

const table = createDataTable({
    container: '#surveys-table',
    label: 'Surveys',
    persistKey: 'sp:dt:surveys',
    minHeight: '16rem',
    data: loadRows(),
    rowId: (s) => s.id,
    rowLabel: (s) => s.title,
    emptyMessage: 'No surveys yet. Create your first one to get started.',
    columns: [
        {
            key: 'title', label: 'Title', type: 'text', hideable: false, minWidth: '14rem', maxWidth: '40ch',
            render: (s) => el('a', {class: 'row-title', href: `survey.html?id=${encodeURIComponent(s.id)}`}, s.title),
        },
        {
            key: 'questionCount', label: 'Questions', type: 'number', minWidth: '6rem',
            numberFormat: {maximumFractionDigits: 0},
        },
        {
            key: 'responseCount', label: 'Responses', type: 'number', minWidth: '6rem',
            numberFormat: {maximumFractionDigits: 0},
        },
        {
            key: 'slug',
            label: 'Slug',
            type: 'text',
            hidden: true,
            minWidth: '10rem',
            render: (s) => el('code', {}, s.slug)
        },
        {key: 'description', label: 'Description', type: 'text', hidden: true, minWidth: '12rem', maxWidth: '40ch'},
        {key: 'createdAt', label: 'Created', type: 'datetime', hidden: true, minWidth: '10rem'},
        {key: 'updatedAt', label: 'Updated', type: 'datetime', minWidth: '10rem'},
    ],
    rowActions: (s) => [
        {label: 'Edit', onSelect: () => openSurveyDialog(s)},
        {label: 'Open survey', href: `take.html?slug=${encodeURIComponent(s.slug)}`},
        {label: 'Copy link', onSelect: () => copyLink(s)},
        {label: 'Delete', danger: true, separatorBefore: true, onSelect: () => removeSurvey(s)},
    ],
});

function reload() {
    table.setRows(loadRows());
}