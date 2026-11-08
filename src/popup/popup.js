import { load, update, newTemplate, ymd } from '../lib/store.js';
import { nextPost, stats, dayStatus, nextDayWith } from '../lib/engine.js';
import { getImage, blobToDataUrl, uid } from '../lib/db.js';
import { initI18n, applyI18n, t, lang } from '../lib/i18n.js';

const URL_CREATE = 'https://www.facebook.com/marketplace/create/item';
const URL_SELLING = 'https://www.facebook.com/marketplace/you/selling';
const $ = (id) => document.getElementById(id);

let data;
let tab;
let pageOk = false;
let previewUrl = null;

init();

async function init() {
  data = await load();
  await initI18n(data.settings.lang);
  applyI18n();
  $('version').textContent = 'v' + chrome.runtime.getManifest().version;
  $('openPanel').onclick = () => chrome.runtime.openOptionsPage();
  $('openCreate').onclick = () => chrome.tabs.create({ url: URL_CREATE });
  $('fillBtn').onclick = onFill;
  $('captureBtn').onclick = onCapture;
  $('markPublished').onclick = onMarkPublished;
  $('cancelPending').onclick = onCancelPending;
  $('tplSelect').onchange = async () => {
    await update((d) => { d.lastTemplateId = $('tplSelect').value; });
    data = await load();
    renderPreview();
  };
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await checkPage();
  render();
}

/* ---------- Página actual ---------- */
const FB_URL = /^https:\/\/(www|web)\.facebook\.com\//;

async function ensureContent() {
  if (!tab) return null;
  try {
    return await chrome.tabs.sendMessage(tab.id, { type: 'dnmh:ping' });
  } catch (_) {
    // Solo inyecta si sabemos que la pestaña es Facebook (p. ej. abierta antes de instalar).
    if (!FB_URL.test(tab.url || '')) return null;
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/content.js'] });
      return await chrome.tabs.sendMessage(tab.id, { type: 'dnmh:ping' });
    } catch (e) {
      return null;
    }
  }
}

async function checkPage() {
  const res = await ensureContent();
  pageOk = !!(res && res.isCreate);
  $('pageNotice').classList.toggle('hidden', pageOk);
}

/* ---------- Render ---------- */
function render() {
  renderToday();
  renderPending();
  renderTemplates();
  renderPreview();
}

function dateLabel(d) {
  return d.toLocaleDateString(lang() === 'es' ? 'es' : 'en', { weekday: 'long', day: 'numeric', month: 'short' });
}

function renderToday() {
  const today = new Date();
  const st = dayStatus(today, data.settings, data.overrides);
  const overridden = !!data.overrides[ymd(today)];
  $('todayTitle').textContent = t('today') + ' · ' + dateLabel(today);
  const badge = $('todayBadge');
  badge.textContent = t('status_' + st);
  badge.className = 'badge ' + ({ publish: 'ok', renew: 'warn', skip: 'off', off: 'off' }[st]);

  const next = nextDayWith('publish', today, data.settings, data.overrides);
  const nextTxt = next ? t('nextPublish', dateLabel(next)) : '';
  $('todayText').textContent = ({
    publish: t('todayPublishText'),
    renew: t('todayRenewText'),
    skip: t('todaySkipText') + ' ' + nextTxt,
    off: t('todayOffText') + ' ' + nextTxt
  })[st];

  const box = $('todayActions');
  box.textContent = '';
  const add = (label, fn, cls = 'small') => {
    const b = document.createElement('button');
    b.className = cls; b.textContent = label; b.onclick = fn; box.appendChild(b);
  };
  if (st === 'renew') add(t('openSelling'), () => chrome.tabs.create({ url: URL_SELLING }), 'small primary');
  if (st === 'publish') add(t('skipToday'), () => setOverride('skip'));
  if (st !== 'renew') add(t('renewToday'), () => setOverride('renew'));
  if (overridden) add(t('resetToday'), () => setOverride(null));
}

async function setOverride(value) {
  data = await update((d) => {
    const k = ymd(new Date());
    if (value) d.overrides[k] = value; else delete d.overrides[k];
  });
  renderToday();
}

function renderPending() {
  const p = data.pending && data.history.find((h) => h.id === data.pending.historyId);
  $('pendingCard').classList.toggle('hidden', !p);
  if (p) $('pendingText').textContent = p.title;
}

function renderTemplates() {
  const sel = $('tplSelect');
  sel.textContent = '';
  const has = data.templates.length > 0;
  $('emptyTpl').classList.toggle('hidden', has);
  sel.disabled = !has;
  $('fillBtn').disabled = !has || !pageOk;
  const groups = {};
  data.templates.forEach((tpl) => {
    const c = tpl.client || t('noClient');
    (groups[c] = groups[c] || []).push(tpl);
  });
  Object.keys(groups).sort().forEach((client) => {
    const og = document.createElement('optgroup');
    og.label = client;
    groups[client].sort((a, b) => a.name.localeCompare(b.name)).forEach((tpl) => {
      const o = document.createElement('option');
      o.value = tpl.id; o.textContent = tpl.name || t('untitled');
      og.appendChild(o);
    });
    sel.appendChild(og);
  });
  if (data.lastTemplateId && data.templates.some((x) => x.id === data.lastTemplateId)) sel.value = data.lastTemplateId;
}

