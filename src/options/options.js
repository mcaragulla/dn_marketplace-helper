import { load, save, update, newTemplate, ymd, defaultData } from '../lib/store.js';
import { stats, nextPost, dayStatus } from '../lib/engine.js';
import { putImage, putImageRecord, getImage, getAllImages, deleteImage, clearImages, blobToDataUrl, dataUrlToBlob, uid } from '../lib/db.js';
import { initI18n, applyI18n, t, lang } from '../lib/i18n.js';

const $ = (id) => document.getElementById(id);
const APP_ID = 'dn_marketplace-helper';
const CATEGORIES = {
  es: ['Herramientas', 'Muebles', 'Hogar', 'Jardín', 'Electrodomésticos', 'Videojuegos', 'Libros, películas y música',
    'Bolsos y equipaje', 'Ropa y calzado de mujer', 'Ropa y calzado de hombre', 'Joyas y accesorios', 'Salud y belleza',
    'Artículos para mascotas', 'Bebés y niños', 'Juguetes y juegos', 'Electrónica y computadoras', 'Teléfonos celulares',
    'Bicicletas', 'Arte y manualidades', 'Deportes y actividades al aire libre', 'Repuestos para autos',
    'Instrumentos musicales', 'Antigüedades y objetos de colección', 'Varios'],
  en: ['Tools', 'Furniture', 'Household', 'Garden', 'Appliances', 'Video Games', 'Books, Movies & Music', 'Bags & Luggage',
    "Women's Clothing & Shoes", "Men's Clothing & Shoes", 'Jewelry & Accessories', 'Health & Beauty', 'Pet Supplies',
    'Baby & Kids', 'Toys & Games', 'Electronics & Computers', 'Mobile Phones', 'Bicycles', 'Arts & Crafts',
    'Sports & Outdoors', 'Auto Parts', 'Musical Instruments', 'Antiques & Collectibles', 'Miscellaneous']
};
const CONDITIONS = {
  es: ['Nuevo', 'Usado - Como nuevo', 'Usado - Buen estado', 'Usado - Aceptable'],
  en: ['New', 'Used - Like New', 'Used - Good', 'Used - Fair']
};

let data;
let draft = null;
const objectUrls = [];

init();

async function init() {
  data = await load();
  await initI18n(data.settings.lang);
  applyI18n();
  $('version').textContent = 'v' + chrome.runtime.getManifest().version;
  fillDatalists();
  bindNav();
  bindEditor();
  bindCalendar();
  bindHistory();
  bindSettings();
  await gcImages();
  window.addEventListener('hashchange', route);
  route();
}

/* ---------- Utilidades ---------- */
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.add('hidden'), 3500);
}

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  });
  children.flat().forEach((c) => n.append(c instanceof Node ? c : document.createTextNode(String(c))));
  return n;
}

function revokeUrls() { while (objectUrls.length) URL.revokeObjectURL(objectUrls.pop()); }

async function imgUrl(id) {
  const rec = await getImage(id);
  if (!rec) return '';
  const u = URL.createObjectURL(rec.blob);
  objectUrls.push(u);
  return u;
}

function fmtDate(ms) {
  return new Date(ms).toLocaleString(lang() === 'es' ? 'es' : 'en', { dateStyle: 'medium', timeStyle: 'short' });
}

function fillDatalists() {
  const l = lang();
  $('categoriesList').replaceChildren(...CATEGORIES[l].map((c) => el('option', { value: c })));
  $('conditionsList').replaceChildren(...CONDITIONS[l].map((c) => el('option', { value: c })));
}

/** Borra imágenes que ya no usa ninguna plantilla. */
async function gcImages() {
  const used = new Set(data.templates.flatMap((x) => x.imageIds || []));
  if (draft) (draft.imageIds || []).forEach((id) => used.add(id));
  const all = await getAllImages();
  for (const rec of all) if (!used.has(rec.id)) await deleteImage(rec.id);
}

