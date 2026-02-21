const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const {
  encrypt,
  decrypt,
  generateDynamicKey,
  encryptMessage,
  decryptMessage,
  KEY_LEN
} = require('./crypto-util');

const DATA_DIR = path.join(__dirname, '..', 'data');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const KEYS_FILE = path.join(DATA_DIR, 'conv_keys.enc');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function convId(a, b) {
  return [a, b].sort().join('::');
}

// Conversation keys: convId -> encrypted key (base64). Key is stored encrypted with secretKey.
function loadKeys(secretKey) {
  ensureDataDir();
  const keys = {};
  if (!fs.existsSync(KEYS_FILE)) return keys;
  try {
    const raw = fs.readFileSync(KEYS_FILE);
    const json = decrypt(raw, secretKey);
    Object.assign(keys, JSON.parse(json));
  } catch (_) {
    return {};
  }
  return keys;
}

function saveKeys(keysObj, secretKey) {
  ensureDataDir();
  const enc = encrypt(JSON.stringify(keysObj), secretKey);
  fs.writeFileSync(KEYS_FILE, enc);
}

function getOrCreateConvKey(secretKey, cid) {
  const keys = loadKeys(secretKey);
  if (!keys[cid]) {
    keys[cid] = generateDynamicKey().toString('base64');
    saveKeys(keys, secretKey);
  }
  return Buffer.from(keys[cid], 'base64');
}

// Messages: { convId: [ { id, from, to, encrypted: { iv, tag, data }, ts } ] }
function loadMessages() {
  ensureDataDir();
  if (!fs.existsSync(MESSAGES_FILE)) return {};
  return JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8'));
}

function saveMessages(messages) {
  ensureDataDir();
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 0));
}

function addMessage(secretKey, from, to, text) {
  const cid = convId(from, to);
  const keyBuf = getOrCreateConvKey(secretKey, cid);
  const encrypted = encryptMessage(text, keyBuf);
  const messages = loadMessages();
  if (!messages[cid]) messages[cid] = [];
  const msg = {
    id: uuidv4(),
    from,
    to,
    encrypted,
    ts: Date.now()
  };
  messages[cid].push(msg);
  saveMessages(messages);
  return { ...msg, text };
}

function getMessagesDecrypted(secretKey, userLogin, contactLogin) {
  const cid = convId(userLogin, contactLogin);
  const keyBuf = getOrCreateConvKey(secretKey, cid);
  const messages = loadMessages();
  const list = messages[cid] || [];
  return list.map(m => ({
    id: m.id,
    from: m.from,
    to: m.to,
    text: decryptMessage(m.encrypted, keyBuf),
    ts: m.ts
  }));
}

/** Returns list of logins with whom user has dialogs, with last message ts, sorted by lastTs desc */
function getDialogsForUser(userLogin) {
  const messages = loadMessages();
  const byContact = {};
  for (const [cid, list] of Object.entries(messages)) {
    if (!list.length) continue;
    const [a, b] = cid.split('::');
    const other = a === userLogin ? b : b === userLogin ? a : null;
    if (!other) continue;
    const lastTs = Math.max(...list.map(m => m.ts));
    if (!byContact[other] || byContact[other] < lastTs) byContact[other] = lastTs;
  }
  return Object.entries(byContact)
    .map(([login, lastTs]) => ({ login, lastTs }))
    .sort((x, y) => y.lastTs - x.lastTs);
}

module.exports = {
  addMessage,
  getMessagesDecrypted,
  getDialogsForUser,
  convId
};
