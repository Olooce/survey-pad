/**
 * DataTable: standalone, configuration-driven table.
 *
 *
 * const table = createDataTable({
 *   container: '#host',                 // element or selector (plain <div>)
 *   label: 'Surveys',                   // accessible name (caption + aria-labels)
 *   columns: [{ key, label, type, align, ... }],
 *   data: rowsArray | async (query) => ({ rows, total }),   // function = server mode
 *   rowId: (row) => row.id,
 *   rowLabel: (row) => row.title,       // used in "Actions for ..." label
 *   rowActions: (row, table) => [{ label, onSelect(row) | href, danger, disabled, title, separatorBefore }],
 *   pageSizes: [10, 25, 50, 100], pageSize: 25,
 *   sorts: [{ field, dir: 'asc' | 'desc' }],  // initial sort (invalid config throws)
 *   persistKey: 'sp:dt:surveys',        // localStorage key for view state (optional)
 *   emptyMessage: 'Nothing here yet.',
 *   minHeight: '16rem',                 // CSS length; minimum height of the scroll region (optional)
 *   maxHeight: '70vh',                  // CSS length; maximum height of the scroll region (optional)
 *   onStateChange: (state) => {},
 * });
 * table.setRows(rows); table.refresh(); table.getState(); table.destroy();
 * table.setState(patch) -> { ok, errors }   // atomic: if anything is invalid nothing is applied and the
 *                                           // errors are shown to the user and returned
 *
 * Column: {
 *   key (required, unique), label,
 *   type: 'text' | 'number' | 'date' | 'datetime' | 'boolean' | 'enum',   (default 'text')
 *   align: 'start' | 'center' | 'end',        (default by type)
 *   accessor(row) -> raw value,               (default row[key])
 *   format(raw, row) -> string,               (overrides built-in formatting; also used for any-column search)
 *   render(row, raw) -> Node | string,        (cell content; strings are inserted as text, never HTML)
 *   options: [{value,label}] | string[],      (enum)
 *   numberFormat: Intl.NumberFormat options, dateFormat: Intl.DateTimeFormat options, locale,
 *   trueLabel, falseLabel, step (number filter inputs),
 *   operators: ['contains', ...],             (restrict the relationships offered)
 *   width, minWidth, maxWidth (CSS lengths; maxWidth truncates), wrap: true,
 *   sortable (true), filterable (true), hideable (true), hidden (false)
 * }
 */
import {el} from '../utils.js';

const TYPES = ['text', 'number', 'date', 'datetime', 'boolean', 'enum'];
let instanceSeq = 0;

const ICONS = {
    kebab: '<circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>',
    filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>',
    sort: '<path d="m3 8 4-4 4 4M7 4v16M21 16l-4 4-4-4M17 20V4"/>',
    columns: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    plus: '<path d="M5 12h14M12 5v14"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
    prev: '<path d="m15 18-6-6 6-6"/>',
    next: '<path d="m9 18 6-6-6-6"/>',
    first: '<path d="m11 17-5-5 5-5M18 17l-5-5 5-5"/>',
    last: '<path d="m6 17 5-5-5-5M13 17l5-5-5-5"/>',
    up: '<path d="m18 15-6-6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
};

const MAX_TEXT = 200;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;
const BOUNDS = {
    date: {min: '1000-01-01', max: '9999-12-31'},
    datetime: {min: '1000-01-01T00:00', max: '9999-12-31T23:59'},
};

function icon(name, size = 16) {
    return el('span', {
        class: 'dt-icon', 'aria-hidden': 'true',
        html: `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false">${ICONS[name]}</svg>`,
    });
}

const collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'});
const isBlank = (v) => v === null || v === undefined || v === '';
const pad = (n) => String(n).padStart(2, '0');
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const lc = (v) => String(v).toLowerCase();

function toDate(raw) {
    if (isBlank(raw)) return null;
    if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
    if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const [y, m, d] = raw.split('-').map(Number);
        return new Date(y, m - 1, d);
    }
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
}

/** Normalises a raw cell value into a comparable primitive for its column type (null = empty). */
function normalize(type, raw) {
    if (isBlank(raw)) return null;
    switch (type) {
        case 'number': {
            const n = Number(raw);
            return Number.isFinite(n) ? n : null;
        }
        case 'date': {
            const d = toDate(raw);
            return d ? dateKey(d) : null;
        }
        case 'datetime': {
            const d = toDate(raw);
            return d ? Math.floor(d.getTime() / 60000) * 60000 : null; // minute
        }
        case 'boolean':
            if (raw === true || raw === 'true' || raw === 1) return true;
            if (raw === false || raw === 'false' || raw === 0) return false;
            return null;
        default:
            return String(raw);
    }
}

function compareValues(a, b) {
    if (typeof a === 'number' || typeof a === 'boolean') return Number(a) - Number(b);
    return collator.compare(String(a), String(b));
}

/*  operators */

const op = (id, label, arity, test) => ({id, label, arity, test});
const EMPTY = op('empty', 'is empty', 0, (v) => v === null || v === '');
const NOT_EMPTY = op('notEmpty', 'is not empty', 0, (v) => v !== null && v !== '');

const ordered = (L) => [
    op('eq', L.eq, 1, (v, a) => v !== null && v === a),
    op('neq', L.neq, 1, (v, a) => v === null || v !== a),
    op('gt', L.gt, 1, (v, a) => v !== null && v > a),
    op('gte', L.gte, 1, (v, a) => v !== null && v >= a),
    op('lt', L.lt, 1, (v, a) => v !== null && v < a),
    op('lte', L.lte, 1, (v, a) => v !== null && v <= a),
    op('between', L.between, 2, (v, a, b) => v !== null && v >= (a < b ? a : b) && v <= (a < b ? b : a)),
    EMPTY, NOT_EMPTY,
];

