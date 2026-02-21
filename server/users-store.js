const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { encrypt, decrypt } = require('./crypto-util');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.enc');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadUsers(secretKey) {
  ensureDataDir();
  if (!fs.existsSync(USERS_FILE)) {
    return [];
  }
  const raw = fs.readFileSync(USERS_FILE);
  const json = decrypt(raw, secretKey);
  return JSON.parse(json);
}

function saveUsers(users, secretKey) {
  ensureDataDir();
  const json = JSON.stringify(users);
  const enc = encrypt(json, secretKey);
  fs.writeFileSync(USERS_FILE, enc);
}

function getUsers(secretKey) {
  return loadUsers(secretKey).map(({ login, displayName }) => ({ login, displayName }));
}

function findUserByLogin(secretKey, login) {
  const users = loadUsers(secretKey);
  return users.find(u => u.login === login) || null;
}

async function addUser(secretKey, login, password, displayName) {
  const users = loadUsers(secretKey);
  if (users.some(u => u.login === login)) {
    throw new Error('User already exists');
  }
  const hash = await bcrypt.hash(password, 10);
  users.push({ login, passwordHash: hash, displayName: displayName || login });
  saveUsers(users, secretKey);
  return { login, displayName: displayName || login };
}

async function updateUser(secretKey, login, { password, displayName }) {
  const users = loadUsers(secretKey);
  const i = users.findIndex(u => u.login === login);
  if (i === -1) throw new Error('User not found');
  if (password) users[i].passwordHash = await bcrypt.hash(password, 10);
  if (displayName !== undefined) users[i].displayName = displayName;
  saveUsers(users, secretKey);
  return { login, displayName: users[i].displayName };
}

function deleteUser(secretKey, login) {
  const users = loadUsers(secretKey).filter(u => u.login !== login);
  saveUsers(users, secretKey);
}

async function verifyUser(secretKey, login, password) {
  const user = findUserByLogin(secretKey, login);
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? { login, displayName: user.displayName } : null;
}

module.exports = {
  getUsers,
  findUserByLogin,
  addUser,
  updateUser,
  deleteUser,
  verifyUser
};
