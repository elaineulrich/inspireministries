/* Renders an admin-defined form (student application, parent reference or pastor reference)
   as a multi-step wizard with autosave, validation and signature capture. */
(function () {
  var boot = JSON.parse(document.getElementById('boot').textContent);
  var form = boot.form;
  var sections = form.sections;
  var data = boot.data || {};
  var step = Math.min(Math.max(boot.step || 0, 0), sections.length - 1);
  var errors = {};
  var isStudent = boot.mode === 'student';
  var apiBase = isStudent ? '/api/apply/' + boot.token : '/api/reference/' + boot.token;
  var root = document.getElementById('form-app');
  var signaturePads = [];
  if (isStudent && !boot.preview) { try { localStorage.setItem('im_app_token', boot.token); } catch (e) {} }

  // ---------- helpers ----------
  function h(tag, attrs) {
    var el = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined || c === false) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) el.appendChild(typeof x === 'string' ? document.createTextNode(x) : x); });
      else el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return el;
  }
  function isEmpty(fd, v) {
    if (v === undefined || v === null || v === '') return true;
    if (fd.type === 'checkbox') return !Array.isArray(v) || !v.length;
    if (fd.type === 'agreement') return v !== true;
    if (fd.type === 'name') return !v.first || !v.last;
    if (fd.type === 'address') return !v.street || !v.city || !v.state || !v.zip;
    if (fd.type === 'signature') return !v.image || !v.name;
    return false;
  }
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function validateSection(i) {
    var errs = {};
    var section = sections[i];
    section.fields.forEach(function (fd) {
      if (fd.type === 'content') return;
      var v = data[fd.id];
      if (isEmpty(fd, v)) {
        if (fd.required) {
          errs[fd.id] = fd.type === 'signature' ? 'Please sign and type your full name.'
            : fd.type === 'agreement' ? 'Please check the box to agree.'
            : fd.type === 'address' ? 'Please complete street, city, state and ZIP.'
            : fd.type === 'name' ? 'Please enter first and last name.'
            : 'This field is required.';
        }
        return;
      }
      if (fd.type === 'email' && !EMAIL_RE.test(v)) errs[fd.id] = 'Please enter a valid email address.';
      if (fd.type === 'phone' && String(v).replace(/\D/g, '').length < 7) errs[fd.id] = 'Please enter a valid phone number.';
      if (fd.type === 'number') {
        var n = Number(v);
        if (isNaN(n)) errs[fd.id] = 'Please enter a number.';
        else if (fd.min !== undefined && n < fd.min) errs[fd.id] = 'Must be at least ' + fd.min + '.';
        else if (fd.max !== undefined && n > fd.max) errs[fd.id] = 'Must be at most ' + fd.max + '.';
      }
      if ((fd.type === 'radio' || fd.type === 'select') && v === 'Other' && fd.required && !data[fd.id + '__other']) errs[fd.id] = 'Please describe "Other".';
      if (fd.type === 'checkbox' && v.indexOf('Other') >= 0 && fd.required && !data[fd.id + '__other']) errs[fd.id] = 'Please describe "Other".';
    });
    var sigs = section.fields.filter(function (fd) { return fd.type === 'signature'; });
    if (sigs.length && !sigs.some(function (fd) { return fd.required; }) && !sigs.some(function (fd) { return !isEmpty(fd, data[fd.id]); })) {
      errs[sigs[0].id] = 'At least one signature is required.';
    }
    return errs;
  }

  // ---------- autosave ----------
  var saveTimer = null;
  var saving = false;
  var dirty = false;
  var statusEl = h('span', { class: 'save-status', 'aria-live': 'polite' }, boot.preview ? 'Preview — answers are not saved' : 'All changes saved');

  function setStatus(text, cls) {
    statusEl.textContent = text;
    statusEl.className = 'save-status' + (cls ? ' ' + cls : '');
  }
  function scheduleSave() {
    if (boot.preview) return;
    dirty = true;
    setStatus('Saving…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 1000);
  }
  function save() {
    if (boot.preview) return Promise.resolve();
    clearTimeout(saveTimer);
    if (saving) { saveTimer = setTimeout(save, 500); return Promise.resolve(); }
    saving = true;
    dirty = false;
    return fetch(apiBase, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: data, step: step }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        saving = false;
        if (res.body.redirect) { window.location = res.body.redirect; return; }
        if (!res.ok) throw new Error(res.body.error || 'Save failed');
        if (!dirty) setStatus('All changes saved', 'ok');
      })
      .catch(function () {
        saving = false;
        dirty = true;
        setStatus('Not saved — check your connection', 'bad');
      });
  }
  window.addEventListener('beforeunload', function (e) {
    if (dirty && !boot.preview) { save(); e.preventDefault(); e.returnValue = ''; }
  });

  function set(id, value) {
    data[id] = value;
    if (errors[id]) {
      delete errors[id];
      var wrap = document.querySelector('[data-field="' + id + '"]');
      if (wrap) { wrap.classList.remove('has-error'); var er = wrap.querySelector('.field-error'); if (er) er.textContent = ''; }
    }
    scheduleSave();
  }

  // ---------- field renderers ----------
  function inputFor(fd, type, extra) {
    return h('input', Object.assign({
      type: type, id: 'f_' + fd.id, name: fd.id, value: data[fd.id] || '',
      oninput: function (e) { set(fd.id, e.target.value); },
    }, extra || {}));
  }

  function choiceList(fd, multiple) {
    var current = data[fd.id];
    var options = fd.options.slice();
    if (fd.allowOther) options.push('Other');
    var otherInput = null;
    if (fd.allowOther) {
      otherInput = h('input', {
        type: 'text', class: 'other-input', placeholder: 'Please specify', 'aria-label': 'Other — please specify',
        value: data[fd.id + '__other'] || '',
        oninput: function (e) { set(fd.id + '__other', e.target.value); },
      });
    }
    function syncOther() {
      if (!otherInput) return;
      var v = data[fd.id];
      var on = multiple ? Array.isArray(v) && v.indexOf('Other') >= 0 : v === 'Other';
      otherInput.style.display = on ? '' : 'none';
    }
    var list = h('div', { class: 'choices', role: multiple ? 'group' : 'radiogroup', 'aria-labelledby': 'l_' + fd.id },
      options.map(function (o, i) {
        var checked = multiple ? Array.isArray(current) && current.indexOf(o) >= 0 : current === o;
        return h('label', { class: 'choice' },
          h('input', {
            type: multiple ? 'checkbox' : 'radio', name: fd.id, value: o, checked: checked, id: i === 0 ? 'f_' + fd.id : null,
            onchange: function () {
              if (multiple) {
                var arr = Array.isArray(data[fd.id]) ? data[fd.id].slice() : [];
                var idx = arr.indexOf(o);
                if (idx >= 0) arr.splice(idx, 1); else arr.push(o);
                arr = options.filter(function (x) { return arr.indexOf(x) >= 0; });
                set(fd.id, arr);
              } else set(fd.id, o);
              syncOther();
            },
          }),
          h('span', null, o));
      }));
    setTimeout(syncOther);
    return h('div', null, list, otherInput);
  }

  function subInput(fd, key, label, opts) {
    var v = data[fd.id] || {};
    opts = opts || {};
    return h('div', { class: 'sub' + (opts.half ? ' half' : '') },
      h('input', {
        type: 'text', id: opts.first ? 'f_' + fd.id : null, value: v[key] || opts.def || '', autocomplete: opts.ac || null,
        'aria-label': fd.label + ' — ' + label,
        oninput: function (e) {
          var cur = Object.assign({}, data[fd.id] || {});
          cur[key] = e.target.value;
          set(fd.id, cur);
        },
      }),
      h('small', null, label));
  }

  function signatureField(fd) {
    var value = data[fd.id] || null;
    var wrap = h('div', { class: 'signature' });
    var canvas = h('canvas', { class: 'sig-canvas', 'aria-label': 'Signature pad — draw your signature with your finger or mouse' });
    var placeholder = h('div', { class: 'sig-placeholder' }, 'Sign here with your finger or mouse');
    var img = h('img', { class: 'sig-image', alt: 'Your signature' });
    var pad = null;
    var nameInput = h('input', {
      type: 'text', placeholder: 'Type your full legal name', 'aria-label': 'Type your full name', value: (value && value.name) || '',
      oninput: function (e) {
        var cur = data[fd.id] || {};
        if (!cur.image && !e.target.value) { set(fd.id, null); return; }
        set(fd.id, Object.assign({}, cur, { name: e.target.value }));
      },
    });
    var clearBtn = h('button', {
      type: 'button', class: 'link-btn',
      onclick: function () {
        var cur = data[fd.id] || {};
        set(fd.id, cur.name ? { name: cur.name } : null);
        showPad();
      },
    }, 'Clear signature');
    var box = h('div', { class: 'sig-box' }, canvas, placeholder, img);

    var lastWidth = 0;
    function resize() {
      if (!pad || canvas.offsetWidth === 0 || canvas.offsetWidth === lastWidth) return;
      var cur = data[fd.id];
      if (lastWidth && cur && cur.image) { showImage(cur.image); return; }
      lastWidth = canvas.offsetWidth;
      var ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext('2d').scale(ratio, ratio);
      pad.clear();
    }
    function showPad() {
      img.style.display = 'none';
      canvas.style.display = '';
      placeholder.style.display = '';
      lastWidth = 0;
      if (!pad) {
        pad = new window.SignaturePad(canvas, { penColor: '#1e293b', minWidth: 0.8, maxWidth: 2.4 });
        pad.addEventListener('beginStroke', function () { placeholder.style.display = 'none'; });
        pad.addEventListener('endStroke', function () {
          var cur = data[fd.id] || {};
          set(fd.id, Object.assign({}, cur, { image: pad.toDataURL('image/png'), signedAt: new Date().toISOString() }));
        });
        signaturePads.push(resize);
      }
      setTimeout(resize);
    }
    function showImage(src) {
      canvas.style.display = 'none';
      placeholder.style.display = 'none';
      img.src = src;
      img.style.display = '';
    }
    if (value && value.image) showImage(value.image); else showPad();

    wrap.appendChild(box);
    wrap.appendChild(h('div', { class: 'sig-row' }, clearBtn, h('span', { class: 'sig-date' }, 'Date: ' + new Date().toLocaleDateString('en-US'))));
    wrap.appendChild(h('div', { class: 'sub' }, nameInput, h('small', null, 'Full name')));
    wrap.appendChild(h('p', { class: 'sig-legal' }, 'By signing above, I agree that my electronic signature is the legal equivalent of my handwritten signature.'));
    return wrap;
  }

  function renderField(fd) {
    if (fd.type === 'content') {
      return h('div', { class: 'field content-block full' }, fd.label ? h('h3', null, fd.label) : null, h('p', null, fd.text || ''));
    }
    var control;
    switch (fd.type) {
      case 'textarea':
        control = h('textarea', { id: 'f_' + fd.id, rows: 4, oninput: function (e) { set(fd.id, e.target.value); } });
        control.value = data[fd.id] || '';
        break;
      case 'email': control = inputFor(fd, 'email', { autocomplete: 'email' }); break;
      case 'phone': control = inputFor(fd, 'tel', { autocomplete: 'tel', placeholder: '(000) 000-0000' }); break;
      case 'number': control = inputFor(fd, 'number', { min: fd.min, max: fd.max, inputmode: 'numeric' }); break;
      case 'date': control = inputFor(fd, 'date'); break;
      case 'radio': control = choiceList(fd, false); break;
      case 'checkbox': control = choiceList(fd, true); break;
      case 'select':
        control = h('select', { id: 'f_' + fd.id, onchange: function (e) { set(fd.id, e.target.value); } },
          h('option', { value: '' }, 'Please select'),
          fd.options.map(function (o) { var op = h('option', { value: o }, o); if (data[fd.id] === o) op.selected = true; return op; }));
        break;
      case 'name':
        control = h('div', { class: 'subs' },
          subInput(fd, 'first', 'First Name', { half: true, first: true, ac: 'given-name' }),
          subInput(fd, 'last', 'Last Name', { half: true, ac: 'family-name' }));
        break;
      case 'address':
        if (!data[fd.id]) data[fd.id] = { country: 'United States' };
        control = h('div', { class: 'subs' },
          subInput(fd, 'street', 'Street Address', { first: true, ac: 'address-line1' }),
          subInput(fd, 'street2', 'Street Address Line 2', { ac: 'address-line2' }),
          subInput(fd, 'city', 'City', { half: true, ac: 'address-level2' }),
          subInput(fd, 'state', 'State / Province', { half: true, ac: 'address-level1' }),
          subInput(fd, 'zip', 'Postal / Zip Code', { half: true, ac: 'postal-code' }),
          subInput(fd, 'country', 'Country', { half: true, ac: 'country-name', def: 'United States' }));
        break;
      case 'agreement':
        control = h('label', { class: 'agreement' },
          h('input', { type: 'checkbox', id: 'f_' + fd.id, checked: data[fd.id] === true, onchange: function (e) { set(fd.id, e.target.checked); } }),
          h('span', null, fd.text || 'I agree'));
        break;
      case 'signature': control = signatureField(fd); break;
      default: control = inputFor(fd, 'text');
    }
    var full = fd.width !== 'half';
    return h('div', { class: 'field ' + (full ? 'full' : 'half') + (errors[fd.id] ? ' has-error' : ''), 'data-field': fd.id },
      h('label', { class: 'field-label', id: 'l_' + fd.id, for: ['radio', 'checkbox', 'signature'].indexOf(fd.type) >= 0 ? null : 'f_' + fd.id },
        fd.label, fd.required ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : null),
      control,
      fd.help ? h('p', { class: 'field-help' }, fd.help) : null,
      h('p', { class: 'field-error', role: 'alert' }, errors[fd.id] || ''));
  }

  // ---------- layout ----------
  var stepsNav = h('ol', { class: 'steps' });
  var body = h('div', { class: 'form-body' });
  var nav = h('div', { class: 'form-nav' });
  var modal = h('div', { class: 'modal', hidden: true, role: 'dialog', 'aria-modal': 'true' });

  function goTo(i, opts) {
    if (i < 0 || i >= sections.length) return;
    step = i;
    render();
    if (!opts || !opts.noSave) save();
    var top = document.getElementById('form-top');
    if (top) top.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderSteps() {
    stepsNav.innerHTML = '';
    sections.forEach(function (s, i) {
      stepsNav.appendChild(h('li', { class: i === step ? 'current' : i < step ? 'done' : '' },
        h('button', { type: 'button', onclick: function () { goTo(i); }, 'aria-current': i === step ? 'step' : null },
          h('span', { class: 'num' }, String(i + 1)), h('span', { class: 'lbl' }, s.title))));
    });
  }

  function render() {
    signaturePads = [];
    renderSteps();
    var s = sections[step];
    body.innerHTML = '';
    body.appendChild(h('div', { class: 'section-head' },
      h('p', { class: 'step-count' }, 'Step ' + (step + 1) + ' of ' + sections.length),
      h('h2', null, s.title),
      s.description ? h('p', { class: 'section-desc' }, s.description) : null));
    body.appendChild(h('div', { class: 'fields' }, s.fields.map(renderField)));

    nav.innerHTML = '';
    nav.appendChild(step > 0 ? h('button', { type: 'button', class: 'btn btn-ghost', onclick: function () { goTo(step - 1); } }, '‹ Back') : h('span'));
    nav.appendChild(h('button', { type: 'button', class: 'btn btn-ghost', onclick: saveForLater }, 'Save & finish later'));
    var last = step === sections.length - 1;
    var hasSig = s.fields.some(function (fd) { return fd.type === 'signature'; });
    nav.appendChild(h('button', { type: 'button', class: 'btn btn-primary', onclick: last ? submit : next }, last ? (hasSig ? 'Sign & Submit' : 'Submit') : 'Next ›'));
  }

  function showErrors(errs) {
    errors = errs;
    var firstStep = -1;
    sections.forEach(function (s, i) {
      if (firstStep < 0 && s.fields.some(function (fd) { return errs[fd.id]; })) firstStep = i;
    });
    if (firstStep >= 0 && firstStep !== step) { step = firstStep; }
    render();
    var first = document.querySelector('.has-error');
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function next() {
    var errs = validateSection(step);
    if (Object.keys(errs).length) { showErrors(errs); return; }
    errors = {};
    goTo(step + 1);
  }

  function submit(e) {
    var allErrs = {};
    sections.forEach(function (_, i) { Object.assign(allErrs, validateSection(i)); });
    if (Object.keys(allErrs).length) { showErrors(allErrs); return; }
    if (boot.preview) { openModal('Preview', [h('p', null, 'This is a preview — everything validates. Nothing was submitted.')]); return; }
    var btn = e && e.target;
    if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }
    clearTimeout(saveTimer);
    dirty = false;
    var url = isStudent ? '/api/apply/' + boot.token + '/submit' : '/api/reference/' + boot.token + '/submit';
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: data, inPerson: !!boot.inPerson }) })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.redirect) { window.location = res.redirect; return; }
        if (btn) { btn.disabled = false; btn.textContent = 'Sign & Submit'; }
        if (res.errors) showErrors(res.errors);
        else openModal('Could not submit', [h('p', null, res.error || 'Please try again.')]);
      })
      .catch(function () {
        if (btn) { btn.disabled = false; btn.textContent = 'Sign & Submit'; }
        openModal('Could not submit', [h('p', null, 'Please check your internet connection and try again. Your answers are saved.')]);
      });
  }

  function openModal(title, content) {
    modal.innerHTML = '';
    modal.appendChild(h('div', { class: 'modal-card' },
      h('h2', null, title), content,
      h('div', { class: 'modal-actions' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: function () { modal.hidden = true; } }, 'OK'))));
    modal.hidden = false;
    modal.querySelector('.btn-primary').focus();
  }

  function copyRow(url) {
    var input = h('input', { type: 'text', value: url, readonly: true, onfocus: function (e) { e.target.select(); } });
    return h('div', { class: 'copy-row' }, input,
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: function (e) {
        input.select();
        (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).catch(function () { document.execCommand('copy'); });
        e.target.textContent = 'Copied!';
      } }, 'Copy link'));
  }

  function saveForLater() {
    if (boot.preview) { openModal('Preview', [h('p', null, 'Saving is turned off in preview.')]); return; }
    var url = window.location.origin + window.location.pathname;
    save().then(function () {
      if (isStudent) {
        fetch('/api/apply/' + boot.token + '/email-link', { method: 'POST' })
          .then(function (r) { return r.json(); })
          .then(function (res) {
            openModal('Your progress is saved', [
              h('p', null, res.email ? 'We emailed a link to ' + res.email + ' so you can come back and finish your application at any time.' : 'Your progress is saved.'),
              h('p', null, 'You can also bookmark or copy this link:'),
              copyRow(url),
            ]);
          })
          .catch(function () { openModal('Your progress is saved', [h('p', null, 'Bookmark or copy this link to come back later:'), copyRow(url)]); });
      } else {
        openModal('Your progress is saved', [
          h('p', null, 'You can come back to this form any time using the link in your email, or this link:'),
          copyRow(url),
        ]);
      }
    });
  }

  // ---------- page chrome ----------
  var intro = h('div', { class: 'form-intro', id: 'form-top' },
    h('div', { class: 'form-intro-top' },
      h('h1', null, form.title),
      isStudent && boot.code ? h('span', { class: 'badge' }, 'Student ID ' + boot.code) : null),
    form.intro ? h('p', { class: 'intro-text' }, form.intro) : null);

  if (!isStudent) {
    if (boot.inPerson) {
      intro.appendChild(h('div', { class: 'callout callout-info' },
        h('strong', null, 'Filling this out in person? '),
        'Please hand this device to the ' + (boot.mode === 'parent' ? 'parent or guardian' : 'pastor or church leader') +
        ' of ' + boot.studentName + '. Their answers are confidential and go directly to the Inspire Ministries board.'));
    }
    intro.appendChild(h('div', { class: 'applicant-card' },
      h('h3', null, 'Applicant: ' + boot.studentName),
      h('dl', null, (boot.applicant || []).map(function (r) { return h('div', null, h('dt', null, r.label), h('dd', null, r.value)); }))));
  } else if (boot.isNew) {
    intro.appendChild(h('div', { class: 'callout callout-ok' },
      h('strong', null, 'Your application has been started. '),
      'Your answers save automatically as you go. We also emailed a link to ' + boot.email + ' so you can come back and finish later.'));
  }

  root.appendChild(intro);
  root.appendChild(h('div', { class: 'form-shell' },
    h('aside', { class: 'form-aside' }, stepsNav, h('div', { class: 'save-wrap' }, statusEl)),
    h('div', { class: 'form-main' }, body, nav)));
  root.appendChild(modal);
  modal.addEventListener('click', function (e) { if (e.target === modal) modal.hidden = true; });

  window.addEventListener('resize', function () { signaturePads.forEach(function (fn) { fn(); }); });
  render();
})();
