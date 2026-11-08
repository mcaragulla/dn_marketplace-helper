// Service worker: recordatorios y registro de publicaciones.
import { load, update, STORAGE_KEY } from './lib/store.js';
import { nextReminderTime, dayStatus } from './lib/engine.js';
import { resolveLang } from './lib/i18n.js';
import { fillTab, waitForForm, URL_CREATE as FILL_URL } from './lib/filler.js';

const ALARM = 'dnmh-reminder';
const URL_CREATE = 'https://www.facebook.com/marketplace/create/item';
const URL_SELLING = 'https://www.facebook.com/marketplace/you/selling';

async function msg(key) {
  const data = await load();
  const lang = resolveLang(data.settings.lang);
  const res = await fetch(chrome.runtime.getURL(`_locales/${lang}/messages.json`));
  const json = await res.json();
  return json[key] ? json[key].message : key;
}

async function schedule() {
  const data = await load();
  await chrome.alarms.clear(ALARM);
  const when = nextReminderTime(new Date(), data.settings, data.overrides);
  if (when) await chrome.alarms.create(ALARM, { when });
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await schedule();
  if (details.reason === 'install') chrome.runtime.openOptionsPage();
});
chrome.runtime.onStartup.addListener(schedule);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[STORAGE_KEY]) return;
  const a = changes[STORAGE_KEY].oldValue || {};
  const b = changes[STORAGE_KEY].newValue || {};
  if (JSON.stringify([a.settings, a.overrides]) !== JSON.stringify([b.settings, b.overrides])) schedule();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM) return;
  const data = await load();
  const status = dayStatus(new Date(), data.settings, data.overrides);
  if (status === 'publish' || status === 'renew') {
    await chrome.notifications.create(`dnmh-${status}-${Date.now()}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: await msg('extName'),
      message: await msg(status === 'publish' ? 'notifyPublish' : 'notifyRenew'),
      priority: 2
    });
  }
  await schedule();
});

chrome.notifications.onClicked.addListener((id) => {
  if (!id.startsWith('dnmh-') || id.startsWith('dnmh-err-')) { chrome.notifications.clear(id); return; }
  chrome.tabs.create({ url: id.includes('-renew-') ? URL_SELLING : URL_CREATE });
  chrome.notifications.clear(id);
});

// El content script avisa cuando el usuario presiona "Publicar".
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'dnmh:published') {
    markPublished('auto').then(sendResponse);
    return true;
  }
  if (message && message.type === 'dnmh:publish') {
    publishFlow(message.templateId);
    sendResponse({ started: true });
    return false;
  }
  if (message && message.type === 'dnmh:markPublished') {
    markPublished('manual').then(sendResponse);
    return true;
  }
  return false;
});

async function markPublished(source) {
  let entry = null;
  await update((data) => {
    if (!data.pending) return data;
    const h = data.history.find((x) => x.id === data.pending.historyId);
    if (h && h.status !== 'published') {
      h.status = 'published';
      h.publishedAt = Date.now();
      h.source = source;
      entry = h;
    }
    data.pending = null;
    return data;
  });
  if (entry) {
    chrome.action.setBadgeBackgroundColor({ color: '#16A34A' });
    chrome.action.setBadgeText({ text: '✓' });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 8000);
  }
  return { ok: !!entry };
}

/* ---------- Botón "Publicar": abre Marketplace y rellena ---------- */
async function publishFlow(templateId) {
  const tab = await chrome.tabs.create({ url: FILL_URL, active: true });
  const ready = await waitForForm(tab.id);
  const res = ready.ok ? await fillTab(tab.id, templateId) : ready;
  if (!res.ok) {
    await chrome.notifications.create(`dnmh-err-${Date.now()}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: await msg('extName'),
      message: await msg(res.error),
      priority: 2
    });
  }
  return res;
}
