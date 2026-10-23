import {initApp} from '../common.js';
import {Store} from '../store.js';
import {el, icon, uid} from '../utils.js';
import {defaultOptions, renderQuestionField, typeDef, TYPES} from '../inputTypes.js';
import {confirmAction} from '../components/confirm.js';
import {toast} from '../components/toast.js';
import {createDataTable} from '../components/dataTable.js';
import {createFormValidator} from '../components/formValidation.js';

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
    document.title = `${survey.title} | Survey Pad`;
    document.getElementById('survey-title-heading').textContent = survey.title;
    const descEl = document.getElementById('survey-desc-text');
    if (survey.description) {
        descEl.textContent = survey.description;
        descEl.hidden = false;
    }
    document.getElementById('survey-slug-chip').textContent = survey.slug;
    document.getElementById('open-live-link').href = `take.html?slug=${encodeURIComponent(survey.slug)}`;

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
    const optionsFieldset = form.querySelector('[data-group="options"]');

    const GROUP_FLAGS = {
        placeholder: 'hasPlaceholder', rows: 'hasRows', minmax: 'hasMinMax',
        step: 'hasStep', accept: 'hasAccept', pattern: 'hasPattern', options: 'hasOptions',
    };

    let currentOptions = [];

    const regexFlags = (() => {
        try {
            new RegExp('', 'v');
            return 'v';
        } catch {
            return 'u';
        }
    })();

    const notBelow = (input, floorInput, floorLabel) => ({
        target: input,
        watch: [floorInput],
        validate: () => {
            if (input.value === '' || floorInput.value === '') return null;
            return Number(input.value) < Number(floorInput.value)
                ? `This can't be less than ${floorLabel} (${floorInput.value}).`
                : null;
        },
    });

    const validator = createFormValidator(form, {
        rules: [
            notBelow(maxInput, minInput, 'Min'),
            notBelow(maxLenInput, minLenInput, 'Min length'),
            {
                target: stepInput,
                validate: () => stepInput.value !== '' && Number(stepInput.value) <= 0
                    ? 'Enter a step greater than 0, or leave it empty.'
                    : null,
            },
            {
                target: patternInput,
                validate: () => {
                    const pattern = patternInput.value.trim();
                    if (!pattern) return null;
                    try {
                        new RegExp(pattern, regexFlags);
                        return null;
                    } catch (err) {
                        const reason = String(err.message).split(': ').pop();
                        return `This isn't a valid regular expression (${reason}). Fix it or leave it empty.`;
                    }
                },
            },
            {
                target: optionsFieldset,
                watch: () => [...optionsEditor.querySelectorAll('input')],
                validate: validateOptions,
            },
        ],
    });

    function validateOptions() {
        const rows = [...optionsEditor.querySelectorAll('.option-row')];
        if (!currentOptions.length) return {message: 'Add at least one option.', focus: addOptionBtn};
        const blank = currentOptions.findIndex((o) => !o.label.trim());
        if (blank !== -1) {
            return {
                message: `Option ${blank + 1} needs a label. Add one or remove the option.`,
                focus: rows[blank]?.querySelector('[data-option-field="label"]'),
            };
        }
        const seen = new Set();
        for (const [i, o] of currentOptions.entries()) {
            const value = (o.value || o.label).trim();
            if (seen.has(value)) {
                return {
                    message: `Options need different values. "${value}" is used more than once.`,
                    focus: rows[i]?.querySelector('[data-option-field="value"]'),
                };
            }
            seen.add(value);
        }
        return null;
    }

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
            const labelField = el('input', {
                type: 'text', placeholder: 'Label', value: opt.label,
                'aria-label': `Option ${i + 1} label`, dataset: {optionField: 'label'},
            });
            const valueField = el('input', {
                type: 'text', placeholder: 'Value', value: opt.value,
                'aria-label': `Option ${i + 1} value`, dataset: {optionField: 'value'},
            });
            labelField.addEventListener('input', () => {
                opt.label = labelField.value;
            });
            valueField.addEventListener('input', () => {
                opt.value = valueField.value;
            });
            const removeBtn = el('button', {
                class: 'icon-button', type: 'button', 'aria-label': `Remove option ${i + 1}`,
                onClick: () => {
                    currentOptions.splice(i, 1);
                    renderOptionsEditor();
                },
            }, icon('trash'));
            optionsEditor.append(el('div', {class: 'option-row'}, [labelField, valueField, removeBtn]));
        });
        validator.recheck();
    }

    addOptionBtn.addEventListener('click', () => {
        currentOptions.push({
            id: uid('opt'),
            label: `Option ${currentOptions.length + 1}`,
            value: `option-${currentOptions.length + 1}`
        });
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
        currentOptions = question?.options?.length ? question.options.map((o) => ({...o})) : defaultOptions();
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
        if (!validator.validate()) return;
        const def = typeDef(typeSelect.value);
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
            options: def.hasOptions ? currentOptions.filter((o) => o.label.trim()).map((o) => ({
                ...o,
                value: o.value || o.label
            })) : [],
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

    // Reordering swaps neighbors in the survey's own order, so it only makes sense
    // while the table shows that order (no sorting, search or filters).
    const showingNaturalOrder = (table) => {
        const s = table.getState();
        return !s.sorts.length && !s.filters.length && !s.quick;
    };

    function move(question, direction) {
        Store.moveQuestion(question.id, direction);
        renderRows();
    }

    const total = () => Store.listQuestions(survey.id).length;

    const table = createDataTable({
        container: '#questions-table',
        label: 'Questions',
        persistKey: 'sp:dt:questions',
        minHeight: '16rem',
        data: Store.listQuestions(survey.id),
        rowId: (q) => q.id,
        rowLabel: (q) => q.label,
        emptyMessage: 'No questions yet. Add your first question.',
        columns: [
            {
                key: 'position', label: '#', type: 'number', width: '1%', minWidth: '3rem',
                hideable: false, accessor: (q) => q.order + 1,
            },
            {key: 'label', label: 'Label', type: 'text', hideable: false, minWidth: '14rem', maxWidth: '48ch'},
            {
                key: 'type', label: 'Type', type: 'enum', minWidth: '9rem',
                options: TYPES.map((t) => ({value: t.value, label: t.label})),
            },
            {key: 'required', label: 'Required', type: 'boolean', align: 'center', width: '1%', minWidth: '6rem'},
            {key: 'help', label: 'Help text', type: 'text', hidden: true, minWidth: '12rem', maxWidth: '40ch'},
            {key: 'placeholder', label: 'Placeholder', type: 'text', hidden: true, minWidth: '10rem', maxWidth: '30ch'},
            {key: 'createdAt', label: 'Created', type: 'datetime', hidden: true, minWidth: '10rem'},
            {key: 'updatedAt', label: 'Updated', type: 'datetime', hidden: true, minWidth: '10rem'},
        ],
        rowActions: (q, table) => {
            const reorderable = showingNaturalOrder(table);
            const hint = reorderable ? undefined : 'Clear sorting, search and filters to reorder';
            return [
                {label: 'Edit', onSelect: () => openQuestionDialog(q)},
                {
                    label: 'Move up', disabled: !reorderable || q.order === 0, title: hint,
                    onSelect: () => move(q, 'up'),
                },
                {
                    label: 'Move down', disabled: !reorderable || q.order >= total() - 1, title: hint,
                    onSelect: () => move(q, 'down'),
                },
                {label: 'Delete', danger: true, separatorBefore: true, onSelect: () => removeQuestion(q)},
            ];
        },
    });

    function renderRows() {
        table.setRows(Store.listQuestions(survey.id));
    }

    const previewDialog = document.getElementById('preview-dialog');
    const previewContent = document.getElementById('preview-content');
    const previewEmpty = document.getElementById('preview-empty');
    document.getElementById('preview-btn').addEventListener('click', () => {
        const questions = Store.listQuestions(survey.id);
        previewDialog.querySelector('#preview-dialog-title').textContent = `Preview: ${survey.title}`;
        previewContent.innerHTML = '';
        const answers = {};
        if (!questions.length) {
            previewContent.hidden = true;
            previewEmpty.hidden = false;
        } else {
            previewContent.hidden = false;
            previewEmpty.hidden = true;
            questions.forEach((q) => {
                previewContent.append(renderQuestionField(q, {
                    value: answers[q.id], onChange: (v) => {
                        answers[q.id] = v;
                    }
                }));
            });
        }
        previewDialog.showModal();
    });
}