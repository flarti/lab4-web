import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from './auth.js';

const router = Router();
router.use(requireAuth);

// Користувач бачить лише власні нотатки
router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, text, created_at FROM notes WHERE user_id = $1 ORDER BY id DESC',
    [req.session.userId]);
  res.json(rows);
});

router.post('/', async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (text.length < 1 || text.length > 500)
    return res.status(400).json({ error: 'Нотатка має містити від 1 до 500 символів' });
  const { rows } = await pool.query(
    'INSERT INTO notes (user_id, text) VALUES ($1, $2) RETURNING id, text, created_at',
    [req.session.userId, text]);
  res.status(201).json(rows[0]);
});

export default router;
