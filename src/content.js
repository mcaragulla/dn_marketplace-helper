// Content script: rellena el formulario de Marketplace. Nunca presiona "Publicar".
(() => {
  if (window.__dnmhLoaded) return;
  window.__dnmhLoaded = true;

  const LABELS = {
    title: ['Título', 'Title'],
    price: ['Precio', 'Price'],
    category: ['Categoría', 'Category'],
    condition: ['Estado', 'Condition'],
    description: ['Descripción', 'Description'],
    location: ['Ubicación', 'Location']
  };
  const MORE_DETAILS = ['mas detalles', 'more details'];
  const PUBLISH = ['publicar', 'publish'];

  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const visible = (el) => !!(el && el.getClientRects().length);

  function findLabel(keys) {
    const wanted = keys.map(norm);
    for (const lab of document.querySelectorAll('label')) {
      if (!visible(lab)) continue;
      for (const sp of lab.querySelectorAll('span, div')) {
        if (sp.children.length === 0 && wanted.includes(norm(sp.textContent))) return lab;
      }
    }
    return null;
  }

  function findField(keys) {
    for (const k of keys) {
      const el = document.querySelector(`input[aria-label="${k}"], textarea[aria-label="${k}"], [contenteditable="true"][aria-label="${k}"]`);
      if (visible(el)) return el;
    }
    const lab = findLabel(keys);
    if (!lab) return null;
    return lab.querySelector('textarea, input:not([type=file]):not([type=hidden]), [contenteditable="true"]')
      || (lab.htmlFor ? document.getElementById(lab.htmlFor) : null);
  }

  function setValue(el, value) {
    el.focus();
    if (el.isContentEditable) {
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, value);
    } else {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    el.blur();
  }

  function readValue(el) {
    if (!el) return '';
    return el.isContentEditable ? el.innerText : el.value;
  }

  function options() {
    return [...document.querySelectorAll('[role="option"], [role="menuitemradio"], [role="listbox"] [role="button"], [role="dialog"] [role="button"]')]
      .filter(visible);
  }

  const key = (s) => norm(s).replace(/[^a-z0-9]+/g, ' ').trim();

  function pick(list, value) {
    const target = key(value);
    if (!target) return null;
    return list.find((o) => key(o.textContent) === target)
      || list.find((o) => key(o.textContent).startsWith(target))
      || list.find((o) => key(o.textContent).includes(target));
  }

  async function waitPick(value, tries = 20) {
    for (let i = 0; i < tries; i++) {
      await sleep(150);
      const hit = pick(options(), value);
      if (hit) { hit.click(); await sleep(250); return true; }
    }
    return false;
  }

  function comboTrigger(keys) {
    const lab = findLabel(keys);
    if (lab) return lab.querySelector('[role="combobox"]') || lab;
    for (const k of keys) {
      const el = document.querySelector(`[role="combobox"][aria-label="${k}"]`);
      if (visible(el)) return el;
    }
    return null;
  }

  async function choose(keys, value) {
    if (!value) return 'skip';
    const trigger = comboTrigger(keys);
    if (!trigger) return false;
    const current = key(trigger.textContent);
    if (current.includes(key(value)) && keys.every((k) => key(k) !== current)) return true;
    trigger.click();
    const ok = await waitPick(value);
    if (!ok) document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return ok;
  }

  async function setLocation(value) {
    if (!value) return 'skip';
    const el = findField(LABELS.location);
    if (!el) return false;
    setValue(el, value);
    el.focus();
    return waitPick(value.split(',')[0], 25);
  }

  function expandMoreDetails() {
    for (const el of document.querySelectorAll('[role="button"][aria-expanded="false"]')) {
      if (MORE_DETAILS.includes(norm(el.textContent))) { el.click(); return true; }
    }
    return false;
  }

  function dataUrlToFile(img) {
    const [meta, b64] = img.dataUrl.split(',');
    const type = img.type || (meta.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], img.name || 'foto.jpg', { type });
  }

  async function addImages(images) {
    if (!images || !images.length) return 'skip';
    const inputs = [...document.querySelectorAll('input[type="file"]')];
    const input = inputs.find((i) => (i.accept || '').includes('image')) || inputs[0];
    if (!input) return false;
    const dt = new DataTransfer();
    images.forEach((img) => dt.items.add(dataUrlToFile(img)));
    input.files = dt.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(600);
    return true;
  }

  function setText(keys, value) {
    if (!value) return 'skip';
    const el = findField(keys);
    if (!el) return false;
    setValue(el, value);
    return true;
  }

  async function fillForm(p) {
    const r = {};
    r.images = await addImages(p.images);
    r.title = setText(LABELS.title, p.title);
    r.price = setText(LABELS.price, p.price);
    r.category = await choose(LABELS.category, p.category);
    r.condition = await choose(LABELS.condition, p.condition);
    if (p.description && !findField(LABELS.description)) { expandMoreDetails(); await sleep(400); }
    r.description = setText(LABELS.description, p.description);
    r.location = await setLocation(p.location);
    return r;
  }

  function comboText(keys) {
    const trigger = comboTrigger(keys);
    if (!trigger) return '';
    const labelWords = keys.map(norm);
    const parts = (trigger.innerText || '').split('\n').map((s) => s.trim()).filter(Boolean);
    return parts.filter((s) => !labelWords.includes(norm(s))).join(' ');
  }

  function readForm() {
    return {
      title: readValue(findField(LABELS.title)),
      price: readValue(findField(LABELS.price)),
      description: readValue(findField(LABELS.description)),
      category: comboText(LABELS.category),
      condition: comboText(LABELS.condition),
      location: readValue(findField(LABELS.location))
    };
  }

  /* ---------- Aviso visual en la página ---------- */
  function toast(lines, ok) {
    const old = document.getElementById('dnmh-toast');
    if (old) old.remove();
    const host = document.createElement('div');
    host.id = 'dnmh-toast';
    const root = host.attachShadow({ mode: 'closed' });
    const box = document.createElement('div');
    box.setAttribute('style', [
      'position:fixed', 'z-index:2147483647', 'right:20px', 'bottom:20px', 'max-width:340px',
      'background:#fff', 'color:#111827', 'font:14px/1.45 system-ui,Segoe UI,Arial,sans-serif',
      'border-radius:12px', 'padding:14px 16px', 'box-shadow:0 10px 30px rgba(0,0,0,.25)',
      `border-left:5px solid ${ok ? '#16A34A' : '#F59E0B'}`
    ].join(';'));
    lines.forEach((text, i) => {
      const p = document.createElement('div');
      p.textContent = text;
      if (i === 0) p.style.fontWeight = '700';
      box.appendChild(p);
    });
    root.appendChild(box);
    document.documentElement.appendChild(host);
    setTimeout(() => host.remove(), 9000);
  }

  /* ---------- Detecta "Publicar" ---------- */
  document.addEventListener('click', (e) => {
    if (!location.pathname.includes('/marketplace')) return;
    const btn = e.target.closest && e.target.closest('[role="button"], button');
    if (!btn) return;
    const label = norm(btn.getAttribute('aria-label') || btn.textContent);
    if (PUBLISH.includes(label)) {
      try { chrome.runtime.sendMessage({ type: 'dnmh:published' }); } catch (_) { /* extensión recargada */ }
    }
  }, true);

  /* ---------- Mensajes desde el popup ---------- */
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || typeof msg.type !== 'string') return false;
    if (msg.type === 'dnmh:ping') {
      sendResponse({ ok: true, isCreate: /\/marketplace\/create/.test(location.pathname) });
      return false;
    }
    if (msg.type === 'dnmh:read') {
      sendResponse({ ok: true, form: readForm() });
      return false;
    }
    if (msg.type === 'dnmh:fill') {
      fillForm(msg.payload).then((report) => {
        const failed = Object.keys(report).filter((k) => report[k] === false);
        const ui = msg.ui || {};
        const lines = [failed.length ? ui.partial : ui.done];
        if (failed.length) lines.push(`${ui.review}: ${failed.map((k) => ui.fields[k] || k).join(', ')}`);
        lines.push(ui.pressPublish);
        toast(lines, !failed.length);
        sendResponse({ ok: true, report });
      }).catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }
    return false;
  });
})();