/* ---------- Navegación ---------- */
function bindNav() {
  document.querySelectorAll('nav button').forEach((b) => {
    b.onclick = () => { location.hash = b.dataset.view; };
  });
}

function route() {
  const h = location.hash.slice(1) || 'templates';
  let view = h;
  if (h.startsWith('edit=')) {
    const tpl = data.templates.find((x) => x.id === h.slice(5));
    if (!tpl) { location.hash = 'templates'; return; }
    openEditor(tpl);
    view = 'editor';
  } else {
    draft = null;
  }
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + view));
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === (view === 'editor' ? 'templates' : view)));
  if (view === 'templates') renderTemplates();
  if (view === 'calendar') renderCalendar();
  if (view === 'history') renderHistory();
  if (view === 'settings') renderSettings();
}

/* ---------- Plantillas ---------- */
async function renderTemplates() {
  revokeUrls();
  data = await load();
  const clients = [...new Set(data.templates.map((x) => x.client).filter(Boolean))].sort();
  const filter = $('clientFilter');
  const prev = filter.value;
  filter.replaceChildren(el('option', { value: '' }, t('allClients')), ...clients.map((c) => el('option', { value: c }, c)));
  filter.value = clients.includes(prev) ? prev : '';
  filter.onchange = renderTemplates;
  $('clientsList').replaceChildren(...clients.map((c) => el('option', { value: c })));

  const list = data.templates
    .filter((x) => !filter.value || x.client === filter.value)
    .sort((a, b) => (a.client || '').localeCompare(b.client || '') || (a.name || '').localeCompare(b.name || ''));
  $('tplEmpty').classList.toggle('hidden', data.templates.length > 0);
  const cards = [];
  for (const tpl of list) {
    const s = stats(tpl, data.history);
    const img = el('img', { class: 'thumb', alt: '' });
    if (tpl.imageIds && tpl.imageIds[0]) imgUrl(tpl.imageIds[0]).then((u) => { if (u) img.src = u; });
    const left = s.postsLeft <= 0 ? 'danger' : s.postsLeft <= 3 ? 'warn' : 'ok';
    cards.push(el('div', { class: 'card tpl-card' },
      img,
      el('div', { class: 'row' }, el('span', { class: 'badge' }, tpl.client || t('noClient')), el('span', { class: 'spacer' }),
        el('span', { class: 'badge ' + left }, t('postsLeft', s.postsLeft))),
      el('h3', {}, tpl.name || t('untitled')),
      el('div', { class: 'muted' }, t('statsLine', s.freeTitles.length, s.totalTitles, s.freeImages.length, s.totalImages)),
      el('div', { class: 'row' },
        el('button', { class: 'small primary', onclick: () => { location.hash = 'edit=' + tpl.id; } }, t('edit')),
        el('button', { class: 'small', onclick: () => duplicate(tpl.id) }, t('duplicate')),
        el('span', { class: 'spacer' }),
        el('button', { class: 'small danger', onclick: () => removeTemplate(tpl.id) }, t('delete')))
    ));
  }
  $('tplList').replaceChildren(...cards);
}

$('newTpl').onclick = async () => {
  const tpl = newTemplate();
  tpl.name = t('newTemplateName');
  const filter = $('clientFilter').value;
  if (filter) tpl.client = filter;
  await update((d) => { d.templates.push(tpl); });
  data = await load();
  location.hash = 'edit=' + tpl.id;
};

async function duplicate(id) {
  let copyId;
  await update((d) => {
    const src = d.templates.find((x) => x.id === id);
    if (!src) return;
    const copy = { ...structuredClone(src), id: uid(), name: src.name + ' ' + t('copySuffix'), createdAt: Date.now(), updatedAt: Date.now() };
    copyId = copy.id;
    d.templates.push(copy);
  });
  data = await load();
  toast(t('duplicated'));
  if (copyId) location.hash = 'edit=' + copyId;
}

