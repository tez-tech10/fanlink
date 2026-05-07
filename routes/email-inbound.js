const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');

const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: true,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

// Resend inbound webhook
router.post('/inbound', express.json(), async (req, res) => {
  try {
    const data = req.body;
    console.log('Inbound email received:', JSON.stringify(data, null, 2));

    const from    = data.from || 'Unknown sender';
    const to      = data.to || 'support@fanlink.info';
    const subject = data.subject || '(no subject)';
    const text    = data.text || '';
    const html    = data.html || text;

    // Forward to your personal email
    await mailer.sendMail({
      from: process.env.SMTP_FROM,
      to: 'tez@tez.com', // your admin email - change this
      replyTo: from,     // so you can reply directly
      subject: `[FanLink Support] ${subject}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;padding:20px">
          <div style="background:#06100a;border-radius:12px;padding:20px;margin-bottom:20px">
            <div style="color:#4ade80;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:4px">New Support Email</div>
            <div style="color:#fff;font-size:18px;font-weight:600">${subject}</div>
          </div>
          <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
            <tr><td style="padding:8px 0;color:#666;width:80px">From:</td><td style="padding:8px 0;color:#111"><strong>${from}</strong></td></tr>
            <tr><td style="padding:8px 0;color:#666">To:</td><td style="padding:8px 0;color:#111">${to}</td></tr>
          </table>
          <div style="background:#f9f9f9;border-radius:10px;padding:20px;white-space:pre-wrap;font-size:14px;line-height:1.6;color:#333">${html}</div>
          <div style="margin-top:16px;padding:12px;background:#e8f5e9;border-radius:8px;font-size:13px;color:#2e7d32">
            💡 Hit Reply to respond directly to <strong>${from}</strong>
          </div>
        </div>
      `,
    });

    console.log('Email forwarded to admin ✅');
    res.status(200).json({ success: true });
  } catch(e) {
    console.error('Inbound email error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
