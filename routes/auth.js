const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const pool = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();

// ── EMAIL TRANSPORTER ──
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.resend.com',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const sendCode = async (email, code) => {
  await transporter.sendMail({
    from: `"FanLink" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to: email,
    subject: `${code} — Your FanLink verification code`,
    html: `
      <div style="background:#050508;color:#f0f0fa;font-family:sans-serif;padding:40px;border-radius:12px;max-width:480px;margin:0 auto">
        <div style="font-size:24px;font-weight:800;color:#00e5a0;margin-bottom:24px">fanlink</div>
        <div style="font-size:18px;font-weight:600;margin-bottom:12px">Your verification code</div>
        <div style="font-size:48px;font-weight:800;letter-spacing:8px;color:#00e5a0;background:#0e0e16;border:1px solid #1c1c2e;border-radius:10px;padding:20px;text-align:center;margin-bottom:20px">${code}</div>
        <div style="color:#6b6b8a;font-size:13px">This code expires in 10 minutes. If you didn't request this, ignore this email.</div>
      </div>`,
  });
};

// ── SEND VERIFICATION CODE ──
router.post('/send-code', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  try {
    // Check if email already registered
    const exists = await pool.query('SELECT id FROM users WHERE email=$1', [email.toLowerCase()]);
    if (exists.rows.length) return res.status(400).json({ error: 'Email already registered' });

    // Generate 6-digit code
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Delete any old codes for this email
    await pool.query('DELETE FROM verification_codes WHERE email=$1', [email.toLowerCase()]);

    // Save new code
    await pool.query(
      'INSERT INTO verification_codes (email, code, expires_at) VALUES ($1,$2,$3)',
      [email.toLowerCase(), code, expires]
    );

    // Send email
    await sendCode(email, code);
    res.json({ success: true, message: 'Code sent to your email!' });
  } catch (e) {
    console.error('send-code error:', e.message);
    res.status(500).json({ error: 'Failed to send code: ' + e.message });
  }
});

// ── SIGN UP (requires verified code) ──
router.post('/signup', async (req, res) => {
  const { email, password, name, code } = req.body;
  if (!email || !password || !code) return res.status(400).json({ error: 'Email, password and code required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  try {
    // Verify code
    const codeRow = await pool.query(
      'SELECT * FROM verification_codes WHERE email=$1 AND code=$2 AND used=false AND expires_at > NOW()',
      [email.toLowerCase(), code]
    );
    if (!codeRow.rows.length) return res.status(400).json({ error: 'Invalid or expired code' });

    // Check email not already registered
    const exists = await pool.query('SELECT id FROM users WHERE email=$1', [email.toLowerCase()]);
    if (exists.rows.length) return res.status(400).json({ error: 'Email already registered' });

    // Create user
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      'INSERT INTO users (email,password_hash,name) VALUES ($1,$2,$3) RETURNING id,email,name,plan,is_admin',
      [email.toLowerCase(), hash, name || '']
    );
    const user = rows[0];

    // Create page
    await pool.query('INSERT INTO pages (user_id,name) VALUES ($1,$2)', [user.id, name || 'My Page']);

    // Mark code used
    await pool.query('UPDATE verification_codes SET used=true WHERE id=$1', [codeRow.rows[0].id]);

    const token = jwt.sign({ id: user.id, email: user.email, plan: user.plan, is_admin: user.is_admin }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user });
  } catch (e) {
    console.error('signup error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── SIGN IN ──
router.post('/signin', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [email.toLowerCase()]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    if (!await bcrypt.compare(password, user.password_hash)) return res.status(401).json({ error: 'Invalid email or password' });
    const token = jwt.sign(
      { id: user.id, email: user.email, plan: user.plan, is_admin: user.is_admin, account_type: user.account_type },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, plan: user.plan, is_admin: user.is_admin, account_type: user.account_type||'creator' } });
  } catch (e) {
    console.error('signin error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── GET ME ──
router.get('/me', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id,email,name,plan,promo_expires_at,created_at,is_admin,account_type FROM users WHERE id=$1',
      [req.user.id]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PROMO REQUEST ──
router.post('/promo-request', auth, async (req, res) => {
  const { contact, message } = req.body;
  try {
    await pool.query('INSERT INTO promo_requests (user_id,contact,message) VALUES ($1,$2,$3)', [req.user.id, contact, message]);
    res.json({ success: true, message: 'Request submitted! We will contact you within 24 hours.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