async function removeTemplate(id) {
  if (!confirm(t('confirmDelete'))) return;
  await update((d) => { d.templates = d.templates.filter((x) => x.id !== id); });
  data = await load();
  draft = null;
  await gcImages();
  toast(t('deleted'));
  if (location.hash !== '#templates') location.hash = 'templates'; else renderTemplates();
}

/* ---------- Editor ---------- */
const splitLines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);
const splitBlocks = (s) => s.split(/\n\s*---+\s*\n/).map((x) => x.trim()).filter(Boolean);

function openEditor(tpl) {
  if (draft && draft.id === tpl.id) return;
  draft = structuredClone(tpl);
  $('e_name').value = draft.name || '';
  $('e_client').value = draft.client || '';
  $('e_price').value = draft.price || '';
  $('e_per').value = draft.photosPerPost || 1;
  $('e_category').value = draft.category || '';
  $('e_condition').value = draft.condition || '';
  $('e_location').value = draft.location || '';
  $('e_titles').value = (draft.titles || []).join('\n');
  $('e_descriptions').value = (draft.descriptions || []).join('\n---\n');
  $('e_variables').value = draft.variables || '';
  $('clientsList').replaceChildren(...[...new Set(data.templates.map((x) => x.client).filter(Boolean))].map((c) => el('option', { value: c })));
  $('savedHint').classList.add('hidden');
  renderEditorSide();
  renderImages();
}

function readEditor() {
  Object.assign(draft, {
    name: $('e_name').value.trim(),
    client: $('e_client').value.trim(),
    price: $('e_price').value.trim(),
    photosPerPost: Math.min(10, Math.max(1, parseInt($('e_per').value, 10) || 1)),
    category: $('e_category').value.trim(),
    condition: $('e_condition').value.trim(),
    location: $('e_location').value.trim(),
    titles: splitLines($('e_titles').value),
    descriptions: splitBlocks($('e_descriptions').value),
    variables: $('e_variables').value,
    updatedAt: Date.now()
  });
}

async function saveDraft(showToast) {
  if (!draft) return;
  readEditor();
  const copy = structuredClone(draft);
  await update((d) => {
    const i = d.templates.findIndex((x) => x.id === copy.id);
    if (i >= 0) d.templates[i] = copy; else d.templates.push(copy);
  });
  data = await load();
  $('savedHint').classList.remove('hidden');
  if (showToast) toast(t('saved'));
}

function bindEditor() {
  let timer;
  const auto = () => {
    $('savedHint').classList.add('hidden');
    clearTimeout(timer);
    timer = setTimeout(async () => { await saveDraft(false); renderEditorSide(); }, 600);
  };
  ['e_name', 'e_client', 'e_price', 'e_per', 'e_category', 'e_condition', 'e_location', 'e_titles', 'e_descriptions', 'e_variables']
    .forEach((id) => $(id).addEventListener('input', auto));
  $('saveTpl').onclick = async () => { await saveDraft(true); renderEditorSide(); };
  $('backBtn').onclick = async () => { await saveDraft(false); location.hash = 'templates'; };
  $('dupTpl').onclick = async () => { await saveDraft(false); duplicate(draft.id); };
  $('delTpl').onclick = () => removeTemplate(draft.id);
  $('e_files').onchange = async (e) => {
    const files = [...e.target.files].filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type));
    for (const f of files) draft.imageIds.push(await putImage(f));
    e.target.value = '';
    await saveDraft(false);
    toast(t('imagesAdded', files.length));
    renderImages();
    renderEditorSide();
  };
}

