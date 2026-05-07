const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');

const RESEND_WEBHOOK_SECRET = 'whsec_/61TGsFVmynvRVWGnL4P4JuGct9AkJ2s';
const RESEND_API_KEY = process.env.RESEND_API_KEY || 're_SyQi85iE_LdjpLzx8sgVFfcHprWjXvZTs';

const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: true,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

// Resend inbound webhook
router.post('/inbound', express.json(), async (req, res) => {
  try {
    const body = req.body;
    console.log('Inbound webhook received, type:', body.type);
    console.log('Full payload:', JSON.stringify(body, null, 2));

    // Resend wraps inbound email under body.data
    if (body.type !== 'email.received') {
      console.log('Not an email.received event, ignoring');
      return res.status(200).json({ ok: true });
    }

    const emailData = body.data || {};
    const emailId  = emailData.email_id;
    const from     = emailData.from     || 'Unknown sender';
    const to       = Array.isArray(emailData.to) ? emailData.to.join(', ') : (emailData.to || 'support@fanlink.info');
    const subject  = emailData.subject  || '(no subject)';

    console.log(`Email from: ${from}, subject: ${subject}, id: ${emailId}`);

    // Get body from webhook payload first, then fallback to API
    let htmlBody = emailData.html || emailData.text || emailData.body || '';
    let textBody = emailData.text || emailData.plain_text || '';

    // If no body in payload, fetch from Resend API
    if (!htmlBody && emailId) {
      try {
        const r = await fetch(`https://api.resend.com/v1/emails/${emailId}`, {
          headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' }
        });
        const full = await r.json();
        console.log('Full email from API:', JSON.stringify(full, null, 2));
        htmlBody = full.html || full.text || full.body || '';
        textBody = full.text || full.plain_text || '';
      } catch(fe) {
        console.error('Failed to fetch email body:', fe.message);
        htmlBody = `<em>Could not load email body. Email ID: ${emailId}</em>`;
      }
    }

    // Forward to admin
    await mailer.sendMail({
      from: process.env.SMTP_FROM,
      to: process.env.ADMIN_EMAIL || 'tez@tez.com',
      replyTo: from,
      subject: `[FanLink Support] ${subject}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;padding:20px">
          <div style="background:#06100a;border-radius:12px;padding:20px;margin-bottom:20px">
            <div style="color:#4ade80;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:4px">New Support Email</div>
            <div style="color:#fff;font-size:18px;font-weight:600">${subject}</div>
          </div>
          <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
            <tr><td style="padding:8px 0;color:#666;width:80px;vertical-align:top">From:</td><td style="padding:8px 0;color:#111"><strong>${from}</strong></td></tr>
            <tr><td style="padding:8px 0;color:#666;vertical-align:top">To:</td><td style="padding:8px 0;color:#111">${to}</td></tr>
          </table>
          <div style="background:#f9f9f9;border-radius:10px;padding:20px;font-size:14px;line-height:1.6;color:#333">
            ${htmlBody || textBody || '<em>No body content</em>'}
          </div>
          <div style="margin-top:16px;padding:12px;background:#e8f5e9;border-radius:8px;font-size:13px;color:#2e7d32">
            💡 Hit Reply to respond directly to <strong>${from}</strong>
          </div>
        </div>
      `,
    });

    console.log('Email forwarded to admin ✅');
    res.status(200).json({ success: true });
  } catch(e) {
    console.error('Inbound email error:', e.message, e.stack);
    res.status(200).json({ error: e.message }); // always 200 so Resend doesn't retry
  }
});

module.exports = router;
