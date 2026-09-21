// File bytes live in IndexedDB, never in the small progress overlay or gist.
// This local cache also makes attached material available when the app is
// offline. Cloud storage can serve a second device through the same ids.
const DB = 'starlight-documents-v1';
const STORE = 'files';

import { pairingKey } from './push-client.js';

function database() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('This browser cannot store files offline.'));
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Document storage could not open.'));
  });
}

async function operate(mode, action) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = action(transaction.objectStore(STORE));
      let result;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error || new Error('Document storage failed.'));
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(transaction.error || new Error('Document storage stopped.'));
    });
  } finally { db.close(); }
}

export function putLocalDocument(id, file) {
  return operate('readwrite', (store) => store.put({ id, file }));
}

export function getLocalDocument(id) {
  return operate('readonly', (store) => store.get(id)).then((record) => record?.file || null);
}

export function removeLocalDocument(id) {
  return operate('readwrite', (store) => store.delete(id));
}

export async function uploadDocument(id, file) {
  const key = pairingKey();
  if (!key) throw new Error('Pair this device to keep files available on your phone.');
  if (navigator.onLine === false) throw new Error('File saved on this device. Sync when back online.');
  const { uploadPresigned } = await import('@vercel/blob/client');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'file';
  const pathname = `starlight/documents/${id}/${safeName}`;
  const inferred = /\.pdf$/i.test(file.name) ? 'application/pdf'
    : /\.docx$/i.test(file.name) ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : /\.pptx$/i.test(file.name) ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        : /\.md$/i.test(file.name) ? 'text/markdown' : 'text/plain';
  const result = await uploadPresigned(pathname, file, { access: 'private',
    handleUploadUrl: '/api/documents', headers: { Authorization: `Bearer ${key}` },
    contentType: inferred, multipart: file.size > 4_000_000 });
  return result.pathname;
}

export async function resolveDocument(id, record) {
  const local = await getLocalDocument(id);
  if (local) return local;
  if (!record.remote || !record.pathname) throw new Error('This file is on another device. Pair Starlight and sync it from the device where you added it.');
  if (navigator.onLine === false) throw new Error('Connect once to make this file available offline.');
  if (!pairingKey()) throw new Error('Pair this device to open the file.');
  const response = await fetch(`/api/documents?pathname=${encodeURIComponent(record.pathname)}`, {
    headers: { Authorization: `Bearer ${pairingKey()}` }, cache: 'no-store'
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Could not open file.');
  const file = new File([await response.blob()], record.name, { type: record.type });
  await putLocalDocument(id, file);
  return file;
}