const NUMBER_LABELS = {eq: '=', neq: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤', between: 'is between'};
const DATE_LABELS = {
    eq: 'is', neq: 'is not', gt: 'is after', gte: 'is on or after',
    lt: 'is before', lte: 'is on or before', between: 'is between',
};

const OPERATORS = {
    text: [
        op('contains', 'contains', 1, (v, a) => v !== null && lc(v).includes(lc(a))),
        op('notContains', 'does not contain', 1, (v, a) => v === null || !lc(v).includes(lc(a))),
        op('eq', 'equals', 1, (v, a) => v !== null && lc(v) === lc(a)),
        op('neq', 'does not equal', 1, (v, a) => v === null || lc(v) !== lc(a)),
        op('startsWith', 'starts with', 1, (v, a) => v !== null && lc(v).startsWith(lc(a))),
        op('endsWith', 'ends with', 1, (v, a) => v !== null && lc(v).endsWith(lc(a))),
        EMPTY, NOT_EMPTY,
    ],
    number: ordered(NUMBER_LABELS),
    date: ordered(DATE_LABELS),
    datetime: ordered(DATE_LABELS),
    boolean: [
        op('isTrue', 'is yes', 0, (v) => v === true),
        op('isFalse', 'is no', 0, (v) => v === false),
        EMPTY, NOT_EMPTY,
    ],
    enum: [
        op('eq', 'is', 1, (v, a) => v !== null && v === a),
        op('neq', 'is not', 1, (v, a) => v === null || v !== a),
        EMPTY, NOT_EMPTY,
    ],
};

/** Pseudo-column for the quick search: matches against the text of every text/enum column. */
const ANY = {
    key: '', label: 'Any text column', type: 'text',
    operators: ['contains', 'startsWith', 'endsWith', 'eq'], options: [],
};

function operatorsFor(col) {
    const all = OPERATORS[col.type] || OPERATORS.text;
    return col.operators ? all.filter((o) => col.operators.includes(o.id)) : all;
}

const findOp = (col, id) => {
    const ops = operatorsFor(col);
    return ops.find((o) => o.id === id) || ops[0];
};

/*  validation */

/** Text is trimmed; everything else is passed through as a string. */
const clean = (col, raw) => {
    const s = String(raw ?? '');
    return col.type === 'text' ? s.trim() : s;
};

/** Strict calendar check: rejects Feb 30 and years < 100 (which `new Date(y, m, d)` remaps to 19xx). */
function validDate(s) {
    if (!DATE_RE.test(s)) return false;
    const d = toDate(s);
    return !!d && dateKey(d) === s;
}

function validateValue(col, raw) {
    const v = clean(col, raw);
    if (v === '') return 'Enter a value.';
    switch (col.type) {
        case 'number':
            return Number.isFinite(Number(v)) ? null : 'Enter a valid number.';
        case 'date':
            return validDate(v) ? null : 'Enter a valid date.';
        case 'datetime':
            return DATETIME_RE.test(v) && validDate(v.slice(0, 10)) && !Number.isNaN(new Date(v).getTime())
                ? null : 'Enter a valid date and time.';
        case 'enum':
            return col.options.some((o) => String(o.value) === v) ? null : 'Choose one of the listed options.';
        default:
            return v.length > MAX_TEXT ? `Use at most ${MAX_TEXT} characters.` : null;
    }
}

/** Returns an error message or null. `cols` is the set of columns this condition is allowed to target. */
function validateCondition(cond, cols) {
    if (!cond || typeof cond !== 'object') return 'Invalid condition.';
    const col = cols.find((c) => c.key === cond.field);
    if (!col) return 'Choose a column.';
    const o = operatorsFor(col).find((x) => x.id === cond.op);
    if (!o) return 'Choose a valid relationship.';
    if (o.arity >= 1) {
        const err = validateValue(col, cond.value);
        if (err) return o.arity === 2 ? `From: ${err}` : err;
    }
    if (o.arity === 2) {
        const err = validateValue(col, cond.value2);
        if (err) return `To: ${err}`;
        const a = normalize(col.type, clean(col, cond.value));
        const b = normalize(col.type, clean(col, cond.value2));
        if (compareValues(a, b) > 0) return 'From must not be after To.';
    }
    return null;
}

/** Call only on validated conditions. Trims text and drops values the operator does not use. */
function sanitizeCondition(cond, cols) {
    const col = cols.find((c) => c.key === cond.field);
    const o = operatorsFor(col).find((x) => x.id === cond.op);
    return {
        field: cond.field,
        op: o.id,
        value: o.arity >= 1 ? clean(col, cond.value) : '',
        value2: o.arity === 2 ? clean(col, cond.value2) : '',
    };
}

/* builders */

function select(options, value, label, onChange) {
    const node = el('select', {'aria-label': label},
        options.map(([v, l]) => el('option', {value: v}, l)));
    node.value = value;
    node.addEventListener('change', () => onChange(node.value));
    return node;
}

function iconButton(name, label, onClick, cls = '') {
    return el('button', {
            class: `dt-icon-btn ${cls}`.trim(),
            type: 'button',
            'aria-label': label,
            title: label,
            onClick
        },
        icon(name));
}

function valueInput(col, value, onInput, label) {
    let node;
    if (col.type === 'enum') {
        node = el('select', {'aria-label': label}, [
            el('option', {value: ''}, 'Select…'),
            ...col.options.map((o) => el('option', {value: o.value}, o.label)),
        ]);
    } else {
        const type = {number: 'number', date: 'date', datetime: 'datetime-local'}[col.type] || 'text';
        node = el('input', {
            type, 'aria-label': label, autocomplete: 'off',
            step: col.type === 'number' ? (col.step ?? 'any') : undefined,
            placeholder: col.type === 'text' ? 'Value' : undefined,
            maxlength: col.type === 'text' ? MAX_TEXT : undefined,
            ...BOUNDS[col.type],
        });
    }
    node.value = value ?? '';
    node.addEventListener('input', () => onInput(node.value));
    return node;
}

function valueControls(col, opDef, cond, touch) {
    const out = [];
    if (opDef.arity >= 1) {
        out.push(valueInput(col, cond.value, (v) => {
            touch();
            cond.value = v;
        }, opDef.arity === 2 ? 'From' : 'Value'));
    }
    if (opDef.arity === 2) {
        out.push(el('span', {class: 'dt-and'}, 'and'), valueInput(col, cond.value2, (v) => {
            touch();
            cond.value2 = v;
        }, 'To'));
    }
    return out;
}

/**
 * Editable "column / relationship / value" row. Mutates `cond` in place.
 * Relationship list and value inputs are rebuilt whenever the column (and data type) changes.
 * The returned row exposes `validate()` (shows the error, returns true/false) and `hasBadInput()`.
 */
function buildCondition(cond, cols, {onRemove, onTouch, label = 'Condition'} = {}) {
    const byKey = (k) => cols.find((c) => c.key === k) || cols[0];
    const row = el('div', {class: 'dt-cond', role: 'group', 'aria-label': label});
    const opSlot = el('span', {class: 'dt-slot'});
    const valSlot = el('span', {class: 'dt-slot dt-slot--values'});
    const errId = `dt-err-${++instanceSeq}`;
    const errEl = el('p', {class: 'field-error dt-cond-error', id: errId, hidden: true});

    const setError = (message) => {
        row.classList.toggle('dt-cond--invalid', !!message);
        errEl.textContent = message || '';
        errEl.hidden = !message;
        valSlot.querySelectorAll('input, select').forEach((n) => {
            if (message) {
                n.setAttribute('aria-invalid', 'true');
                n.setAttribute('aria-describedby', errId);
            } else {
                n.removeAttribute('aria-invalid');
                n.removeAttribute('aria-describedby');
            }
        });
    };
    const touch = () => {
        setError(null);
        onTouch?.();
    };

    // number/date inputs report unparseable text as value === '' + validity.badInput
    row.hasBadInput = () => [...valSlot.querySelectorAll('input')].some((n) => n.validity.badInput);
    row.validate = () => {
        const col = byKey(cond.field);
        const message = row.hasBadInput()
            ? `Enter a valid ${col.type === 'number' ? 'number' : 'date or time'}.`
            : validateCondition(cond, cols);
        setError(message);
        return !message;
    };

    const drawValues = () => {
        const col = byKey(cond.field);
        const opDef = findOp(col, cond.op);
        if (opDef.arity < 2) cond.value2 = '';
        if (opDef.arity < 1) cond.value = '';
        valSlot.replaceChildren(...valueControls(col, opDef, cond, touch));
    };
    const drawOps = () => {
        const ops = operatorsFor(byKey(cond.field));
        if (!ops.some((o) => o.id === cond.op)) cond.op = ops[0].id;
        opSlot.replaceChildren(select(ops.map((o) => [o.id, o.label]), cond.op, 'Relationship', (v) => {
            touch();
            cond.op = v;
            drawValues();
        }));
    };
    const colSelect = select(cols.map((c) => [c.key, c.label]), cond.field, 'Column', (v) => {
        touch();
        cond.field = v;
        cond.value = '';
        cond.value2 = '';
        drawOps();
        drawValues();
    });

    row.append(colSelect, opSlot, valSlot);
    if (onRemove) row.append(iconButton('trash', `Remove ${label.toLowerCase()}`, onRemove, 'dt-icon-btn--danger'));
    row.append(errEl);
    drawOps();
    drawValues();
    return row;
}

/*  dialog */

function openDialog(host, {title, body, applyLabel = 'Apply', resetLabel, onReset, onApply, size = 'md'}) {
    const titleId = `dt-dlg-${++instanceSeq}`;
    const dialog = el('dialog', {class: `dialog dialog--${size} dt-dialog`, 'aria-labelledby': titleId});
    const form = el('form', {method: 'dialog', novalidate: true});

    const actions = el('div', {class: 'dialog-actions'}, [
        resetLabel ? el('button', {
            class: 'btn btn--ghost btn--sm dt-reset',
            type: 'button',
            onClick: onReset
        }, resetLabel) : null,
        el('button', {class: 'btn btn--ghost', type: 'button', onClick: () => dialog.close('cancel')}, 'Cancel'),
        el('button', {class: 'btn btn--primary', type: 'submit'}, applyLabel),
    ]);

    form.append(
        el('div', {class: 'dialog-header'}, [
            el('h2', {class: 'dialog-title', id: titleId}, title),
            iconButton('x', 'Close', () => dialog.close('cancel')),
        ]),
        el('div', {class: 'dialog-body'}, [body, actions]),
    );
    dialog.append(form);

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (onApply() === false) return;
        dialog.close('apply');
    });
    dialog.addEventListener('close', () => dialog.remove());
    host.append(dialog);
    dialog.showModal();
    return dialog;
}