function currentTpl() {
  return data.templates.find((x) => x.id === $('tplSelect').value);
}

async function renderPreview() {
  const tpl = currentTpl();
  $('preview').classList.toggle('hidden', !tpl);
  hideMsg();
  if (!tpl) return;
  const np = nextPost(tpl, data.history);
  const s = stats(tpl, data.history);
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  $('pvImg').src = '';
  if (np.error) {
    $('pvTitle').textContent = '—';
    $('pvPrice').textContent = '';
    showMsg(t(np.error), 'danger');
  } else {
    $('pvTitle').textContent = np.title;
    $('pvPrice').textContent = np.price ? t('price') + ': ' + np.price : '';
    if (np.imageIds[0]) {
      const rec = await getImage(np.imageIds[0]);
      if (rec) { previewUrl = URL.createObjectURL(rec.blob); $('pvImg').src = previewUrl; }
    }
    if (np.lowStock) showMsg(t('lowStock', s.postsLeft), 'warn');
  }
  $('pvStats').textContent = t('statsLine', s.freeTitles.length, s.totalTitles, s.freeImages.length, s.totalImages);
}

function showMsg(text, kind = '') {
  const el = $('fillMsg');
  el.textContent = text;
  el.className = 'notice ' + kind;
}
function hideMsg() { $('fillMsg').className = 'notice hidden'; }

/* ---------- Acciones ---------- */
async function onFill() {
  const tpl = currentTpl();
  if (!tpl) return;
  data = await load();
  const np = nextPost(tpl, data.history);
  if (np.error) return showMsg(t(np.error), 'danger');

  $('fillBtn').disabled = true;
  showMsg(t('filling'));
  try {
    const images = [];
    for (const id of np.imageIds) {
      const rec = await getImage(id);
      if (rec) images.push({ name: rec.name, type: rec.type, dataUrl: await blobToDataUrl(rec.blob) });
    }
    const fields = {
      images: t('f_images'), title: t('f_title'), price: t('f_price'), category: t('f_category'),
      condition: t('f_condition'), description: t('f_description'), location: t('f_location')
    };
    const res = await chrome.tabs.sendMessage(tab.id, {
      type: 'dnmh:fill',
      payload: { ...np, images },
      ui: { done: t('toastDone'), partial: t('toastPartial'), review: t('toastReview'), pressPublish: t('toastPressPublish'), fields }
    });
    if (!res || !res.ok) throw new Error(res && res.error);

    // Registrar como "rellenado" (se confirma al presionar Publicar).
    data = await update((d) => {
      if (d.pending) d.history = d.history.filter((h) => !(h.id === d.pending.historyId && h.status === 'filled'));
      const entry = {
        id: uid(), date: Date.now(), templateId: tpl.id, templateName: tpl.name, client: tpl.client || '',
        title: np.title, imageIds: np.imageIds, price: np.price, status: 'filled'
      };
      d.history.unshift(entry);
      d.pending = { historyId: entry.id, templateId: tpl.id };
    });
    const failed = Object.keys(res.report).filter((k) => res.report[k] === false);
    if (failed.length) showMsg(t('partialFill', failed.map((k) => fields[k]).join(', ')), 'warn');
    else showMsg(t('fillOk'), 'ok');
    renderPending();
  } catch (e) {
    showMsg(t('fillError'), 'danger');
  } finally {
    $('fillBtn').disabled = !pageOk;
  }
}

async function onCapture() {
  const ping = await ensureContent();
  if (!ping) return showMsg(t('captureNeedsFb'), 'warn');
  const res = await chrome.tabs.sendMessage(tab.id, { type: 'dnmh:read' });
  const f = (res && res.form) || {};
  if (!f.title && !f.description && !f.price) return showMsg(t('captureEmpty'), 'warn');
  const tpl = newTemplate();
  Object.assign(tpl, {
    name: (f.title || t('untitled')).slice(0, 60),
    price: f.price || '',
    category: f.category || '',
    condition: f.condition || '',
    location: f.location || '',
    titles: f.title ? [f.title] : [],
    descriptions: f.description ? [f.description] : []
  });
  await update((d) => { d.templates.push(tpl); d.lastTemplateId = tpl.id; });
  chrome.tabs.create({ url: chrome.runtime.getURL(`src/options/options.html#edit=${tpl.id}`) });
}

async function onMarkPublished() {
  await chrome.runtime.sendMessage({ type: 'dnmh:markPublished' });
  data = await load();
  render();
  showMsg(t('markedPublished'), 'ok');
}

async function onCancelPending() {
  data = await update((d) => {
    if (d.pending) d.history = d.history.filter((h) => !(h.id === d.pending.historyId && h.status === 'filled'));
    d.pending = null;
  });
  render();
}
