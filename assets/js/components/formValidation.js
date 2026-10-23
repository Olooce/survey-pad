import {el} from '../utils.js';

const DATE_NOUNS = {
    date: 'date', 'datetime-local': 'date and time', time: 'time', month: 'month', week: 'week',
};

const TYPE_MESSAGES = {
    email: 'Enter an email address in the format name@example.com.',
    url: 'Enter a full web address, including https://.',
};

let instanceSeq = 0;

const isTextLike = (node) => node.tagName === 'TEXTAREA' ||
    (node.tagName === 'INPUT' && ['text', 'search', 'email', 'url', 'tel', 'password'].includes(node.type));

const isActive = (node) => node.isConnected && !node.disabled && !node.closest('[hidden]');

const isChoiceInput = (node) => node.type === 'radio' || node.type === 'checkbox';

function formatBound(node, raw) {
    const opts = {
        date: [`${raw}T00:00`, {dateStyle: 'medium'}],
        month: [`${raw}-01T00:00`, {month: 'long', year: 'numeric'}],
        'datetime-local': [raw, {dateStyle: 'medium', timeStyle: 'short'}],
    }[node.type];
    if (!opts) return raw;
    const d = new Date(opts[0]);
    return Number.isNaN(d.getTime()) ? raw : d.toLocaleString(undefined, opts[1]);
}

const tidy = (n) => Number(n.toFixed(10));

function requiredMessage(node, isCheckboxGroup) {
    if (node.dataset.errorRequired) return node.dataset.errorRequired;
    if (isCheckboxGroup || (node.tagName === 'SELECT' && node.multiple)) return 'Choose at least one option.';
    if (node.type === 'radio' || node.tagName === 'SELECT') return 'Choose an option.';
    if (node.type === 'checkbox') return 'Check this box to continue.';
    if (node.type === 'file') return 'Choose a file to upload.';
    if (DATE_NOUNS[node.type]) return `Enter a ${DATE_NOUNS[node.type]}.`;
    if (node.type === 'number' || node.type === 'range') return 'Enter a number.';
    return 'Enter an answer.';
}

/** Human-readable message */
function nativeMessage(node) {
    const v = node.validity;
    const value = node.value ?? '';
    // `required` accepts whitespace saved as string
    if (node.required && isTextLike(node) && !value.trim()) return requiredMessage(node);
    if (v.valueMissing) return requiredMessage(node);
    if (v.badInput) {
        if (node.type === 'number') return 'Enter a number, using digits only.';
        if (DATE_NOUNS[node.type]) return `Enter a complete ${DATE_NOUNS[node.type]}.`;
        return 'Enter a valid value.';
    }
    if (v.typeMismatch) return node.dataset.errorType || TYPE_MESSAGES[node.type] || 'Enter a valid value.';
    // tooShort/tooLong only fire for user edits, so check lengths directly
    if (isTextLike(node) && value) {
        if (node.minLength > 0 && value.length < node.minLength) {
            return `Enter at least ${node.minLength} characters. You've entered ${value.length}.`;
        }
        if (node.maxLength >= 0 && value.length > node.maxLength) {
            return `Enter ${node.maxLength} characters or fewer. You've entered ${value.length}.`;
        }
    }
    if (v.patternMismatch) return node.dataset.errorPattern || 'Enter an answer in the expected format.';
    if (v.rangeUnderflow) {
        return DATE_NOUNS[node.type]
            ? `Enter a ${DATE_NOUNS[node.type]} on or after ${formatBound(node, node.min)}.`
            : `Enter a number that is ${node.min} or more.`;
    }
    if (v.rangeOverflow) {
        return DATE_NOUNS[node.type]
            ? `Enter a ${DATE_NOUNS[node.type]} on or before ${formatBound(node, node.max)}.`
            : `Enter a number that is ${node.max} or less.`;
    }
    if (v.stepMismatch && node.type === 'number') {
        const step = Number(node.step);
        const base = node.min !== '' ? Number(node.min) : 0;
        const lower = tidy(base + Math.floor((Number(value) - base) / step) * step);
        return `Enter a number in steps of ${step}, like ${lower} or ${tidy(lower + step)}.`;
    }
    if (v.customError) return node.validationMessage;
    if (!node.checkValidity()) return 'Enter a valid value.';
    return null;
}

