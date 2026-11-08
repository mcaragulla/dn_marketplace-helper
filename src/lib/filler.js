// Rellena una pestaña de Marketplace con la próxima publicación de una plantilla.
// Se usa desde el popup y desde el service worker (botón "Publicar").
import { load, update } from './store.js';
import { nextPost } from './engine.js';
import { getImage, blobToDataUrl, uid } from './db.js';
import { resolveLang } from './i18n.js';

export const URL_CREATE = 'https://www.facebook.com/marketplace/create/item';
const FIELDS = ['images', 'title', 'price', 'category', 'condition', 'description', 'availability', 'tags', 'sku', 'location', 'delivery', 'hideFromFriends', 'promote'];

export async function loadMessages(pref) {
  const lang = resolveLang(pref);
  const res = await fetch(chrome.runtime.getURL(`_locales/${lang}/messages.json`));
  const json = await res.json();
  return (key, ...subs) => {
    let s = json[key] ? json[key].message : key;
    subs.forEach((v, i) => { s = s.split(`{${i}}`).join(String(v)); });
    return s;
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Espera a que el content script responda y el formulario exista. */
export async function waitForForm(tabId, timeoutMs = 40000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const r = await chrome.tabs.sendMessage(tabId, { type: 'dnmh:ping' });
      if (r && r.isCreate && r.formReady) return { ok: true };
      if (r && r.needsLogin) return { ok: false, error: 'needsLogin' };
    } catch (_) { /* la página aún carga */ }
    await sleep(700);
  }
  return { ok: false, error: 'formTimeout' };
}

/**
 * @returns {{ok:boolean, failed?:string[], fieldNames?:object, error?:string, title?:string}}
 */
export async function fillTab(tabId, templateId) {
  let data = await load();
  const t = await loadMessages(data.settings.lang);
  const tpl = data.templates.find((x) => x.id === templateId);
  if (!tpl) return { ok: false, error: 'noTemplate' };
  const np = nextPost(tpl, data.history);
  if (np.error) return { ok: false, error: np.error };

  const images = [];
  for (const id of np.imageIds) {
    const rec = await getImage(id);
    if (rec) images.push({ name: rec.name, type: rec.type, dataUrl: await blobToDataUrl(rec.blob) });
  }
  const fieldNames = Object.fromEntries(FIELDS.map((k) => [k, t('f_' + k)]));
  let res;
  try {
    res = await chrome.tabs.sendMessage(tabId, {
      type: 'dnmh:fill',
      payload: { ...np, images },
      ui: { done: t('toastDone'), partial: t('toastPartial'), review: t('toastReview'), pressPublish: t('toastPressPublish'), fields: fieldNames }
    });
  } catch (e) {
    return { ok: false, error: 'fillError' };
  }
  if (!res || !res.ok) return { ok: false, error: 'fillError' };

  // Queda como "rellenado"; se confirma cuando el usuario presiona Publicar.
  await update((d) => {
    if (d.pending) d.history = d.history.filter((h) => !(h.id === d.pending.historyId && h.status === 'filled'));
    const entry = {
      id: uid(), date: Date.now(), templateId: tpl.id, templateName: tpl.name, client: tpl.client || '',
      title: np.title, imageIds: np.imageIds, price: np.price, status: 'filled'
    };
    d.history.unshift(entry);
    d.pending = { historyId: entry.id, templateId: tpl.id };
    d.lastTemplateId = tpl.id;
  });
  const failed = Object.keys(res.report).filter((k) => res.report[k] === false);
  return { ok: true, failed, fieldNames, title: np.title };
}
