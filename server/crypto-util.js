const crypto = require('crypto');

const ALG = 'aes-256-gcm';
const IV_LEN = 16;
const AUTH_TAG_LEN = 16;
const SALT_LEN = 32;
const KEY_LEN = 32;

function deriveKey(secret, salt) {
  return crypto.pbkdf2Sync(secret, salt, 100000, KEY_LEN, 'sha256');
}

function encrypt(plaintext, secret) {
  const salt = crypto.randomBytes(SALT_LEN);
  const key = deriveKey(secret, salt);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, tag, enc]);
}

function decrypt(ciphertext, secret) {
  if (!Buffer.isBuffer(ciphertext) || ciphertext.length < SALT_LEN + IV_LEN + AUTH_TAG_LEN) {
    throw new Error('Invalid ciphertext');
  }
  const salt = ciphertext.subarray(0, SALT_LEN);
  const iv = ciphertext.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const tag = ciphertext.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + AUTH_TAG_LEN);
  const enc = ciphertext.subarray(SALT_LEN + IV_LEN + AUTH_TAG_LEN);
  const key = deriveKey(secret, salt);
  const decipher = crypto.createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(enc) + decipher.final('utf8');
}

function generateDynamicKey() {
  return crypto.randomBytes(KEY_LEN);
}

function encryptMessage(plaintext, keyBuffer) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALG, keyBuffer, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv: iv.toString('base64'), tag: tag.toString('base64'), data: enc.toString('base64') };
}

function decryptMessage(encObj, keyBuffer) {
  const iv = Buffer.from(encObj.iv, 'base64');
  const tag = Buffer.from(encObj.tag, 'base64');
  const data = Buffer.from(encObj.data, 'base64');
  const decipher = crypto.createDecipheriv(ALG, keyBuffer, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data) + decipher.final('utf8');
}

module.exports = {
  encrypt,
  decrypt,
  generateDynamicKey,
  encryptMessage,
  decryptMessage,
  KEY_LEN
};