function focusTarget(node) {
    if (node.matches('input, select, textarea, button, [tabindex]')) return node;
    return node.querySelector('input, select, textarea, button') || node;
}

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function createFormValidator(form, {rules = []} = {}) {
    const formKey = form.id || `form-${++instanceSeq}`;
    const shown = new Map(); // key -> {message, focus, errEl, described: Element[]}
    const dirty = new Set();

    // Rebuilt on demand
    function collect() {
        const entries = [];
        const byKey = new Map();
        for (const node of form.elements) {
            if (!node.willValidate || node.type === 'hidden' || !isActive(node)) continue;
            const group = isChoiceInput(node) ? node.closest('.choice-group') : null;
            const key = group && node.name ? `name:${node.name}` : node.id || node.name;
            if (!key) continue;
            if (byKey.has(key)) {
                byKey.get(key).inputs.push(node);
                continue;
            }
            const entry = {
                key, control: node, group, inputs: [node], field: node.closest('.field'),
                rules: [], watch: () => [],
            };
            byKey.set(key, entry);
            entries.push(entry);
        }
        rules.forEach((rule, i) => {
            if (!isActive(rule.target)) return;
            let entry = entries.find((e) => e.inputs.includes(rule.target));
            if (!entry) {
                entry = {
                    key: `rule:${i}`, control: rule.target, group: null, inputs: [],
                    field: rule.target.closest('.field') || rule.target, rules: [], watch: () => [],
                };
                entries.push(entry);
            }
            entry.rules.push(rule);
            const prev = entry.watch;
            const own = typeof rule.watch === 'function' ? rule.watch : () => rule.watch || [];
            entry.watch = () => [...prev(), ...own()];
        });
        return entries;
    }

    function check(entry) {
        const {control, group, inputs} = entry;
        if (inputs.length) {
            if (group && control.type === 'checkbox') {
                if (entry.field?.dataset.required === 'true' && !inputs.some((n) => n.checked)) {
                    return {message: requiredMessage(control, true)};
                }
            } else {
                const message = nativeMessage(control);
                if (message) return {message};
            }
        }
        for (const rule of entry.rules) {
            const result = rule.validate();
            if (!result) continue;
            return typeof result === 'string' ? {message: result} : result;
        }
        return null;
    }

    // Put the error between the label/help text and the control, so it is read and seen
    // before the user reaches the input
    function placeError(entry, errEl) {
        const {field} = entry;
        const from = entry.inputs[0] || entry.control;
        if (!field) return from.before(errEl);
        let anchor = from === field ? null : from;
        while (anchor && anchor.parentElement !== field) anchor = anchor.parentElement;
        anchor ||= [...field.children].find((c) => !c.matches('legend, .field-label, .field-help, .field-error'));
        if (anchor) anchor.before(errEl); else field.append(errEl);
    }

    function setDescribed(nodes, id, on) {
        for (const n of nodes) {
            const ids = (n.getAttribute('aria-describedby') || '').split(/\s+/).filter((x) => x && x !== id);
            if (on) ids.push(id);
            if (ids.length) n.setAttribute('aria-describedby', ids.join(' '));
            else n.removeAttribute('aria-describedby');
            if (on) n.setAttribute('aria-invalid', 'true');
            else n.removeAttribute('aria-invalid');
        }
    }

    function show(entry, {message, focus}) {
        const prev = shown.get(entry.key);
        const id = `${formKey}-${entry.key.replace(/[^\w-]/g, '_')}-error`;
        let errEl = prev?.errEl;
        if (!errEl?.isConnected) {
            errEl = el('p', {class: 'field-error', id});
            placeError(entry, errEl);
        }
        errEl.replaceChildren(el('span', {class: 'visually-hidden'}, 'Error: '), message);

        const described = [...entry.inputs];
        if (!entry.inputs.length) {
            described.push(entry.control);
            if (focus && focus !== entry.control) described.push(focus);
        }
        if (prev) setDescribed(prev.described.filter((n) => !described.includes(n)), id, false);
        setDescribed(described, id, true);
        shown.set(entry.key, {
            message, focus: focus || entry.inputs.find((n) => n.checked) || entry.inputs[0] || entry.control,
            errEl, described, entry,
        });
    }

    function hide(key) {
        const state = shown.get(key);
        if (!state) return;
        setDescribed(state.described, state.errEl.id, false);
        state.errEl.remove();
        shown.delete(key);
    }

    function run(entry) {
        const result = check(entry);
        if (result) show(entry, result); else hide(entry.key);
        return result;
    }

    // Drop errors for fields that were removed or hidden (e.g. the question type changed).
    function prune(entries) {
        const live = new Set(entries.map((e) => e.key));
        for (const key of [...shown.keys()]) if (!live.has(key)) hide(key);
    }

    function focusError(state) {
        const target = state.focus.isConnected ? focusTarget(state.focus) : focusTarget(state.entry.control);
        const scrollEl = state.entry.field || target;
        scrollEl.scrollIntoView?.({block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth'});
        target.focus({preventScroll: true});
    }

    function validate() {
        const entries = collect();
        prune(entries);
        const failed = entries.filter((entry) => run(entry));
        if (!failed.length) return true;
        focusError(shown.get(failed[0].key));
        return false;
    }

    function onEdit(e) {
        const entries = collect();
        prune(entries);
        for (const entry of entries) {
            const own = entry.inputs.includes(e.target);
            if (!own && !entry.watch().includes(e.target)) continue;
            if (own) dirty.add(entry.key);
            // `change` means the user committed a value
            const committed = own && (e.type === 'change' || e.type === 'focusout');
            if (shown.has(entry.key) || (committed && dirty.has(entry.key))) run(entry);
        }
    }

    form.addEventListener('input', onEdit);
    form.addEventListener('change', onEdit);
    form.addEventListener('focusout', (e) => {
        // moving between radios of one group is not leaving the field
        if (e.relatedTarget && e.target.name && e.relatedTarget.name === e.target.name) return;
        onEdit(e);
    });

    function clear() {
        for (const key of [...shown.keys()]) hide(key);
        dirty.clear();
    }

    form.addEventListener('reset', clear);

    function recheck() {
        const entries = collect();
        prune(entries);
        entries.filter((e) => shown.has(e.key)).forEach(run);
    }

    return {validate, recheck, clear};
}
