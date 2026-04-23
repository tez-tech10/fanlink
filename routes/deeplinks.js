const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();

// Generate random 12-char code
const genCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let code = '';
  for(let i=0;i<12;i++) code += chars[Math.floor(Math.random()*chars.length)];
  return code;
};

const DEEP_PLATFORMS = ['onlyfans','fansly','manyvids'];

// Create or get deep link for a URL
router.post('/', auth, async (req, res) => {
  const { url, link_id } = req.body;
  if(!url) return res.status(400).json({ error: 'URL required' });
  try {
    // Check if deep link already exists for this link_id
    if(link_id) {
      const { rows: existing } = await pool.query(
        'SELECT * FROM deep_links WHERE link_id=$1', [link_id]
      );
      if(existing.length) return res.json(existing[0]);
    }
    // Generate unique code
    let code, taken = true;
    while(taken) {
      code = genCode();
      const { rows } = await pool.query('SELECT id FROM deep_links WHERE code=$1', [code]);
      taken = rows.length > 0;
    }
    const { rows } = await pool.query(
      'INSERT INTO deep_links (code, original_url, link_id, user_id) VALUES ($1,$2,$3,$4) RETURNING *',
      [code, url, link_id||null, req.user.id]
    );
    res.json(rows[0]);
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// Get deep links for current user
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM deep_links WHERE user_id=$1 ORDER BY created_at DESC', [req.user.id]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = { router, genCode, DEEP_PLATFORMS };
