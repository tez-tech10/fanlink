const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();

router.post('/signup', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    const exists = await pool.query('SELECT id FROM users WHERE email=$1', [email.toLowerCase()]);
    if (exists.rows.length) return res.status(400).json({ error: 'Email already registered' });
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      'INSERT INTO users (email,password_hash,name) VALUES ($1,$2,$3) RETURNING id,email,name,plan',
      [email.toLowerCase(), hash, name || '']
    );
    const user = rows[0];
    await pool.query('INSERT INTO pages (user_id,name) VALUES ($1,$2)', [user.id, name || 'My Page']);
    const token = jwt.sign({ id: user.id, email: user.email, plan: user.plan }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

router.post('/signin', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [email.toLowerCase()]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    if (!await bcrypt.compare(password, user.password_hash)) return res.status(401).json({ error: 'Invalid email or password' });
    const token = jwt.sign({ id: user.id, email: user.email, plan: user.plan }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, plan: user.plan } });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.get('/me', auth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id,email,name,plan,promo_expires_at,created_at FROM users WHERE id=$1', [req.user.id]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.post('/promo-request', auth, async (req, res) => {
  const { contact, message } = req.body;
  try {
    await pool.query('INSERT INTO promo_requests (user_id,contact,message) VALUES ($1,$2,$3)', [req.user.id, contact, message]);
    res.json({ success: true, message: 'Request submitted! We will contact you within 24 hours.' });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
