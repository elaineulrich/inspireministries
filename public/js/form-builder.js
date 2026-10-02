/* Admin form builder: edit sections and fields of a form, then save as JSON. */
(function () {
  var boot = JSON.parse(document.getElementById('boot').textContent);
  var form = boot.form;
  var types = boot.types;
  var roles = boot.roles || {};
  var CHOICE = ['radio', 'checkbox', 'select'];
  var root = document.getElementById('builder');
  var open = new Set();
  var dirty = false;
  var keySeq = 0;

  form.sections.forEach(function (s) { s._key = ++keySeq; s.fields.forEach(function (f) { f._key = ++keySeq; }); });

  function h(tag, attrs) {
    var el = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined || c === false) continue;
      [].concat(c).forEach(function (x) { if (x) el.appendChild(typeof x === 'string' ? document.createTextNode(x) : x); });
    }
    return el;
  }
  function markDirty() {
    dirty = true;
    saveBtn.disabled = false;
    stateEl.textContent = 'Unsaved changes';
    stateEl.className = 'builder-state warn';
  }
  function move(arr, i, d) {
    var j = i + d;
    if (j < 0 || j >= arr.length) return;
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    markDirty(); render();
  }
  function text(label, value, onInput, opts) {
    opts = opts || {};
    var input = opts.multiline
      ? h('textarea', { rows: opts.rows || 3, oninput: function (e) { onInput(e.target.value); markDirty(); } })
      : h('input', { type: 'text', value: value || '', oninput: function (e) { onInput(e.target.value); markDirty(); } });
    if (opts.multiline) input.value = value || '';
    return h('label', { class: 'b-field' + (opts.half ? ' half' : '') }, h('span', null, label), input, opts.hint ? h('small', null, opts.hint) : null);
  }
  function check(label, value, onChange) {
    return h('label', { class: 'b-check' }, h('input', { type: 'checkbox', checked: value, onchange: function (e) { onChange(e.target.checked); markDirty(); } }), label);
  }

  function fieldEditor(section, field, fi) {
    var isOpen = open.has(field._key);
    var head = h('div', { class: 'b-field-head', onclick: function (e) {
      if (e.target.closest('button')) return;
      if (isOpen) open.delete(field._key); else open.add(field._key);
      render();
    } },
      h('span', { class: 'drag' }, '⋮⋮'),
      h('div', { class: 'b-title' },
        h('strong', null, field.label || 'Untitled question'),
        h('small', null, types[field.type] + (field.required ? ' · required' : '') + (field.width === 'half' ? ' · half width' : '') + (field.role ? ' · ' + (roles[field.role] || field.role) : ''))),
      h('div', { class: 'b-tools' },
        h('button', { type: 'button', title: 'Move up', 'aria-label': 'Move up', onclick: function () { move(section.fields, fi, -1); } }, '↑'),
        h('button', { type: 'button', title: 'Move down', 'aria-label': 'Move down', onclick: function () { move(section.fields, fi, 1); } }, '↓'),
        h('button', { type: 'button', title: 'Duplicate', 'aria-label': 'Duplicate', onclick: function () {
          var copy = JSON.parse(JSON.stringify(field)); copy._key = ++keySeq; copy.id = ''; copy.role = ''; copy.label += ' (copy)';
          section.fields.splice(fi + 1, 0, copy); open.add(copy._key); markDirty(); render();
        } }, '⧉'),
        h('button', { type: 'button', class: 'danger', title: 'Delete', 'aria-label': 'Delete', onclick: function () {
          if (!confirm('Delete "' + (field.label || 'this question') + '"? Answers already given to it will no longer show on in-progress applications.')) return;
          section.fields.splice(fi, 1); markDirty(); render();
        } }, '✕')));
    var wrap = h('div', { class: 'b-field-card' + (isOpen ? ' open' : '') }, head);
    if (!isOpen) return wrap;

    var typeSelect = h('select', { onchange: function (e) {
      field.type = e.target.value;
      if (CHOICE.indexOf(field.type) >= 0 && !(field.options && field.options.length)) field.options = ['Option 1', 'Option 2'];
      if (field.type === 'content') field.required = false;
      markDirty(); render();
    } }, Object.keys(types).map(function (t) { var o = h('option', { value: t }, types[t]); if (t === field.type) o.selected = true; return o; }));

    var body = h('div', { class: 'b-body' },
      text(field.type === 'content' ? 'Heading (optional)' : 'Question', field.label, function (v) { field.label = v; }),
      h('label', { class: 'b-field half' }, h('span', null, 'Answer type'), typeSelect),
      field.type !== 'content' ? h('label', { class: 'b-field half' }, h('span', null, 'Width'),
        (function () {
          var s = h('select', { onchange: function (e) { field.width = e.target.value === 'half' ? 'half' : undefined; markDirty(); } },
            h('option', { value: 'full' }, 'Full width'), h('option', { value: 'half' }, 'Half width (side by side)'));
          s.value = field.width === 'half' ? 'half' : 'full';
          return s;
        })()) : null);

    if (CHOICE.indexOf(field.type) >= 0) {
      body.appendChild(text('Options (one per line)', (field.options || []).join('\n'), function (v) { field.options = v.split('\n').map(function (x) { return x.trim(); }).filter(Boolean); }, { multiline: true, rows: Math.max(3, (field.options || []).length + 1) }));
      if (field.type !== 'select') body.appendChild(check('Add an "Other" option with a text box', field.allowOther, function (v) { field.allowOther = v; }));
    }
    if (field.type === 'number') {
      body.appendChild(text('Minimum', field.min, function (v) { field.min = v; }, { half: true }));
      body.appendChild(text('Maximum', field.max, function (v) { field.max = v; }, { half: true }));
    }
    if (field.type === 'agreement' || field.type === 'content') {
      body.appendChild(text(field.type === 'agreement' ? 'Agreement text (shown next to the checkbox)' : 'Text', field.text, function (v) { field.text = v; }, { multiline: true, rows: 4 }));
    }
    if (field.type !== 'content') {
      body.appendChild(text('Help text (optional)', field.help, function (v) { field.help = v; }, { hint: 'Shown under the question.' }));
      body.appendChild(check('Required', field.required, function (v) { field.required = v; }));
    }
    if (field.type === 'signature') {
      body.appendChild(h('p', { class: 'b-note' }, 'Signers draw their signature and type their full name. If a section has several signatures and none are required (e.g. Father / Mother), at least one must be signed.'));
    }
    if (boot.kind === 'student' && field.type !== 'content') {
      body.appendChild(check('Show this answer to the parent and pastor at the top of their reference form', field.showOnReferences, function (v) { field.showOnReferences = v; }));
    }
    if (Object.keys(roles).length && field.type !== 'content') {
      var rs = h('select', { onchange: function (e) {
        var v = e.target.value;
        if (v) form.sections.forEach(function (s) { s.fields.forEach(function (f) { if (f !== field && f.role === v) f.role = ''; }); });
        field.role = v; markDirty(); render();
      } }, h('option', { value: '' }, 'None'), Object.keys(roles).map(function (r) { return h('option', { value: r }, roles[r]); }));
      rs.value = field.role || '';
      body.appendChild(h('label', { class: 'b-field' }, h('span', null, 'Special purpose'), rs,
        h('small', null, 'Tells the system what this answer is used for — e.g. where to email the parent and pastor reference forms.')));
    }
    wrap.appendChild(body);
    return wrap;
  }

  function sectionEditor(section, si) {
    var addType = h('select', { 'aria-label': 'New question type' }, Object.keys(types).map(function (t) { return h('option', { value: t }, types[t]); }));
    return h('section', { class: 'card b-section' },
      h('div', { class: 'b-section-head' },
        h('span', { class: 'b-step' }, 'Step ' + (si + 1)),
        h('div', { class: 'b-tools' },
          h('button', { type: 'button', 'aria-label': 'Move section up', title: 'Move section up', onclick: function () { move(form.sections, si, -1); } }, '↑'),
          h('button', { type: 'button', 'aria-label': 'Move section down', title: 'Move section down', onclick: function () { move(form.sections, si, 1); } }, '↓'),
          h('button', { type: 'button', class: 'danger', title: 'Delete section', 'aria-label': 'Delete section', onclick: function () {
            if (!confirm('Delete the section "' + section.title + '" and all of its questions?')) return;
            form.sections.splice(si, 1); markDirty(); render();
          } }, '✕'))),
      text('Section title', section.title, function (v) { section.title = v; }),
      text('Section description (optional)', section.description, function (v) { section.description = v; }, { multiline: true, rows: 2 }),
      h('div', { class: 'b-fields' }, section.fields.map(function (f, fi) { return fieldEditor(section, f, fi); })),
      h('div', { class: 'b-add' }, addType,
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: function () {
          var t = addType.value;
          var f = { _key: ++keySeq, id: '', type: t, label: t === 'content' ? '' : 'New question', required: t !== 'content' };
          if (CHOICE.indexOf(t) >= 0) f.options = ['Option 1', 'Option 2'];
          if (t === 'content') f.text = 'Write your instructions here.';
          if (t === 'agreement') f.text = 'I agree to…';
          section.fields.push(f); open.add(f._key); markDirty(); render();
        } }, '+ Add question')));
  }

  var saveBtn = h('button', { type: 'button', class: 'btn btn-primary', disabled: true, onclick: save }, 'Save changes');
  var stateEl = h('span', { class: 'builder-state' }, 'All changes saved');

  function render() {
    var y = window.scrollY;
    root.innerHTML = '';
    root.appendChild(h('div', { class: 'card b-section' },
      text('Form title', form.title, function (v) { form.title = v; }),
      text('Introduction (shown at the top of the form)', form.intro, function (v) { form.intro = v; }, { multiline: true, rows: 4 })));
    form.sections.forEach(function (s, si) { root.appendChild(sectionEditor(s, si)); });
    root.appendChild(h('div', { class: 'b-add-section' }, h('button', { type: 'button', class: 'btn btn-ghost', onclick: function () {
      form.sections.push({ _key: ++keySeq, id: '', title: 'New section', description: '', fields: [] }); markDirty(); render();
    } }, '+ Add section')));
    root.appendChild(h('div', { class: 'builder-bar' }, stateEl, saveBtn));
    window.scrollTo(0, y);
  }

  function strip(obj) {
    return JSON.parse(JSON.stringify(obj, function (k, v) { return k === '_key' ? undefined : v; }));
  }

  function save() {
    saveBtn.disabled = true;
    stateEl.textContent = 'Saving…';
    fetch('/admin/api/forms/' + boot.kind, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ form: strip(form) }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.body.error || 'Save failed');
        var keys = {};
        form.sections.forEach(function (s, si) { s.fields.forEach(function (f, fi) { keys[si + ':' + fi] = f._key; }); });
        form = res.body.form;
        form.sections.forEach(function (s, si) { s._key = ++keySeq; s.fields.forEach(function (f, fi) { f._key = keys[si + ':' + fi] || ++keySeq; }); });
        dirty = false;
        render();
        stateEl.textContent = 'Saved ✓';
        stateEl.className = 'builder-state ok';
      })
      .catch(function (e) {
        saveBtn.disabled = false;
        stateEl.textContent = 'Could not save: ' + e.message;
        stateEl.className = 'builder-state bad';
      });
  }

  window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  render();
})();