function renderEditorSide() {
  if (!draft) return;
  readEditor();
  const s = stats(draft, data.history);
  const rows = [
    [t('availableTitles'), `${s.freeTitles.length} / ${s.totalTitles}`],
    [t('availablePhotos'), `${s.freeImages.length} / ${s.totalImages}`],
    [t('photosPerPost'), s.per],
    [t('postsRemaining'), s.postsLeft]
  ];
  $('sumBox').replaceChildren(...rows.map(([a, b]) => el('div', { class: 'sum-row' }, el('span', {}, a), el('b', {}, b))));
  const np = nextPost(draft, data.history);
  if (np.error) $('sumBox').append(el('div', { class: 'notice danger' }, t(np.error)));
  else if (np.lowStock) $('sumBox').append(el('div', { class: 'notice warn' }, t('lowStock', s.postsLeft)));
  const next = s.freeTitles.slice(0, 10);
  $('nextTitles').replaceChildren(...(next.length ? next.map((x) => el('li', {}, x)) : [el('li', { class: 'muted' }, '—')]));
}

async function renderImages() {
  revokeUrls();
  const used = new Set(data.history.filter((h) => h.status === 'published').flatMap((h) => h.imageIds || []));
  const items = [];
  for (const id of draft.imageIds) {
    const u = await imgUrl(id);
    if (!u) continue;
    const isUsed = used.has(id);
    items.push(el('div', { class: 'thumb-item' + (isUsed ? ' used' : '') },
      el('img', { src: u, alt: '' }),
      el('span', { class: 'badge ' + (isUsed ? 'off' : 'ok') }, isUsed ? t('used') : t('available')),
      el('button', { title: t('delete'), onclick: () => removeImage(id) }, '×')));
  }
  $('e_images').replaceChildren(...(items.length ? items : [el('div', { class: 'muted' }, t('noImagesYet'))]));
}

async function removeImage(id) {
  draft.imageIds = draft.imageIds.filter((x) => x !== id);
  await saveDraft(false);
  await gcImages();
  renderImages();
  renderEditorSide();
}

/* ---------- Calendario ---------- */
function weekdayNames() {
  const base = new Date(2024, 0, 7); // domingo
  return [...Array(7)].map((_, i) => new Date(base.getFullYear(), 0, 7 + i)
    .toLocaleDateString(lang() === 'es' ? 'es' : 'en', { weekday: 'short' }));
}

function bindCalendar() {
  $('remEnabled').onchange = saveReminder;
  $('remTime').onchange = saveReminder;
}

async function saveReminder() {
  const days = [...document.querySelectorAll('#daysBox input:checked')].map((i) => Number(i.value)).sort();
  await update((d) => {
    d.settings.reminder = { enabled: $('remEnabled').checked, days, time: $('remTime').value || '08:00' };
  });
  data = await load();
  toast(t('saved'));
  renderUpcoming();
}

function renderCalendar() {
  const r = data.settings.reminder;
  $('remEnabled').checked = r.enabled;
  $('remTime').value = r.time;
  const names = weekdayNames();
  const order = [1, 2, 3, 4, 5, 6, 0];
  $('daysBox').replaceChildren(...order.map((d) => {
    const cb = el('input', { type: 'checkbox', value: String(d) });
    cb.checked = r.days.includes(d);
    cb.onchange = saveReminder;
    return el('label', {}, cb, names[d]);
  }));
  renderUpcoming();
}

