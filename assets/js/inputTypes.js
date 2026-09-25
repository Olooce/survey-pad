// Registry of every supported question type
import { el, uid } from './utils.js';

export const TYPES = [
  { value: 'text', label: 'Short text', group: 'Text', hasPlaceholder: true, hasPattern: true },
  { value: 'textarea', label: 'Long text', group: 'Text', hasPlaceholder: true, hasRows: true },
  { value: 'password', label: 'Password', group: 'Text', hasPlaceholder: true, hasPattern: true },
  { value: 'email', label: 'Email', group: 'Text', hasPlaceholder: true, hasPattern: true },
  { value: 'url', label: 'URL', group: 'Text', hasPlaceholder: true, hasPattern: true },
  { value: 'tel', label: 'Phone', group: 'Text', hasPlaceholder: true, hasPattern: true },
  { value: 'search', label: 'Search text', group: 'Text', hasPlaceholder: true },
  { value: 'number', label: 'Number', group: 'Numeric', hasMinMax: true, hasStep: true, hasPlaceholder: true },
  { value: 'range', label: 'Slider (range)', group: 'Numeric', hasMinMax: true, hasStep: true },
  { value: 'date', label: 'Date', group: 'Date & time', hasMinMax: true },
  { value: 'datetime-local', label: 'Date & time', group: 'Date & time', hasMinMax: true },
  { value: 'time', label: 'Time', group: 'Date & time', hasMinMax: true },
  { value: 'month', label: 'Month', group: 'Date & time', hasMinMax: true },
  { value: 'week', label: 'Week', group: 'Date & time', hasMinMax: true },
  { value: 'color', label: 'Color', group: 'Other' },
  { value: 'file', label: 'File upload', group: 'Other', hasAccept: true },
  { value: 'select', label: 'Dropdown (single choice)', group: 'Choice', hasOptions: true },
  { value: 'select-multiple', label: 'Dropdown (multi choice)', group: 'Choice', hasOptions: true },
  { value: 'radio', label: 'Multiple choice (radio)', group: 'Choice', hasOptions: true },
  { value: 'checkbox-group', label: 'Checkboxes (multi choice)', group: 'Choice', hasOptions: true },
  { value: 'checkbox', label: 'Single checkbox (yes/no)', group: 'Choice' },
];

export function typeDef(value) {
  return TYPES.find((t) => t.value === value) || TYPES[0];
}

export function defaultOptions() {
  return [
    { id: uid('opt'), label: 'Option 1', value: 'option-1' },
    { id: uid('opt'), label: 'Option 2', value: 'option-2' },
  ];
}

function fieldId(question) {
  return `field-${question.id}`;
}

function commonAttrs(question, extra = {}) {
  return {
    id: fieldId(question),
    name: question.id,
    required: !!question.required,
    placeholder: question.placeholder || undefined,
    ...extra,
  };
}

