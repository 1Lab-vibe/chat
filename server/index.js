require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const usersStore = require('./users-store');
const messagesStore = require('./messages-store');
const { requireAuth, requireAdmin } = require('./middleware');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const SECRET = process.env.SECRET_KEY || 'default_secret_change_in_env_32ch!!';
const ADMIN_LOGIN = process.env.ADMIN_LOGIN || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

if (SECRET.length < 32) {
  console.warn('SECRET_KEY should be at least 32 characters for AES-256');
}

app.use(cookieParser());
app.use(express.json());
app.use(
  session({
    secret: SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 }
  })
);

app.use(express.static(path.join(__dirname, '..', 'public')));

// ——— Auth ———
app.post('/api/login', async (req, res) => {
  const { login, password } = req.body || {};
  if (!login || !password) {
    return res.status(400).json({ error: 'Login and password required' });
  }
  if (login === ADMIN_LOGIN && password === ADMIN_PASSWORD) {
    req.session.user = { login: ADMIN_LOGIN, displayName: 'Admin', admin: true };
    return res.json({ user: req.session.user });
  }
  const user = await usersStore.verifyUser(SECRET, login, password);
  if (!user) {
    return res.status(401).json({ error: 'Invalid login or password' });
  }
  req.session.user = { ...user, admin: false };
  res.json({ user: req.session.user });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ user: req.session.user });
});

// ——— Contacts: only users with whom current user has a dialog (P2P, personalized) ———
app.get('/api/contacts', requireAuth, (req, res) => {
  const me = req.session.user.login;
  const dialogs = messagesStore.getDialogsForUser(me);
  const allUsers = usersStore.getUsers(SECRET);
  const byLogin = Object.fromEntries(allUsers.map(u => [u.login, u.displayName]));
  const contacts = dialogs.map(({ login, lastTs }) => ({
    login,
    displayName: byLogin[login] || login,
    lastTs
  }));
  res.json({ contacts });
});

// ——— All users (for "New chat" only; excludes current user) ———
app.get('/api/users', requireAuth, (req, res) => {
  const all = usersStore.getUsers(SECRET);
  const me = req.session.user.login;
  const users = all.filter(u => u.login !== me).map(u => ({ login: u.login, displayName: u.displayName }));
  res.json({ users });
});

// ——— Messages ———
app.get('/api/messages/:contact', requireAuth, (req, res) => {
  const contact = req.params.contact;
  const me = req.session.user.login;
  const list = messagesStore.getMessagesDecrypted(SECRET, me, contact);
  res.json({ messages: list });
});

app.post('/api/messages', requireAuth, (req, res) => {
  const { to, text } = req.body || {};
  if (!to || text == null) {
    return res.status(400).json({ error: 'to and text required' });
  }
  const from = req.session.user.login;
  const msg = messagesStore.addMessage(SECRET, from, to, String(text));
  res.json({ message: msg });
});

// ——— Admin: users ———
app.get('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  res.json({ users: usersStore.getUsers(SECRET) });
});

app.post('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  const { login, password, displayName } = req.body || {};
  if (!login || !password) {
    return res.status(400).json({ error: 'login and password required' });
  }
  try {
    const user = await usersStore.addUser(SECRET, login, password, displayName);
    res.json({ user });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/admin/users/:login', requireAuth, requireAdmin, async (req, res) => {
  const { login } = req.params;
  const { password, displayName } = req.body || {};
  try {
    const user = await usersStore.updateUser(SECRET, login, { password, displayName });
    res.json({ user });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/admin/users/:login', requireAuth, requireAdmin, (req, res) => {
  const { login } = req.params;
  if (login === ADMIN_LOGIN) {
    return res.status(400).json({ error: 'Cannot delete admin' });
  }
  usersStore.deleteUser(SECRET, login);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
