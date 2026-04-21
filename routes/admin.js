const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();

const adminOnly = async (req, res, next) => {
  const { rows } = await pool.query('SELECT is_admin FROM users WHERE id=$1', [req.user.id]);
  if (!rows[0]?.is_admin) return res.status(403).json({ error: 'Admin access required' });
  next();
};

// Stats
router.get('/stats', auth, adminOnly, async (req, res) => {
  try {
    const total = await pool.query('SELECT COUNT(*) FROM users');
    const premium = await pool.query("SELECT COUNT(*) FROM users WHERE plan='premium' OR promo_expires_at > NOW()");
    const pages = await pool.query('SELECT COUNT(*) FROM pages WHERE is_published=true');
    const banned = await pool.query("SELECT COUNT(*) FROM users WHERE is_banned=true");
    res.json({
      total_users: parseInt(total.rows[0].count),
      premium_users: parseInt(premium.rows[0].count),
      published_pages: parseInt(pages.rows[0].count),
      banned_users: parseInt(banned.rows[0].count),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get all users
router.get('/users', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.name, u.plan, u.promo_expires_at, u.created_at, u.is_banned, u.is_admin,
       p.username, p.is_published
       FROM users u LEFT JOIN pages p ON p.user_id=u.id
       ORDER BY u.created_at DESC`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Set premium
router.put('/users/:id/premium', auth, adminOnly, async (req, res) => {
  const { plan, promo_expires_at } = req.body;
  try {
    const { rows } = await pool.query(
      'UPDATE users SET plan=$1, promo_expires_at=$2 WHERE id=$3 RETURNING id,email,name,plan,promo_expires_at',
      [plan || 'premium', promo_expires_at || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Ban / unban user
router.put('/users/:id/ban', auth, adminOnly, async (req, res) => {
  const { banned } = req.body;
  try {
    const { rows } = await pool.query(
      'UPDATE users SET is_banned=$1 WHERE id=$2 RETURNING id,email,is_banned',
      [banned, req.params.id]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete user
router.delete('/users/:id', auth, adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Impersonate user — returns a token for that user
router.post('/users/:id/impersonate', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id,email,name,plan,is_admin FROM users WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    const u = rows[0];
    const token = jwt.sign(
      { id: u.id, email: u.email, plan: u.plan, is_admin: u.is_admin, impersonated_by: req.user.id },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );
    res.json({ token, user: u });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Promo requests
router.get('/promo-requests', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT pr.*, u.email, u.name FROM promo_requests pr JOIN users u ON u.id=pr.user_id ORDER BY pr.created_at DESC'
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
