const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();

const getPage = async (userId) => {
  const { rows } = await pool.query('SELECT * FROM pages WHERE user_id=$1', [userId]);
  return rows[0];
};

router.get('/', auth, async (req, res) => {
  try {
    const page = await getPage(req.user.id);
    if (!page) return res.status(404).json({ error: 'Page not found' });
    const { rows: links } = await pool.query('SELECT * FROM links WHERE page_id=$1 ORDER BY position', [page.id]);
    res.json({ ...page, links });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.put('/', auth, async (req, res) => {
  const { name, bio, layout_mode, theme, bg_color, accent_color, avatar_url } = req.body;
  try {
    const fields = [], vals = [];
    let i = 1;
    if (name !== undefined)        { fields.push(`name=$${i++}`);         vals.push(name); }
    if (bio !== undefined)         { fields.push(`bio=$${i++}`);          vals.push(bio); }
    if (layout_mode !== undefined) { fields.push(`layout_mode=$${i++}`);  vals.push(layout_mode); }
    if (theme !== undefined)       { fields.push(`theme=$${i++}`);        vals.push(theme); }
    if (bg_color !== undefined)    { fields.push(`bg_color=$${i++}`);     vals.push(bg_color); }
    if (accent_color !== undefined){ fields.push(`accent_color=$${i++}`); vals.push(accent_color); }
    if (avatar_url !== undefined)  { fields.push(`avatar_url=$${i++}`);   vals.push(avatar_url); }
    if (req.body.cover_url !== undefined) { fields.push(`cover_url=$${i++}`); vals.push(req.body.cover_url); }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
    fields.push(`updated_at=NOW()`);
    vals.push(req.user.id);
    const { rows } = await pool.query(`UPDATE pages SET ${fields.join(',')} WHERE user_id=$${i} RETURNING *`, vals);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.put('/username', auth, async (req, res) => {
  const { username } = req.body;
  const { rows: u } = await pool.query('SELECT plan,promo_expires_at FROM users WHERE id=$1', [req.user.id]);
  const isPremium = u[0].plan === 'premium' || (u[0].promo_expires_at && new Date(u[0].promo_expires_at) > new Date());
  if (!isPremium) return res.status(403).json({ error: 'Premium required to set username' });
  if (!username || !/^[a-zA-Z0-9_]{3,30}$/.test(username)) return res.status(400).json({ error: 'Username: 3-30 chars, letters/numbers/underscore only' });
  try {
    const exists = await pool.query('SELECT id FROM pages WHERE username=$1', [username.toLowerCase()]);
    if (exists.rows.length) return res.status(400).json({ error: 'Username already taken' });
    const { rows } = await pool.query('UPDATE pages SET username=$1,is_published=true,updated_at=NOW() WHERE user_id=$2 RETURNING *', [username.toLowerCase(), req.user.id]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.get('/p/:username', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM pages WHERE username=$1 AND is_published=true', [req.params.username.toLowerCase()]);
    if (!rows.length) return res.status(404).json({ error: 'Page not found' });
    const page = rows[0];
    const { rows: links } = await pool.query('SELECT id,type,label,sub_label,url,icon_key,photo_url,position FROM links WHERE page_id=$1 AND visible=true ORDER BY position', [page.id]);
    await pool.query('INSERT INTO analytics (page_id,event_type) VALUES ($1,$2)', [page.id, 'page_view']);
    res.json({ ...page, links });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
