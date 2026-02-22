const API = '/api';

const EMOJI_LIST = ['😀','😃','😄','😁','😅','😂','🤣','😊','😇','🙂','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','😐','😑','😶','🙄','😏','😣','😥','😮','🤐','😯','😪','😫','😴','🤤','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','👍','👎','👌','✌️','🤞','🤟','🤘','🤙','👋','🤚','🖐️','✋','🖖','👏','🙌','🤲','🤝','🙏','❤️','🧡','💛','💚','💙','💜','🖤','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','🔥','⭐','🌟','✨','💫','🎉','🎊','🎈','🎁','🏆','🥇','🥈','🥉'];

const STICKERS = [
  { id: '1', emoji: '😀' }, { id: '2', emoji: '😎' }, { id: '3', emoji: '🎉' }, { id: '4', emoji: '❤️' },
  { id: '5', emoji: '👍' }, { id: '6', emoji: '🔥' }, { id: '7', emoji: '😢' }, { id: '8', emoji: '🎈' },
  { id: '9', emoji: '🌟' }, { id: '10', emoji: '👋' }, { id: '11', emoji: '🤔' }, { id: '12', emoji: '😴' }
];

let currentUser = null;
let currentContact = null;
let contacts = [];
let messagesCache = {};
let pollTimer = null;
const POLL_INTERVAL_MS = 4000;

function show(el) {
  el.classList.remove('hidden');
}
function hide(el) {
  el.classList.add('hidden');
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startPolling() {
  stopPolling();
  if (!currentContact) return;
  pollTimer = setInterval(() => {
    if (document.visibilityState === 'hidden') return;
    if (!currentContact) return;
    loadMessages(true);
  }, POLL_INTERVAL_MS);
}

function showLogin() {
  stopPolling();
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('main-screen').classList.add('hidden');
  currentUser = null;
  currentContact = null;
  contacts = [];
  messagesCache = {};
}

function showMain() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('main-screen').classList.remove('hidden');
  document.getElementById('current-user-name').textContent = currentUser.displayName || currentUser.login;
  const adminBtn = document.getElementById('btn-admin');
  if (currentUser.admin) {
    adminBtn.classList.remove('hidden');
  } else {
    adminBtn.classList.add('hidden');
  }
  loadContacts();
}

async function api(path, options = {}) {
  const res = await fetch(API + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    credentials: 'include'
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  const login = document.getElementById('login-input').value.trim();
  const password = document.getElementById('password-input').value;
  try {
    const { user } = await api('/login', {
      method: 'POST',
      body: JSON.stringify({ login, password })
    });
    currentUser = user;
    showMain();
  } catch (err) {
    errEl.textContent = err.message || 'Ошибка входа';
  }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  await api('/logout', { method: 'POST' }).catch(() => {});
  showLogin();
});

async function loadContacts() {
  const { contacts: list } = await api('/contacts');
  contacts = list;
  renderContacts();
}

let allUsers = [];

async function loadAllUsers() {
  const { users } = await api('/users');
  allUsers = users;
  renderNewChatList();
}

function renderNewChatList(filter = '') {
  const listEl = document.getElementById('new-chat-user-list');
  const q = filter.toLowerCase();
  const contactLogins = new Set(contacts.map(c => c.login));
  const filtered = allUsers.filter(
    u =>
      (u.displayName || u.login).toLowerCase().includes(q) ||
      u.login.toLowerCase().includes(q)
  );
  listEl.innerHTML = filtered
    .map(
      u =>
        `<li data-login="${escapeAttr(u.login)}" data-display-name="${escapeAttr(u.displayName || u.login)}">
          <span class="user-avatar">${(u.displayName || u.login).charAt(0).toUpperCase()}</span>
          <div class="contact-info">
            <div class="contact-name">${escapeHtml(u.displayName || u.login)}</div>
            <div class="contact-login">@${escapeHtml(u.login)}</div>
          </div>
          ${contactLogins.has(u.login) ? '<span class="contact-badge">есть диалог</span>' : ''}
        </li>`
    )
    .join('');
  listEl.querySelectorAll('li').forEach(li => {
    li.addEventListener('click', () => {
      const login = li.dataset.login;
      const displayName = li.dataset.displayName || login;
      if (!contacts.some(c => c.login === login)) {
        contacts.push({ login, displayName });
      }
      hide(document.getElementById('new-chat-modal'));
      selectContact(login);
      renderContacts();
    });
  });
}

function renderContacts(filter = '') {
  const listEl = document.getElementById('contact-list');
  const q = filter.toLowerCase();
  const filtered = contacts.filter(
    c =>
      (c.displayName || c.login).toLowerCase().includes(q) ||
      c.login.toLowerCase().includes(q)
  );
  listEl.innerHTML = filtered
    .map(
      c =>
        `<li data-login="${escapeAttr(c.login)}">
          <span class="contact-avatar">${(c.displayName || c.login).charAt(0).toUpperCase()}</span>
          <div class="contact-info">
            <div class="contact-name">${escapeHtml(c.displayName || c.login)}</div>
            <div class="contact-login">@${escapeHtml(c.login)}</div>
          </div>
        </li>`
    )
    .join('');

  listEl.querySelectorAll('li').forEach(li => {
    li.addEventListener('click', () => selectContact(li.dataset.login));
  });

  const active = listEl.querySelector(`li[data-login="${escapeAttr(currentContact && currentContact.login)}"]`);
  if (active) active.classList.add('active');
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;');
}

