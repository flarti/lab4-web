import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { pool, initDb } from './db.js';
import authRouter from './routes/auth.js';
import notesRouter from './routes/notes.js';

// Налаштування беруться зі змінних середовища (ENV)
const PORT = process.env.PORT || 3002;
const isProd = process.env.NODE_ENV === 'production';
if (!process.env.DATABASE_URL) throw new Error('Не задано DATABASE_URL');
if (!process.env.SESSION_SECRET) throw new Error('Не задано SESSION_SECRET');

const PgStore = connectPgSimple(session);
const app = express();

// За проксі платформи (Render) потрібно довіряти заголовкам X-Forwarded-*,
// інакше Secure-cookie і ліміти за IP працюватимуть некоректно
if (isProd) app.set('trust proxy', 1);

// ---------- Моніторинг: збір метрик і логування у форматі JSON ----------
const startedAt = Date.now();
const metrics = { requests: 0, totalMs: 0, byStatus: {} };

app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    metrics.requests++;
    metrics.totalMs += ms;
    const group = `${Math.floor(res.statusCode / 100)}xx`;
    metrics.byStatus[group] = (metrics.byStatus[group] || 0) + 1;
    console.log(JSON.stringify({
      time: new Date().toISOString(),
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      ms: Math.round(ms),
    }));
  });
  next();
});

app.use(helmet());

// Перевірка стану (health check) — її викликає платформа та сервіси моніторингу
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'up', uptimeSeconds: Math.round(process.uptime()) });
  } catch {
    res.status(503).json({ status: 'error', db: 'down' });
  }
});

// Метрики продуктивності
app.get('/metrics', (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    environment: process.env.NODE_ENV || 'development',
    node: process.version,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    requests: metrics.requests,
    avgResponseMs: metrics.requests ? +(metrics.totalMs / metrics.requests).toFixed(2) : 0,
    byStatus: metrics.byStatus,
    memoryMB: {
      rss: +(mem.rss / 1048576).toFixed(1),
      heapUsed: +(mem.heapUsed / 1048576).toFixed(1),
    },
  });
});

app.use(express.json({ limit: '10kb' }));

app.use(session({
  store: new PgStore({ pool, createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET,
  name: 'sid',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    secure: isProd,
    maxAge: 60 * 60 * 1000,
  },
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: { error: 'Забагато спроб, спробуйте пізніше' },
});
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);

app.use('/api', authRouter);
app.use('/api/notes', notesRouter);
app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), 'public')));

app.use('/api', (req, res) => res.status(404).json({ error: 'Маршрут не знайдено' }));
app.use((err, req, res, next) => {
  console.error(err);
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Некоректний JSON' });
  res.status(500).json({ error: 'Помилка сервера' });
});

await initDb();
app.listen(PORT, () => console.log(`Сервер запущено на порту ${PORT} (${isProd ? 'production' : 'development'})`));