function renderUpcoming() {
  const out = [];
  const today = ymd(new Date());
  for (let i = 0; i < 21; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const key = ymd(d);
    const base = data.settings.reminder.days.includes(d.getDay()) ? 'publish' : 'off';
    const st = dayStatus(d, data.settings, data.overrides);
    const sel = el('select', {},
      el('option', { value: '' }, t('auto') + ': ' + t('status_' + base)),
      el('option', { value: 'publish' }, t('status_publish')),
      el('option', { value: 'renew' }, t('status_renew')),
      el('option', { value: 'skip' }, t('status_skip')));
    sel.value = data.overrides[key] || '';
    sel.onchange = async () => {
      await update((dd) => {
        if (!sel.value || sel.value === base) delete dd.overrides[key]; else dd.overrides[key] = sel.value;
        // Limpia excepciones viejas
        Object.keys(dd.overrides).forEach((k) => { if (k < today) delete dd.overrides[k]; });
      });
      data = await load();
      renderUpcoming();
    };
    const cls = { publish: 'ok', renew: 'warn', skip: 'off', off: 'off' }[st];
    out.push(el('div', { class: 'day' + (key === today ? ' today' : '') },
      el('div', { class: 'row' },
        el('b', {}, d.toLocaleDateString(lang() === 'es' ? 'es' : 'en', { weekday: 'short', day: 'numeric', month: 'short' })),
        el('span', { class: 'spacer' }), el('span', { class: 'badge ' + cls }, t('status_' + st))),
      sel));
  }
  $('upcoming').replaceChildren(...out);
}

/* ---------- Historial ---------- */
function bindHistory() {
  $('clearHistory').onclick = async () => {
    if (!confirm(t('confirmClearHistory'))) return;
    await update((d) => { d.history = []; d.pending = null; });
    data = await load();
    renderHistory();
  };
}

async function renderHistory() {
  data = await load();
  const rows = data.history.map((h) => el('tr', {},
    el('td', {}, fmtDate(h.publishedAt || h.date)),
    el('td', {}, h.client || '—'),
    el('td', {}, h.templateName || '—'),
    el('td', {}, h.title),
    el('td', {}, String((h.imageIds || []).length)),
    el('td', {}, el('span', { class: 'badge ' + (h.status === 'published' ? 'ok' : 'warn') }, t('hist_' + h.status))),
    el('td', {}, el('button', { class: 'small danger', title: t('deleteEntryHelp'), onclick: () => removeEntry(h.id) }, t('delete')))));
  $('historyBody').replaceChildren(...rows);
  $('historyEmpty').classList.toggle('hidden', rows.length > 0);
}

async function removeEntry(id) {
  if (!confirm(t('confirmDeleteEntry'))) return;
  await update((d) => {
    d.history = d.history.filter((h) => h.id !== id);
    if (d.pending && d.pending.historyId === id) d.pending = null;
  });
  renderHistory();
}

/* ---------- Ajustes y respaldo ---------- */
function bindSettings() {
  $('langSel').onchange = async () => {
    await update((d) => { d.settings.lang = $('langSel').value; });
    location.reload();
  };
  $('exportBtn').onclick = exportBackup;
  $('importFile').onchange = importBackup;
}

async function renderSettings() {
  $('langSel').value = data.settings.lang;
  if (navigator.storage && navigator.storage.estimate) {
    const est = await navigator.storage.estimate();
    $('usage').textContent = t('usage', (est.usage / 1048576).toFixed(1));
  }
}

async function exportBackup() {
  data = await load();
  const images = [];
  for (const rec of await getAllImages()) {
    images.push({ id: rec.id, name: rec.name, type: rec.type, createdAt: rec.createdAt, dataUrl: await blobToDataUrl(rec.blob) });
  }
  const payload = { app: APP_ID, version: chrome.runtime.getManifest().version, exportedAt: new Date().toISOString(), data, images };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `dn-marketplace-respaldo-${ymd()}.json` });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast(t('exported'));
}

async function importBackup(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    if (payload.app !== APP_ID || !payload.data || !Array.isArray(payload.data.templates)) throw new Error('format');
    if (!confirm(t('confirmImport'))) return;
    await clearImages();
    for (const im of payload.images || []) {
      await putImageRecord({ id: im.id, name: im.name, type: im.type, createdAt: im.createdAt || Date.now(), blob: await dataUrlToBlob(im.dataUrl) });
    }
    const merged = Object.assign(defaultData(), payload.data);
    await save(merged);
    toast(t('imported'));
    setTimeout(() => location.reload(), 800);
  } catch (err) {
    alert(t('importError'));
  }
}