function selectContact(login) {
  const c = contacts.find(x => x.login === login);
  if (!c) return;
  currentContact = c;
  document.querySelectorAll('#contact-list li.active').forEach(el => el.classList.remove('active'));
  const li = document.querySelector(`#contact-list li[data-login="${escapeAttr(login)}"]`);
  if (li) li.classList.add('active');

  hide(document.getElementById('chat-placeholder'));
  show(document.getElementById('chat-active'));
  document.getElementById('main-screen').classList.add('mobile-chat-open');
  document.getElementById('chat-contact-name').textContent = c.displayName || c.login;
  closePickerPanels();
  loadMessages(false);
  startPolling();
  document.getElementById('message-input').focus();
}

async function loadMessages(silent) {
  if (!currentContact) return;
  const { messages } = await api(`/messages/${encodeURIComponent(currentContact.login)}`);
  messagesCache[currentContact.login] = messages;
  renderMessages(silent);
}

function parseMessageContent(text) {
  try {
    const o = JSON.parse(text);
    if (o && o.type === 'sticker' && o.id) return { type: 'sticker', id: o.id };
  } catch (_) {}
  return { type: 'text', text };
}

function getStickerEmoji(id) {
  const s = STICKERS.find(x => x.id === id);
  return s ? s.emoji : '❓';
}

function renderMessages(keepScroll) {
  if (!currentContact) return;
  const messages = messagesCache[currentContact.login] || [];
  const container = document.getElementById('messages-container');
  const me = currentUser.login;
  const wasAtBottom = !keepScroll || container.scrollHeight - container.scrollTop - container.clientHeight < 50;
  container.innerHTML = messages
    .map(m => {
      const isOut = m.from === me;
      const time = new Date(m.ts).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
      const content = parseMessageContent(m.text);
      let body = '';
      if (content.type === 'sticker') {
        body = `<div class="msg-sticker">${escapeHtml(getStickerEmoji(content.id))}</div>`;
      } else {
        body = `<div>${escapeHtml(content.text)}</div>`;
      }
      return `<div class="msg ${isOut ? 'out' : 'in'}">
        ${body}
        <div class="msg-time">${escapeHtml(time)}</div>
      </div>`;
    })
    .join('');
  if (wasAtBottom) container.scrollTop = container.scrollHeight;
}

function sendMessage(textPayload) {
  if (!currentContact) return Promise.reject(new Error('No contact'));
  return api('/messages', {
    method: 'POST',
    body: JSON.stringify({ to: currentContact.login, text: textPayload })
  });
}

document.getElementById('send-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('message-input');
  const text = input.value.trim();
  if (!text || !currentContact) return;
  try {
    const { message } = await sendMessage(text);
    input.value = '';
    if (message && currentContact) {
      const list = messagesCache[currentContact.login] || [];
      messagesCache[currentContact.login] = [...list, { id: message.id, from: message.from, to: message.to, text: message.text, ts: message.ts }];
      renderMessages(false);
    }
    setTimeout(() => input.focus(), 0);
    setTimeout(() => loadContacts(), 500);
  } catch (err) {
    alert(err.message || 'Ошибка отправки');
  }
});

function closePickerPanels() {
  document.getElementById('emoji-panel').classList.add('hidden');
  document.getElementById('sticker-panel').classList.add('hidden');
}

function buildEmojiPanel() {
  const panel = document.getElementById('emoji-panel');
  if (panel.dataset.built) return;
  panel.innerHTML = EMOJI_LIST.map(emoji =>
    `<button type="button" class="emoji-btn" data-emoji="${escapeAttr(emoji)}">${escapeHtml(emoji)}</button>`
  ).join('');
  panel.querySelectorAll('.emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById('message-input');
      input.value += btn.dataset.emoji;
      input.focus();
    });
  });
  panel.dataset.built = '1';
}

function buildStickerPanel() {
  const panel = document.getElementById('sticker-panel');
  if (panel.dataset.built) return;
  panel.innerHTML = STICKERS.map(s =>
    `<button type="button" class="sticker-btn" data-id="${escapeAttr(s.id)}" title="Отправить стикер">${escapeHtml(s.emoji)}</button>`
  ).join('');
  panel.querySelectorAll('.sticker-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!currentContact) return;
      const payload = JSON.stringify({ type: 'sticker', id: btn.dataset.id });
      try {
        const { message } = await sendMessage(payload);
        closePickerPanels();
        if (message && currentContact) {
          const list = messagesCache[currentContact.login] || [];
          messagesCache[currentContact.login] = [...list, { id: message.id, from: message.from, to: message.to, text: message.text, ts: message.ts }];
          renderMessages(false);
        }
        setTimeout(() => document.getElementById('message-input').focus(), 0);
        setTimeout(() => loadContacts(), 500);
      } catch (err) {
        alert(err.message || 'Ошибка');
      }
    });
  });
  panel.dataset.built = '1';
}

