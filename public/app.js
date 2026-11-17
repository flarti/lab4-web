const $ = (id) => document.getElementById(id);

// Безпечна робота з localStorage (може бути недоступне)
const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch {} },
  remove(key) { try { localStorage.removeItem(key); } catch {} },
};

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || 'Помилка запиту');
  return data;
}

function message(text, isError = false) {
  const el = $('message');
  el.textContent = text; // textContent, а не innerHTML — захист від XSS
  el.className = isError ? 'error' : 'ok';
}

// ---------- Тема (localStorage) ----------
function applyTheme(theme) { document.body.classList.toggle('dark', theme === 'dark'); }
applyTheme(store.get('theme'));
$('themeBtn').addEventListener('click', () => {
  const next = document.body.classList.contains('dark') ? 'light' : 'dark';
  store.set('theme', next);
  applyTheme(next);
});

// ---------- Чернетки форм (localStorage) ----------
const registerForm = $('registerForm');
const noteForm = $('noteForm');

const draft = JSON.parse(store.get('draft:register') || '{}');
registerForm.elements.name.value = draft.name || '';
registerForm.elements.email.value = draft.email || '';
// пароль у сховищі не зберігаємо
registerForm.addEventListener('input', () => {
  store.set('draft:register', JSON.stringify({ name: registerForm.elements.name.value, email: registerForm.elements.email.value }));
});

noteForm.text.value = store.get('draft:note') || '';
noteForm.text.addEventListener('input', () => store.set('draft:note', noteForm.text.value));

// ---------- Відображення станів ----------
function showGuest() { $('guest').hidden = false; $('dashboard').hidden = true; }

async function showUser(user) {
  $('guest').hidden = true;
  $('dashboard').hidden = false;
  $('welcome').textContent = `Вітаємо, ${user.name}! (${user.email})`;
  renderNotes(await api('/api/notes'));
}

function renderNotes(notes) {
  const list = $('notes');
  list.replaceChildren();
  if (!notes.length) {
    const li = document.createElement('li');
    li.textContent = 'Нотаток ще немає.';
    list.append(li);
    return;
  }
  for (const n of notes) {
    const li = document.createElement('li');
    li.textContent = `${new Date(n.created_at).toLocaleString('uk-UA')} — ${n.text}`;
    list.append(li);
  }
}

// ---------- Реєстрація ----------
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(registerForm));
  if (!/[A-Za-zА-Яа-яІіЇїЄєҐґ]/.test(data.password) || !/\d/.test(data.password)) {
    return message('Пароль має містити щонайменше одну літеру і одну цифру', true);
  }
  try {
    await api('/api/register', { method: 'POST', body: JSON.stringify(data) });
    store.remove('draft:register');
    $('loginForm').email.value = data.email;
    registerForm.reset();
    message('Реєстрація успішна. Тепер увійдіть.');
  } catch (err) { message(err.message, true); }
});

// ---------- Вхід / вихід ----------
$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  try {
    const user = await api('/api/login', { method: 'POST', body: JSON.stringify(data) });
    e.target.reset();
    message('');
    await showUser(user);
  } catch (err) { message(err.message, true); }
});

$('logoutBtn').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  showGuest();
  message('Ви вийшли з акаунта.');
});

// ---------- Нотатки ----------
noteForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/notes', { method: 'POST', body: JSON.stringify({ text: noteForm.text.value }) });
    noteForm.reset();
    store.remove('draft:note');
    renderNotes(await api('/api/notes'));
    message('');
  } catch (err) { message(err.message, true); }
});

// ---------- Перевірка сесії під час відкриття сторінки ----------
api('/api/me').then(showUser).catch(showGuest);
