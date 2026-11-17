import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Валідація даних реєстрації на сервері
function validateRegistration({ name, email, password }) {
  const errors = [];
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 50)
    errors.push('Ім’я має містити від 2 до 50 символів');
  if (typeof email !== 'string' || email.length > 254 || !EMAIL_RE.test(email.trim()))
    errors.push('Некоректний email');
  if (typeof password !== 'string' || password.length < 8 || password.length > 72 ||
      !/\p{L}/u.test(password) || !/\d/.test(password))
    errors.push('Пароль: 8–72 символи, щонайменше одна літера і одна цифра');
  return errors;
}

// Захист маршрутів: доступ лише для авторизованих користувачів
export function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Потрібна авторизація' });
  next();
}

const regenerate = (req) =>
  new Promise((resolve, reject) => req.session.regenerate((e) => (e ? reject(e) : resolve())));

router.post('/register', async (req, res) => {
  const body = req.body ?? {};
  const errors = validateRegistration(body);
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });

  const name = body.name.trim();
  const email = body.email.trim().toLowerCase();
  const hash = await bcrypt.hash(body.password, 10); // пароль у відкритому вигляді не зберігається
  try {
    const { rows } = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email',
      [name, email, hash]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Користувач з таким email уже існує' });
    throw err;
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string')
    return res.status(400).json({ error: 'Вкажіть email і пароль' });

  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email.trim().toLowerCase()]);
  const user = rows[0];
  const ok = user && (await bcrypt.compare(password, user.password_hash));
  // Однакове повідомлення, щоб не розкривати, чи існує такий email
  if (!ok) return res.status(401).json({ error: 'Невірний email або пароль' });

  await regenerate(req); // нова сесія після входу (захист від session fixation)
  req.session.userId = user.id;
  res.json({ id: user.id, name: user.name, email: user.email });
});

router.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('sid');
    res.status(204).end();
  });
});

router.get('/me', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT id, name, email FROM users WHERE id = $1', [req.session.userId]);
  if (!rows.length) return res.status(401).json({ error: 'Потрібна авторизація' });
  res.json(rows[0]);
});

export default router;