document.getElementById('btn-emoji').addEventListener('click', () => {
  const emojiPanel = document.getElementById('emoji-panel');
  const stickerPanel = document.getElementById('sticker-panel');
  if (emojiPanel.classList.contains('hidden')) {
    buildEmojiPanel();
    stickerPanel.classList.add('hidden');
    emojiPanel.classList.remove('hidden');
  } else {
    emojiPanel.classList.add('hidden');
  }
});

document.getElementById('btn-sticker').addEventListener('click', () => {
  const stickerPanel = document.getElementById('sticker-panel');
  const emojiPanel = document.getElementById('emoji-panel');
  if (stickerPanel.classList.contains('hidden')) {
    buildStickerPanel();
    emojiPanel.classList.add('hidden');
    stickerPanel.classList.remove('hidden');
  } else {
    stickerPanel.classList.add('hidden');
  }
});

document.getElementById('btn-chat-back').addEventListener('click', () => {
  stopPolling();
  document.getElementById('main-screen').classList.remove('mobile-chat-open');
  hide(document.getElementById('chat-active'));
  show(document.getElementById('chat-placeholder'));
  currentContact = null;
  document.querySelectorAll('#contact-list li.active').forEach(el => el.classList.remove('active'));
  closePickerPanels();
});

document.getElementById('contact-search').addEventListener('input', e => {
  renderContacts(e.target.value);
});

const newChatModal = document.getElementById('new-chat-modal');
document.getElementById('btn-new-chat').addEventListener('click', () => {
  show(newChatModal);
  loadAllUsers();
  document.getElementById('new-chat-search').value = '';
  document.getElementById('new-chat-search').focus();
});
document.getElementById('new-chat-modal-close').addEventListener('click', () => hide(newChatModal));
newChatModal.addEventListener('click', e => {
  if (e.target === newChatModal) hide(newChatModal);
});
document.getElementById('new-chat-search').addEventListener('input', e => {
  renderNewChatList(e.target.value);
});

// ——— Admin ———
const adminModal = document.getElementById('admin-modal');
document.getElementById('btn-admin').addEventListener('click', () => {
  show(adminModal);
  loadAdminUsers();
});
document.getElementById('admin-modal-close').addEventListener('click', () => {
  hide(adminModal);
});
adminModal.addEventListener('click', e => {
  if (e.target === adminModal) hide(adminModal);
});

async function loadAdminUsers() {
  const { users } = await api('/admin/users');
  const listEl = document.getElementById('admin-user-list');
  listEl.innerHTML = users
    .map(
      u =>
        `<li data-login="${escapeAttr(u.login)}">
          <div>
            <span class="user-login">${escapeHtml(u.login)}</span>
            <span class="user-display">${escapeHtml(u.displayName || '')}</span>
          </div>
          <div class="user-actions">
            <button type="button" class="btn-small edit-user">Изменить</button>
            <button type="button" class="btn-small danger delete-user">Удалить</button>
          </div>
        </li>`
    )
    .join('');

  listEl.querySelectorAll('.delete-user').forEach(btn => {
    btn.addEventListener('click', async () => {
      const login = btn.closest('li').dataset.login;
      if (!confirm(`Удалить пользователя ${login}?`)) return;
      await api(`/admin/users/${encodeURIComponent(login)}`, { method: 'DELETE' });
      loadAdminUsers();
      loadContacts();
    });
  });

  listEl.querySelectorAll('.edit-user').forEach(btn => {
    btn.addEventListener('click', () => {
      const login = btn.closest('li').dataset.login;
      const newPass = prompt('Новый пароль (оставьте пусто, чтобы не менять):');
      if (newPass === null) return;
      const newName = prompt('Новое отображаемое имя (оставьте пусто, чтобы не менять):');
      api(`/admin/users/${encodeURIComponent(login)}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...(newPass ? { password: newPass } : {}),
          ...(newName !== null && newName !== undefined ? { displayName: newName } : {})
        })
      })
        .then(() => loadAdminUsers())
        .catch(err => alert(err.message));
    });
  });
}

document.getElementById('admin-add-user').addEventListener('submit', async (e) => {
  e.preventDefault();
  const login = document.getElementById('new-login').value.trim();
  const password = document.getElementById('new-password').value;
  const displayName = document.getElementById('new-displayname').value.trim();
  if (!login || !password) return;
  try {
    await api('/admin/users', {
      method: 'POST',
      body: JSON.stringify({ login, password, displayName: displayName || undefined })
    });
    document.getElementById('new-login').value = '';
    document.getElementById('new-password').value = '';
    document.getElementById('new-displayname').value = '';
    loadAdminUsers();
    loadContacts();
  } catch (err) {
    alert(err.message || 'Ошибка');
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && currentContact) {
    loadMessages(true);
  }
});

// Initial check
api('/me')
  .then(({ user }) => {
    currentUser = user;
    showMain();
  })
  .catch(() => showLogin());
