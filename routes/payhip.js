const express = require('express');
const pool = require('../db');
const router = express.Router();
const nodemailer = require('nodemailer');

const PAYHIP_API_KEY = '07900bf5d914d91ed5bb97fb13708a53a547afef';

const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: true,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

const sendEmail = async (to, subject, html) => {
  try { await mailer.sendMail({ from: process.env.SMTP_FROM, to, subject, html }); }
  catch(e) { console.error('Email error:', e.message); }
};

// Payhip webhook
router.post('/webhook', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const { buyer_email, security, product_title } = req.body;
    console.log('Payhip webhook body:', req.body);
    if (security !== PAYHIP_API_KEY) return res.status(401).send('Unauthorized');
    if (!buyer_email) return res.status(400).send('No email');

    const { rows } = await pool.query('SELECT id,name,email FROM users WHERE LOWER(email)=$1', [buyer_email.toLowerCase().trim()]);
    if (!rows.length) { console.error('User not found:', buyer_email); return res.status(200).send('User not found'); }
    const user = rows[0];

    const isYearly = (product_title||'').toLowerCase().includes('year') || (req.body.product_id||'').includes('anFfQ');
    const expiresAt = new Date();
    isYearly ? expiresAt.setFullYear(expiresAt.getFullYear()+1) : expiresAt.setMonth(expiresAt.getMonth()+1);

    await pool.query("UPDATE users SET plan='premium', promo_expires_at=$1 WHERE id=$2", [expiresAt.toISOString(), user.id]);

    const planLabel = isYearly ? '1 Year Basic Plan' : '1 Month Basic Plan';
    const expiryStr = expiresAt.toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});

    await sendEmail(user.email, '✅ FanLink Basic Activated!', `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#06100a;color:#e8f0ea;padding:32px;border-radius:16px">
        <h1 style="font-family:Georgia,serif;font-size:28px;font-weight:400;color:#4ade80;margin-bottom:8px">Welcome to FanLink Basic!</h1>
        <p style="color:rgba(255,255,255,.6);margin-bottom:24px">Hi ${user.name||user.email}, your payment was confirmed.</p>
        <div style="background:rgba(74,222,128,.08);border:1px solid rgba(74,222,128,.2);border-radius:12px;padding:20px;margin-bottom:24px">
          <div style="font-size:14px;color:rgba(255,255,255,.5);margin-bottom:4px">Plan activated</div>
          <div style="font-size:20px;font-weight:700;color:#4ade80;margin-bottom:8px">${planLabel}</div>
          <div style="font-size:14px;color:rgba(255,255,255,.5)">Active until: <strong style="color:#fff">${expiryStr}</strong></div>
        </div>
        <ul style="font-size:14px;color:rgba(255,255,255,.7);line-height:1.8;padding-left:20px">
          <li>Public fanlink.info/you link</li><li>Unlimited tracking + deep links</li>
          <li>Custom domain</li><li>All themes & full analytics</li><li>Agency access</li>
        </ul>
        <a href="https://fanlink.info" style="display:block;margin-top:24px;background:#4ade80;color:#000;text-decoration:none;padding:14px;border-radius:10px;text-align:center;font-weight:700">Go to Dashboard →</a>
      </div>`);

    res.status(200).send('OK');
  } catch(e) { console.error('Webhook error:', e.message); res.status(500).send('Error'); }
});

// Check expiring — call daily
router.get('/check-expiring', async (req, res) => {
  if (req.query.key !== PAYHIP_API_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const now = new Date();
    const in5 = new Date(now); in5.setDate(now.getDate()+5);
    const in4 = new Date(now); in4.setDate(now.getDate()+4);
    const { rows } = await pool.query(
      `SELECT id,name,email,promo_expires_at FROM users WHERE plan='premium' AND promo_expires_at BETWEEN $1 AND $2`,
      [in4.toISOString(), in5.toISOString()]
    );
    let sent = 0;
    for (const u of rows) {
      const d = new Date(u.promo_expires_at).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
      await sendEmail(u.email, '⚠️ FanLink subscription expires in 5 days', `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#06100a;color:#e8f0ea;padding:32px;border-radius:16px">
          <h1 style="font-family:Georgia,serif;font-size:24px;font-weight:400;color:#f59e0b">Your subscription expires soon</h1>
          <p style="color:rgba(255,255,255,.6)">Hi ${u.name||u.email}, your FanLink Basic plan expires on <strong style="color:#fff">${d}</strong>.</p>
          <p style="font-size:14px;color:rgba(255,255,255,.6);margin-bottom:24px">Renew now to keep your public link and all premium features active.</p>
          <a href="https://payhip.com/buy?link%5B%5D=lv46o&s=1" style="display:block;background:#4ade80;color:#000;text-decoration:none;padding:13px;border-radius:10px;text-align:center;font-weight:700;margin-bottom:10px">Renew Monthly — $29.99</a>
          <a href="https://payhip.com/buy?link%5B%5D=anFfQ&s=1" style="display:block;background:rgba(74,222,128,.1);color:#4ade80;border:1px solid rgba(74,222,128,.3);text-decoration:none;padding:13px;border-radius:10px;text-align:center;font-weight:700">Renew Yearly — $249.99 (save $110)</a>
        </div>`);
      sent++;
    }
    res.json({ checked: rows.length, sent });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