/* component */

export function createDataTable(options) {
    const opts = {
        pageSizes: [10, 25, 50, 100], pageSize: 25, emptyMessage: 'No records to display.',
        rowId: (r) => r.id, ...options,
    };
    const host = typeof opts.container === 'string' ? document.querySelector(opts.container) : opts.container;
    if (!host) throw new Error('createDataTable: container not found');

    if (opts.data != null && !Array.isArray(opts.data) && typeof opts.data !== 'function') {
        throw new Error('createDataTable: data must be an array or a function');
    }
    if (!Array.isArray(opts.pageSizes) || !opts.pageSizes.length
        || !opts.pageSizes.every((n) => Number.isInteger(n) && n > 0)) {
        throw new Error('createDataTable: pageSizes must be a non-empty array of positive integers');
    }

    /*  columns  */
    const columns = (opts.columns || []).map((c) => {
        if (!c.key) throw new Error('createDataTable: every column needs a key');
        if (c.type !== undefined && !TYPES.includes(c.type)) {
            throw new Error(`createDataTable: column "${c.key}" has unknown type "${c.type}"`);
        }
        const type = c.type || 'text';
        if (c.operators) {
            const known = OPERATORS[type].map((o) => o.id);
            if (!c.operators.length || c.operators.some((id) => !known.includes(id))) {
                throw new Error(`createDataTable: column "${c.key}" has invalid operators for type "${type}"`);
            }
        }
        if (type === 'enum' && c.filterable !== false && !c.options?.length) {
            throw new Error(`createDataTable: enum column "${c.key}" needs options`);
        }
        return {
            sortable: true, filterable: true, hideable: true, hidden: false, label: c.key,
            accessor: (row) => row[c.key],
            ...c,
            type,
            align: c.align || (type === 'number' ? 'end' : type === 'boolean' ? 'center' : 'start'),
            options: (c.options || []).map((o) => (typeof o === 'object' ? o : {value: o, label: String(o)})),
        };
    });
    if (!columns.length) throw new Error('createDataTable: at least one column is required');

    const uid = `dt${++instanceSeq}`;
    const serverMode = typeof opts.data === 'function';
    const label = opts.label || 'Data table';

    const colMap = new Map(columns.map((c) => [c.key, c]));
    if (colMap.size !== columns.length) throw new Error('createDataTable: duplicate column keys');
    const filterCols = columns.filter((c) => c.filterable);
    const searchCols = filterCols.filter((c) => c.type === 'text' || c.type === 'enum');
    const quickCols = searchCols.length ? [ANY, ...filterCols] : filterCols;
    const sortCols = columns.filter((c) => c.sortable);
    const hasActions = typeof opts.rowActions === 'function';

    /*  formatting  */
    function displayText(col, raw, row) {
        if (col.format) return String(col.format(raw, row) ?? '');
        if (isBlank(raw)) return '';
        switch (col.type) {
            case 'number':
                return (col._nf ??= new Intl.NumberFormat(col.locale, col.numberFormat)).format(Number(raw));
            case 'date': {
                const d = toDate(raw);
                return d ? d.toLocaleDateString(col.locale, col.dateFormat || {
                    year: 'numeric', month: 'short', day: 'numeric',
                }) : String(raw);
            }
            case 'datetime': {
                const d = toDate(raw);
                return d ? d.toLocaleString(col.locale, col.dateFormat || {
                    dateStyle: 'medium', timeStyle: 'short',
                }) : String(raw);
            }
            case 'boolean':
                return raw === true || raw === 'true' || raw === 1 ? (col.trueLabel || 'Yes') : (col.falseLabel || 'No');
            case 'enum':
                return col.options.find((o) => String(o.value) === String(raw))?.label ?? String(raw);
            default:
                return String(raw);
        }
    }

    /*  validators (return a list of messages; empty = valid)  */
    function validateSorts(list) {
        if (!Array.isArray(list)) return ['Sorts must be a list.'];
        const errors = [];
        const seen = new Set();
        list.forEach((s, i) => {
            const col = colMap.get(s?.field);
            if (!col) errors.push(`Sort ${i + 1}: unknown column "${s?.field}".`);
            else if (!col.sortable) errors.push(`Sort ${i + 1}: "${col.label}" cannot be sorted.`);
            else if (s.dir !== 'asc' && s.dir !== 'desc') errors.push(`Sort ${i + 1}: order must be "asc" or "desc".`);
            else if (seen.has(s.field)) errors.push(`Sort ${i + 1}: "${col.label}" is used more than once.`);
            else seen.add(s.field);
        });
        return errors;
    }

    function validateHidden(keys) {
        if (!Array.isArray(keys)) return ['Hidden columns must be a list.'];
        const errors = [];
        keys.forEach((k) => {
            const col = colMap.get(k);
            if (!col) errors.push(`Unknown column "${k}".`);
            else if (!col.hideable) errors.push(`"${col.label}" cannot be hidden.`);
        });
        if (!errors.length && columns.every((c) => keys.includes(c.key))) {
            errors.push('At least one column must stay visible.');
        }
        return errors;
    }

    function validateFilters(list) {
        if (!Array.isArray(list)) return ['Filters must be a list.'];
        return list.flatMap((f, i) => {
            const err = validateCondition(f, filterCols);
            return err ? [`Filter ${i + 1}: ${err}`] : [];
        });
    }

    const sortErrors = validateSorts(opts.sorts || []);
    if (sortErrors.length) throw new Error(`createDataTable: invalid sorts: ${sortErrors.join(' ')}`);

    /*  state  */
    const state = {
        page: 1,
        pageSize: opts.pageSizes.includes(opts.pageSize) ? opts.pageSize : opts.pageSizes[0],
        sorts: (opts.sorts || []).map(({field, dir}) => ({field, dir})),
        filters: [],
        match: 'all',
        quick: null,
        hidden: new Set(columns.filter((c) => c.hidden).map((c) => c.key)),
    };
    const view = {rows: [], total: 0, loading: false, error: null};
    let source = Array.isArray(opts.data) ? opts.data : [];
    let quickDraft = freshQuick();
    let quickRow = null;
    let abortCtl = null;
    let reqSeq = 0;

    function newCondition(col) {
        return {field: col.key, op: operatorsFor(col)[0].id, value: '', value2: ''};
    }

    function freshQuick() {
        return quickCols.length ? newCondition(quickCols[0]) : null;
    }

    // quickCols is a superset of filterCols; call only after validation
    const cleanCondition = (cond) => sanitizeCondition(cond, quickCols);

    function restore() {
        if (!opts.persistKey) return;
        let saved;
        try {
            saved = JSON.parse(localStorage.getItem(opts.persistKey));
        } catch {
            showNotice('Saved view settings could not be read and were ignored.', []);
            return;
        }
        if (saved == null) return;
        if (typeof saved !== 'object') {
            showNotice('Saved view settings are malformed and were ignored.', []);
            return;
        }

        const errors = [];
        if ('pageSize' in saved) {
            if (opts.pageSizes.includes(saved.pageSize)) state.pageSize = saved.pageSize;
            else errors.push(`Page size ${saved.pageSize} is no longer available.`);
        }
        if ('sorts' in saved) {
            const e = validateSorts(saved.sorts);
            if (e.length) errors.push(...e);
            else state.sorts = saved.sorts.map(({field, dir}) => ({field, dir}));
        }
        if ('filters' in saved) {
            if (!Array.isArray(saved.filters)) {
                errors.push('Filters must be a list.');
            } else {
                saved.filters.forEach((f, i) => {
                    const err = validateCondition(f, filterCols);
                    if (err) errors.push(`Filter ${i + 1}: ${err}`);
                    else state.filters.push(cleanCondition(f));
                });
            }
        }
        if ('match' in saved) {
            if (saved.match === 'any' || saved.match === 'all') state.match = saved.match;
            else errors.push('Filter matching mode was invalid.');
        }
        if ('hidden' in saved) {
            const e = validateHidden(saved.hidden);
            if (e.length) errors.push(...e);
            else state.hidden = new Set(saved.hidden);
        }
        if (errors.length) showNotice('Some saved view settings were invalid and were not restored:', errors);
    }

    function persist() {
        if (!opts.persistKey) return;
        try {
            localStorage.setItem(opts.persistKey, JSON.stringify({
                pageSize: state.pageSize, sorts: state.sorts, filters: state.filters,
                match: state.match, hidden: [...state.hidden],
            }));
        } catch { /* storage unavailable: view state  won't persist */
        }
    }

    const snapshot = () => ({
        page: state.page, pageSize: state.pageSize, total: view.total,
        sorts: state.sorts.map((s) => ({...s})),
        filters: state.filters.map(cleanCondition),
        match: state.match,
        quick: state.quick ? cleanCondition(state.quick) : null,
        hidden: [...state.hidden],
    });

    const visibleCols = () => columns.filter((c) => !state.hidden.has(c.key));

    /*  data pipeline  */
    function testFor(cond) {
        if (cond.field === '') {
            const o = findOp(ANY, cond.op);
            const a = String(cond.value);
            return (row) => searchCols.some((col) => {
                const text = displayText(col, col.accessor(row), row);
                return o.test(text === '' ? null : text, a);
            });
        }
        const col = colMap.get(cond.field);
        const o = findOp(col, cond.op);
        const norm = (s) => {
            if (isBlank(s)) return null;
            return col.type === 'number' ? Number(s) : col.type === 'date' ? String(s) : normalize(col.type, s);
        };
        const a = norm(cond.value);
        const b = norm(cond.value2);
        return (row) => o.test(normalize(col.type, col.accessor(row)), a, b);
    }

    function sortKey(col, row) {
        const raw = col.accessor(row);
        return col.type === 'enum' ? (isBlank(raw) ? null : displayText(col, raw, row)) : normalize(col.type, raw);
    }

    function computeClient() {
        const quickTest = state.quick ? testFor(state.quick) : null;
        const tests = state.filters.map(testFor);
        const any = state.match === 'any';
        const filtered = source.filter((row) => {
            if (quickTest && !quickTest(row)) return false;
            if (!tests.length) return true;
            return any ? tests.some((t) => t(row)) : tests.every((t) => t(row));
        });
        view.total = filtered.length;
        clampPage();

        let ordered = filtered;
        if (state.sorts.length) {
            const specs = state.sorts.map((s) => ({col: colMap.get(s.field), dir: s.dir === 'desc' ? -1 : 1}));
            const keyed = filtered.map((row) => ({row, keys: specs.map((s) => sortKey(s.col, row))}));
            keyed.sort((x, y) => {
                for (let i = 0; i < specs.length; i += 1) {
                    const a = x.keys[i];
                    const b = y.keys[i];
                    if (a === b) continue;
                    if (a === null) return 1; // empty values always last
                    if (b === null) return -1;
                    const c = compareValues(a, b);
                    if (c) return c * specs[i].dir;
                }
                return 0;
            });
            ordered = keyed.map((k) => k.row);
        }
        const start = (state.page - 1) * state.pageSize;
        view.rows = ordered.slice(start, start + state.pageSize);
        view.error = null;
    }

    async function fetchServer() {
        abortCtl?.abort();
        abortCtl = new AbortController();
        const mine = ++reqSeq;
        view.loading = true;
        renderBusy();
        try {
            const res = await opts.data({
                page: state.page, pageSize: state.pageSize,
                sorts: state.sorts.map((s) => ({...s})),
                filters: state.filters.map(cleanCondition), match: state.match,
                quick: state.quick ? cleanCondition(state.quick) : null,
                signal: abortCtl.signal,
            });
            if (mine !== reqSeq) return false;
            if (!res || !Array.isArray(res.rows) || !Number.isFinite(res.total) || res.total < 0) {
                throw new Error('Invalid response from data source');
            }
            view.rows = res.rows;
            view.total = res.total;
            view.error = null;
            clampPage();
        } catch (err) {
            if (err?.name === 'AbortError' || mine !== reqSeq) return false;
            view.rows = [];
            view.error = err;
        }
        view.loading = false;
        return true;
    }

    function clampPage() {
        const pages = Math.max(1, Math.ceil(view.total / state.pageSize));
        state.page = Math.min(Math.max(1, state.page), pages);
    }

    const totalPages = () => Math.max(1, Math.ceil(view.total / state.pageSize));

    async function update() {
        if (serverMode) {
            if (await fetchServer() === false) return;
        } else {
            computeClient();
        }
        render();
    }

    function commit() {
        hideNotice();
        persist();
        update();
        opts.onStateChange?.(snapshot());
    }

    /*  DOM skeleton  */
    const root = el('section', {class: 'dt', id: uid, 'aria-label': label});

    const quickForm = el('form', {
        class: 'dt-search',
        role: 'search',
        novalidate: true,
        'aria-label': `Search ${label}`
    });
    const quickSlot = el('div', {class: 'dt-search-fields'});
    const quickSubmit = el('button', {class: 'btn btn--primary btn--sm', type: 'submit'}, [icon('search'), 'Search']);
    quickForm.append(quickSlot, quickSubmit);

    const toolButtons = {};
    const tool = (id, text, iconName, onClick) => {
        const badge = el('span', {class: 'dt-badge', hidden: true});
        const btn = el('button', {
            class: 'btn btn--ghost btn--sm',
            type: 'button',
            onClick
        }, [icon(iconName), text, badge]);
        toolButtons[id] = {btn, badge};
        return btn;
    };
    const tools = el('div', {class: 'dt-tools'}, [
        tool('filters', 'Filters', 'filter', openFilters),
        tool('sorting', 'Sorting', 'sort', openSorting),
        tool('columns', 'Columns', 'columns', openColumns),
    ]);

    const toolbar = el('div', {class: 'dt-toolbar'}, [quickForm, tools]);
    const notice = el('div', {class: 'dt-notice', role: 'alert', hidden: true});
    const chips = el('ul', {class: 'dt-chips', 'aria-label': 'Active filters and sorting', hidden: true});

    function showNotice(title, errors) {
        notice.replaceChildren(
            el('div', {class: 'dt-notice__body'}, [
                el('strong', {}, title),
                errors.length ? el('ul', {}, errors.map((m) => el('li', {}, m))) : null,
            ]),
            iconButton('x', 'Dismiss', hideNotice),
        );
        notice.hidden = false;
    }

    function hideNotice() {
        notice.hidden = true;
        notice.replaceChildren();
    }

    const thead = el('thead');
    const tbody = el('tbody');
    const table = el('table', {class: 'dt-table'}, [el('caption', {class: 'dt-sr'}, label), thead, tbody]);
    const scroll = el('div', {
        class: 'dt-scroll',
        role: 'region',
        tabindex: '0',
        'aria-label': `${label} table`
    }, table);
    if (opts.maxHeight) scroll.style.setProperty('--dt-max-height', opts.maxHeight);
    if (opts.minHeight) scroll.style.setProperty('--dt-min-height', opts.minHeight);

    // footer
    const sizeSelect = select(opts.pageSizes.map((n) => [String(n), String(n)]), String(state.pageSize), 'Rows per page', (v) => {
        state.pageSize = Number(v);
        state.page = 1;
        commit();
    });
    const rangeText = el('span', {class: 'dt-range', 'aria-live': 'polite'});
    const pageInput = el('input', {
        class: 'dt-page-input',
        type: 'number',
        min: '1',
        step: '1',
        'aria-label': 'Page number',
        inputmode: 'numeric'
    });
    const pageTotal = el('span', {class: 'dt-page-total'});

    const pageErrId = `${uid}-page-err`;
    const pageError = el('p', {class: 'field-error dt-page-error', id: pageErrId, role: 'alert', hidden: true});
    const setPageError = (msg) => {
        pageError.textContent = msg || '';
        pageError.hidden = !msg;
        if (msg) {
            pageInput.setAttribute('aria-invalid', 'true');
            pageInput.setAttribute('aria-describedby', pageErrId);
        } else {
            pageInput.removeAttribute('aria-invalid');
            pageInput.removeAttribute('aria-describedby');
        }
    };

    const goTo = (p) => {
        const next = Math.min(Math.max(1, Math.trunc(p) || 1), totalPages());
        if (next === state.page) {
            pageInput.value = state.page;
            return;
        }
        state.page = next;
        commit();
    };
    pageInput.addEventListener('input', () => setPageError(null));
    pageInput.addEventListener('change', () => {
        const raw = pageInput.value.trim();
        const n = Number(raw);
        const pages = totalPages();
        if (pageInput.validity.badInput) return setPageError('Page must be a whole number.');
        if (raw === '') return setPageError('Enter a page number.');
        if (!Number.isInteger(n)) return setPageError('Page must be a whole number.');
        if (n < 1 || n > pages) return setPageError(`Page must be between 1 and ${pages}.`);
        setPageError(null);
        goTo(n);
    });
    const pagerBtn = (name, text, onClick) => iconButton(name, text, onClick);
    const btnFirst = pagerBtn('first', 'First page', () => goTo(1));
    const btnPrev = pagerBtn('prev', 'Previous page', () => goTo(state.page - 1));
    const btnNext = pagerBtn('next', 'Next page', () => goTo(state.page + 1));
    const btnLast = pagerBtn('last', 'Last page', () => goTo(totalPages()));
    const pager = el('nav', {class: 'dt-pager', 'aria-label': `${label} pagination`}, [
        btnFirst, btnPrev,
        el('label', {class: 'dt-page-label'}, ['Page', pageInput, pageTotal]),
        btnNext, btnLast,
    ]);
    const footer = el('div', {class: 'dt-footer'}, [
        el('label', {class: 'dt-size'}, ['Rows per page', sizeSelect]),
        rangeText, pager, pageError,
    ]);

    // shared row-action menu
    const menu = el('div', {class: 'dt-menu', role: 'menu', popover: 'auto', 'aria-label': 'Row actions'});
    let menuOpener = null;
    let menuClosedAt = 0;
    let menuClosedFor = null;

    root.append(toolbar, notice, chips, scroll, footer, menu);
    host.replaceChildren(root);

    /*  quick search  */
    function drawQuick() {
        quickForm.hidden = !quickDraft;
        if (!quickDraft) return;
        quickRow = buildCondition(quickDraft, quickCols, {label: 'Search'});
        quickSlot.replaceChildren(quickRow);
    }

    quickForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!quickRow.validate()) {
            quickRow.querySelector('.dt-slot--values :is(input, select)')?.focus();
            return;
        }
        state.quick = cleanCondition(quickDraft);
        state.page = 1;
        commit();
    });

    /*  header / body  */
    function renderHead() {
        const cells = visibleCols().map((col) => {
            const idx = state.sorts.findIndex((s) => s.field === col.key);
            const dir = idx >= 0 ? state.sorts[idx].dir : null;
            const th = el('th', {
                scope: 'col', 'data-align': col.align,
                'aria-sort': dir ? (dir === 'asc' ? 'ascending' : 'descending') : undefined,
                style: [
                    col.width && `width:${col.width}`,
                    col.minWidth && `min-width:${col.minWidth}`,
                    col.maxWidth && `max-width:${col.maxWidth}`,
                ].filter(Boolean).join(';') || undefined,
            });
            if (!col.sortable) {
                th.append(col.label);
            } else {
                const btn = el('button', {
                    class: 'dt-sort', type: 'button',
                    title: `Sort by ${col.label} (Shift+click adds a secondary sort)`,
                    onClick: (e) => toggleSort(col.key, e.shiftKey),
                }, [
                    el('span', {}, col.label),
                    el('span', {class: 'dt-carets', 'aria-hidden': 'true'}, [
                        el('span', {class: 'dt-caret dt-caret--up'}, icon('up', 10)),
                        el('span', {class: 'dt-caret dt-caret--down'}, icon('down', 10)),
                    ]),
                    state.sorts.length > 1 && idx >= 0 ? el('sup', {class: 'dt-sort-rank'}, String(idx + 1)) : null,
                ]);
                th.append(btn);
            }
            return th;
        });
        if (hasActions) {
            cells.push(el('th', {scope: 'col', class: 'dt-col-actions'}, el('span', {class: 'dt-sr'}, 'Actions')));
        }
        thead.replaceChildren(el('tr', {}, cells));
    }

    function toggleSort(field, additive) {
        const idx = state.sorts.findIndex((s) => s.field === field);
        const cur = idx >= 0 ? state.sorts[idx].dir : null;
        const next = cur === null ? 'asc' : cur === 'asc' ? 'desc' : null;
        if (!additive) {
            state.sorts = next ? [{field, dir: next}] : [];
        } else if (idx >= 0) {
            if (next) state.sorts[idx].dir = next;
            else state.sorts.splice(idx, 1);
        } else {
            state.sorts.push({field, dir: 'asc'});
        }
        state.page = 1;
        commit();
    }

    function cellContent(col, row) {
        const raw = col.accessor(row);
        if (col.render) return col.render(row, raw);
        const text = displayText(col, raw, row);
        return text === '' ? el('span', {class: 'dt-null', 'aria-label': 'empty'}, '–') : text;
    }

    function renderBody() {
        const cols = visibleCols();
        const span = cols.length + (hasActions ? 1 : 0);
        tbody.replaceChildren();

        if (view.error) {
            tbody.append(el('tr', {}, el('td', {class: 'dt-state', colspan: span}, [
                el('p', {role: 'alert'}, `Could not load data${view.error.message ? `: ${view.error.message}` : '.'}`),
                el('button', {class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => update()}, 'Retry'),
            ])));
            return;
        }
        if (!view.rows.length) {
            const filtered = state.quick || state.filters.length;
            tbody.append(el('tr', {}, el('td', {class: 'dt-state', colspan: span}, [
                el('p', {}, filtered ? 'No records match the current search and filters.' : opts.emptyMessage),
                filtered ? el('button', {
                    class: 'btn btn--ghost btn--sm',
                    type: 'button',
                    onClick: clearAll
                }, 'Clear search and filters') : null,
            ])));
            return;
        }

        const rows = view.rows.map((row) => {
            const cells = cols.map((col) => {
                const td = el('td', {'data-align': col.align, 'data-label': col.label}, cellContent(col, row));
                if (col.wrap) td.classList.add('dt-wrap');
                if (col.minWidth) td.style.minWidth = col.minWidth;
                if (col.maxWidth) {
                    td.classList.add('dt-clip');
                    td.style.maxWidth = col.maxWidth;
                    td.title = td.textContent;
                }
                return td;
            });
            if (hasActions) {
                const actions = opts.rowActions(row, api) || [];
                const name = opts.rowLabel ? opts.rowLabel(row) : displayText(cols[0], cols[0].accessor(row), row);
                const td = el('td', {class: 'dt-col-actions'});
                if (actions.length) {
                    const btn = el('button', {
                        class: 'dt-icon-btn dt-kebab', type: 'button',
                        'aria-label': `Actions for ${name}`, 'aria-haspopup': 'menu', 'aria-expanded': 'false',
                    }, icon('kebab'));
                    btn._row = row;
                    td.append(btn);
                }
                cells.push(td);
            }
            return el('tr', {'data-row-id': String(opts.rowId(row))}, cells);
        });
        tbody.append(...rows);
    }

    function renderBusy() {
        scroll.setAttribute('aria-busy', String(view.loading));
        root.classList.toggle('dt--loading', view.loading);
    }

    /*  chips  */
    function describe(cond) {
        const col = cond.field === '' ? ANY : colMap.get(cond.field);
        const o = findOp(col, cond.op);
        const fmt = (v) => (col.type === 'text' || col === ANY ? `“${v}”` : displayText(col, v, null));
        let text = `${col.label} ${o.label}`;
        if (o.arity >= 1) text += ` ${fmt(cond.value)}`;
        if (o.arity === 2) text += ` and ${fmt(cond.value2)}`;
        return text;
    }

    function renderChips() {
        const items = [];
        const chip = (text, removeLabel, onRemove, cls = '') => el('li', {class: `dt-chip ${cls}`.trim()}, [
            el('span', {}, text),
            iconButton('x', removeLabel, onRemove),
        ]);
        if (state.quick) {
            items.push(chip(`Search: ${describe(state.quick)}`, 'Remove search', () => {
                state.quick = null;
                quickDraft = freshQuick();
                drawQuick();
                state.page = 1;
                commit();
            }));
        }
        if (state.filters.length > 1) {
            items.push(el('li', {class: 'dt-chip dt-chip--note'}, `Matching ${state.match === 'any' ? 'any' : 'all'} filters`));
        }
        state.filters.forEach((f, i) => {
            items.push(chip(describe(f), `Remove filter ${describe(f)}`, () => {
                state.filters.splice(i, 1);
                state.page = 1;
                commit();
            }));
        });
        state.sorts.forEach((s, i) => {
            const col = colMap.get(s.field);
            items.push(chip(`Sort: ${col.label} ${s.dir === 'asc' ? '↑' : '↓'}${state.sorts.length > 1 ? ` (${i + 1})` : ''}`,
                `Remove sort by ${col.label}`, () => {
                    state.sorts.splice(i, 1);
                    state.page = 1;
                    commit();
                }, 'dt-chip--sort'));
        });
        if (items.length) {
            items.push(el('li', {}, el('button', {
                class: 'btn btn--ghost btn--sm',
                type: 'button',
                onClick: clearAll
            }, 'Clear all')));
        }
        chips.replaceChildren(...items);
        chips.hidden = !items.length;
    }

    function clearAll() {
        state.quick = null;
        state.filters = [];
        state.sorts = [];
        quickDraft = freshQuick();
        drawQuick();
        state.page = 1;
        commit();
    }

    /*  footer + toolbar badges  */
    function renderFooter() {
        setPageError(null);
        const {total} = view;
        const start = total ? (state.page - 1) * state.pageSize + 1 : 0;
        const end = Math.min(state.page * state.pageSize, total);
        rangeText.textContent = total ? `${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()}` : 'No results';
        const pages = totalPages();
        pageInput.value = state.page;
        pageInput.max = String(pages);
        pageInput.disabled = pages === 1;
        pageTotal.textContent = `of ${pages.toLocaleString()}`;
        btnFirst.disabled = btnPrev.disabled = state.page <= 1;
        btnNext.disabled = btnLast.disabled = state.page >= pages;
        sizeSelect.value = String(state.pageSize);
    }

    function renderBadges() {
        const set = (id, n, what) => {
            toolButtons[id].badge.replaceChildren(String(n), el('span', {class: 'dt-sr'}, ` ${what}`));
            toolButtons[id].badge.hidden = !n;
        };
        set('filters', state.filters.length, 'active filters');
        set('sorting', state.sorts.length, 'active sorts');
        set('columns', state.hidden.size, 'hidden columns');
        toolButtons.filters.btn.disabled = !filterCols.length;
        toolButtons.sorting.btn.disabled = !sortCols.length;
        toolButtons.columns.btn.disabled = !columns.some((c) => c.hideable);
    }

    function render() {
        renderBusy();
        renderHead();
        renderBody();
        renderChips();
        renderFooter();
        renderBadges();
    }

    /*  panels  */
    function openFilters() {
        const draft = state.filters.map((f) => ({...f}));
        let match = state.match;
        const list = el('div', {class: 'dt-conds'});
        const error = el('p', {class: 'field-error', role: 'alert', hidden: true});
        const matchRow = el('label', {class: 'dt-match'}, [
            'Show records matching',
            select([['all', 'all filters'], ['any', 'any filter']], match, 'Combine filters', (v) => {
                match = v;
            }),
        ]);
        const empty = el('p', {class: 'dt-hint'}, 'No filters yet.');

        const draw = () => {
            list.replaceChildren(...draft.map((c, i) => buildCondition(c, filterCols, {
                label: `Filter ${i + 1}`,
                onTouch: () => {
                    error.hidden = true;
                },
                onRemove: () => {
                    draft.splice(i, 1);
                    draw();
                },
            })));
            matchRow.hidden = draft.length < 2;
            empty.hidden = draft.length > 0;
            error.hidden = true;
        };
        const add = () => {
            draft.push(newCondition(filterCols[0]));
            draw();
            list.lastElementChild?.querySelector('select')?.focus();
        };
        draw();

        const body = el('div', {class: 'dt-panel'}, [
            matchRow, list, empty,
            el('button', {class: 'btn btn--ghost btn--sm', type: 'button', onClick: add}, [icon('plus'), 'Add filter']),
            error,
        ]);

        openDialog(root, {
            title: 'Filters', size: 'lg', body, resetLabel: 'Clear filters',
            onReset: () => {
                draft.length = 0;
                draw();
            },
            onApply: () => {
                const rows = [...list.children];
                const results = rows.map((r) => r.validate()); // validate all, so every error shows at once
                const bad = results.filter((ok) => !ok).length;
                if (bad) {
                    error.textContent = bad === 1 ? 'Fix the highlighted filter.' : `Fix the ${bad} highlighted filters.`;
                    error.hidden = false;
                    rows[results.indexOf(false)].querySelector('.dt-slot--values :is(input, select)')?.focus();
                    return false;
                }
                state.filters = draft.map(cleanCondition);
                state.match = match;
                state.page = 1;
                commit();
            },
        });
    }

    const ORDER_LABELS = {
        text: ['A → Z', 'Z → A'], number: ['Lowest first', 'Highest first'],
        date: ['Oldest first', 'Newest first'], datetime: ['Oldest first', 'Newest first'],
        boolean: ['No first', 'Yes first'], enum: ['A → Z', 'Z → A'],
    };

    function openSorting() {
        const draft = state.sorts.map((s) => ({...s}));
        const list = el('div', {class: 'dt-conds'});
        const empty = el('p', {class: 'dt-hint'}, 'No sorting applied. Records appear in their original order.');

        const draw = () => {
            list.replaceChildren(...draft.map((s, i) => {
                const used = new Set(draft.filter((_, j) => j !== i).map((d) => d.field));
                const avail = sortCols.filter((c) => !used.has(c.key));
                const orderSlot = el('span', {class: 'dt-slot'});
                const drawOrder = () => {
                    const [asc, desc] = ORDER_LABELS[colMap.get(s.field).type];
                    orderSlot.replaceChildren(select([['asc', asc], ['desc', desc]], s.dir, 'Order', (v) => {
                        s.dir = v;
                    }));
                };
                const colSel = select(avail.map((c) => [c.key, c.label]), s.field, 'Column', (v) => {
                    s.field = v;
                    drawOrder();
                    draw();
                });
                drawOrder();
                return el('div', {
                    class: 'dt-cond dt-cond--sort',
                    role: 'group',
                    'aria-label': i === 0 ? 'Primary sort' : `Then by ${i}`
                }, [
                    el('span', {class: 'dt-rank'}, i === 0 ? 'Sort by' : 'Then by'),
                    colSel, orderSlot,
                    iconButton('trash', 'Remove sort', () => {
                        draft.splice(i, 1);
                        draw();
                    }, 'dt-icon-btn--danger'),
                ]);
            }));
            empty.hidden = draft.length > 0;
            addBtn.disabled = draft.length >= sortCols.length;
        };
        const addBtn = el('button', {
            class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => {
                const used = new Set(draft.map((d) => d.field));
                const next = sortCols.find((c) => !used.has(c.key));
                if (!next) return;
                draft.push({field: next.key, dir: 'asc'});
                draw();
                list.lastElementChild?.querySelector('select')?.focus();
            },
        }, [icon('plus'), 'Add sort']);
        draw();

        openDialog(root, {
            title: 'Sorting', body: el('div', {class: 'dt-panel'}, [list, empty, addBtn]),
            resetLabel: 'Clear sorting',
            onReset: () => {
                draft.length = 0;
                draw();
            },
            onApply: () => {
                state.sorts = draft.map((s) => ({...s}));
                state.page = 1;
                commit();
            },
        });
    }

    function openColumns() {
        const draft = new Set(state.hidden);
        const boxes = [];
        const sync = () => {
            const visible = columns.filter((c) => !draft.has(c.key));
            boxes.forEach(({box, col}) => {
                box.checked = !draft.has(col.key);
                // the last visible column can't be hidden, and locked columns never can
                box.disabled = !col.hideable || (box.checked && visible.length === 1);
            });
        };
        const fieldset = el('fieldset', {class: 'dt-columns'}, [
            el('legend', {class: 'dt-sr'}, 'Visible columns'),
            ...columns.map((col) => {
                const box = el('input', {type: 'checkbox'});
                box.addEventListener('change', () => {
                    if (box.checked) draft.delete(col.key);
                    else draft.add(col.key);
                    sync();
                });
                boxes.push({box, col});
                return el('label', {class: 'choice-option'}, [box, el('span', {}, col.label)]);
            }),
        ]);
        const hint = el('p', {class: 'dt-hint'}, 'At least one column must stay visible.');
        const error = el('p', {class: 'field-error', role: 'alert', hidden: true});
        sync();

        openDialog(root, {
            title: 'Columns', size: 'sm', body: el('div', {class: 'dt-panel'}, [fieldset, hint, error]),
            resetLabel: 'Reset to default',
            onReset: () => {
                draft.clear();
                columns.filter((c) => c.hidden).forEach((c) => draft.add(c.key));
                error.hidden = true;
                sync();
            },
            onApply: () => {
                const errors = validateHidden([...draft]);
                if (errors.length) {
                    error.textContent = errors.join(' ');
                    error.hidden = false;
                    return false;
                }
                state.hidden = draft;
                commit();
            },
        });
    }

    /*  row action menu  */
    function buildMenuItem(action, row) {
        const cls = `dt-menu__item${action.danger ? ' dt-menu__item--danger' : ''}`;
        const common = {class: cls, role: 'menuitem', tabindex: '-1', title: action.title};
        const done = () => menu.hidePopover();
        if (action.href && !action.disabled) {
            return el('a', {...common, href: action.href, onClick: done}, action.label);
        }
        return el('button', {
            ...common, type: 'button', disabled: action.disabled || undefined,
            onClick: () => {
                done();
                Promise.resolve(action.onSelect?.(row, api)).catch((err) => console.error('DataTable action failed', err));
            },
        }, action.label);
    }

    function openMenu(btn) {
        const row = btn._row;
        const actions = (opts.rowActions(row, api) || []).filter(Boolean);
        if (!actions.length) return;
        menu.replaceChildren(...actions.flatMap((a) => [
            a.separatorBefore ? el('div', {role: 'separator', class: 'dt-menu__sep'}) : null,
            buildMenuItem(a, row),
        ]).filter(Boolean));
        if (menu.matches(':popover-open')) menu.hidePopover();
        menuOpener = btn;
        btn.setAttribute('aria-expanded', 'true');
        menu.showPopover();

        const r = btn.getBoundingClientRect();
        const m = menu.getBoundingClientRect();
        let top = r.bottom + 4;
        if (top + m.height > window.innerHeight - 8) top = Math.max(8, r.top - m.height - 4);
        const left = Math.min(Math.max(8, r.right - m.width), window.innerWidth - m.width - 8);
        menu.style.top = `${top}px`;
        menu.style.left = `${left}px`;
        menu.querySelector('[role=menuitem]:not(:disabled)')?.focus();
    }

    tbody.addEventListener('click', (e) => {
        const btn = e.target.closest('.dt-kebab');
        if (!btn) return;
        // light-dismiss already closed the menu on this same click: treat it as a toggle
        if (menuClosedFor === btn && performance.now() - menuClosedAt < 250) return;
        openMenu(btn);
    });

    menu.addEventListener('toggle', (e) => {
        if (e.newState !== 'closed' || !menuOpener) return;
        menuOpener.setAttribute('aria-expanded', 'false');
        menuClosedFor = menuOpener;
        menuClosedAt = performance.now();
        menuOpener = null;
    });

    menu.addEventListener('keydown', (e) => {
        const items = [...menu.querySelectorAll('[role=menuitem]:not(:disabled)')];
        const i = items.indexOf(document.activeElement);
        const focusAt = (n) => items[(n + items.length) % items.length]?.focus();
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                focusAt(i + 1);
                break;
            case 'ArrowUp':
                e.preventDefault();
                focusAt(i - 1);
                break;
            case 'Home':
                e.preventDefault();
                focusAt(0);
                break;
            case 'End':
                e.preventDefault();
                focusAt(items.length - 1);
                break;
            case 'Tab':
                menu.hidePopover();
                break;
            default:
        }
    });

    /*  public API  */
    const api = {
        element: root,
        setRows(rows) {
            source = Array.isArray(rows) ? rows : [];
            return update();
        },
        refresh: () => update(),
        getState: snapshot,
        /** Atomic: if any part of the patch is invalid, nothing is applied, the errors are shown and returned. */
        setState(patch = {}) {
            const errors = [];
            if ('sorts' in patch) errors.push(...validateSorts(patch.sorts));
            if ('filters' in patch) errors.push(...validateFilters(patch.filters));
            if ('match' in patch && patch.match !== 'any' && patch.match !== 'all') {
                errors.push('match must be "all" or "any".');
            }
            if (patch.quick) {
                const err = validateCondition(patch.quick, quickCols);
                if (err) errors.push(`Search: ${err}`);
            }
            if ('pageSize' in patch && !opts.pageSizes.includes(patch.pageSize)) {
                errors.push(`pageSize must be one of ${opts.pageSizes.join(', ')}.`);
            }
            if ('page' in patch && !(Number.isInteger(patch.page) && patch.page >= 1)) {
                errors.push('page must be a positive integer.');
            }
            if ('hidden' in patch) errors.push(...validateHidden(patch.hidden));

            if (errors.length) {
                showNotice('Could not apply the requested view state:', errors);
                return {ok: false, errors};
            }

            if ('sorts' in patch) state.sorts = patch.sorts.map(({field, dir}) => ({field, dir}));
            if ('filters' in patch) state.filters = patch.filters.map(cleanCondition);
            if ('match' in patch) state.match = patch.match;
            if ('quick' in patch) state.quick = patch.quick ? cleanCondition(patch.quick) : null;
            if ('pageSize' in patch) state.pageSize = patch.pageSize;
            if ('page' in patch) state.page = patch.page;
            if ('hidden' in patch) state.hidden = new Set(patch.hidden);
            commit();
            return {ok: true, errors: []};
        },
        destroy() {
            abortCtl?.abort();
            reqSeq += 1;
            root.remove();
        },
    };

    restore();
    drawQuick();
    update();
    return api;
}