// Builds just the input/control element for a question. `onChange(value)` is
// called with the control's current value whenever it changes.
export function renderControl(question, value, onChange, disabled = false) {
  const def = typeDef(question.type);
  const attrs = commonAttrs(question, { disabled: disabled || undefined });

  switch (question.type) {
    case 'textarea': {
      const node = el('textarea', { ...attrs, class: 'field-control', rows: question.rows || 4 });
      node.value = value ?? '';
      node.addEventListener('input', () => onChange(node.value));
      return node;
    }
    case 'select':
    case 'select-multiple': {
      const isMulti = question.type === 'select-multiple';
      const node = el('select', { ...attrs, class: 'field-control', multiple: isMulti || undefined });
      if (!isMulti) node.append(el('option', { value: '' }, question.placeholder || 'Choose…'));
      for (const opt of question.options || []) {
        const optNode = el('option', { value: opt.value }, opt.label);
        if (isMulti ? (Array.isArray(value) && value.includes(opt.value)) : value === opt.value) {
          optNode.selected = true;
        }
        node.append(optNode);
      }
      node.addEventListener('change', () => {
        if (isMulti) onChange(Array.from(node.selectedOptions).map((o) => o.value));
        else onChange(node.value);
      });
      return node;
    }
    case 'radio': {
      const wrap = el('div', { class: 'choice-group', role: 'radiogroup' });
      (question.options || []).forEach((opt) => {
        const inputId = `${fieldId(question)}-${opt.id}`;
        const input = el('input', {
          type: 'radio', id: inputId, name: question.id, value: opt.value,
          required: !!question.required, disabled: disabled || undefined,
        });
        input.checked = value === opt.value;
        input.addEventListener('change', () => onChange(opt.value));
        wrap.append(el('label', { class: 'choice-option', for: inputId }, [input, el('span', {}, opt.label)]));
      });
      return wrap;
    }
    case 'checkbox-group': {
      const wrap = el('div', { class: 'choice-group' });
      const values = Array.isArray(value) ? value : [];
      (question.options || []).forEach((opt) => {
        const inputId = `${fieldId(question)}-${opt.id}`;
        const input = el('input', {
          type: 'checkbox', id: inputId, name: question.id, value: opt.value,
          disabled: disabled || undefined,
        });
        input.checked = values.includes(opt.value);
        input.addEventListener('change', () => {
          const next = new Set(values);
          if (input.checked) next.add(opt.value); else next.delete(opt.value);
          onChange(Array.from(next));
        });
        wrap.append(el('label', { class: 'choice-option', for: inputId }, [input, el('span', {}, opt.label)]));
      });
      return wrap;
    }
    case 'checkbox': {
      const input = el('input', { ...attrs, type: 'checkbox', class: 'field-control-checkbox' });
      input.checked = !!value;
      input.addEventListener('change', () => onChange(input.checked));
      return el('label', { class: 'choice-option choice-option--single' }, [input, el('span', {}, question.placeholder || 'Yes')]);
    }
    case 'range': {
      const min = question.min !== '' ? question.min : 0;
      const max = question.max !== '' ? question.max : 100;
      const step = question.step !== '' ? question.step : 1;
      const current = value ?? min;
      const input = el('input', { ...attrs, type: 'range', class: 'field-control-range', min, max, step });
      input.value = current;
      const out = el('output', { class: 'range-output' }, String(current));
      input.addEventListener('input', () => {
        out.textContent = input.value;
        onChange(input.value);
      });
      return el('div', { class: 'range-wrap' }, [input, out]);
    }
    case 'file': {
      const input = el('input', { ...attrs, type: 'file', class: 'field-control', accept: question.accept || undefined });
      input.addEventListener('change', () => onChange(input.files?.[0]?.name || ''));
      return input;
    }
    case 'color': {
      const input = el('input', { ...attrs, type: 'color', class: 'field-control-color' });
      input.value = value || '#4f46e5';
      input.addEventListener('input', () => onChange(input.value));
      return input;
    }
    case 'number': {
      const input = el('input', {
        ...attrs, type: 'number', class: 'field-control',
        min: question.min !== '' ? question.min : undefined,
        max: question.max !== '' ? question.max : undefined,
        step: question.step !== '' ? question.step : undefined,
      });
      input.value = value ?? '';
      input.addEventListener('input', () => onChange(input.value));
      return input;
    }
    default: {
      // text, password, email, url, tel, search, date, datetime-local, time, month, week
      const input = el('input', {
        ...attrs, type: question.type, class: 'field-control',
        min: def.hasMinMax && question.min !== '' ? question.min : undefined,
        max: def.hasMinMax && question.max !== '' ? question.max : undefined,
        pattern: def.hasPattern && question.pattern ? question.pattern : undefined,
        minlength: def.hasPattern && question.minLength !== '' ? question.minLength : undefined,
        maxlength: def.hasPattern && question.maxLength !== '' ? question.maxLength : undefined,
      });
      input.value = value ?? '';
      input.addEventListener('input', () => onChange(input.value));
      return input;
    }
  }
}


export function renderQuestionField(question, { value, onChange = () => {}, disabled = false } = {}) {
  const control = renderControl(question, value, onChange, disabled);
  const labelNode = el('label', { class: 'field-label', for: fieldId(question) }, question.label);

  const dataset = { questionId: question.id, type: question.type };
  if (question.required) dataset.required = 'true';

  return el('div', { class: 'field', dataset }, [
    labelNode,
    question.help ? el('p', { class: 'field-help' }, question.help) : null,
    control,
  ]);
}
