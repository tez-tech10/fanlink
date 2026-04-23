const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();

const agencyOnly = async (req, res, next) => {
  const { rows } = await pool.query("SELECT account_type FROM users WHERE id=$1", [req.user.id]);
  if (!rows[0] || rows[0].account_type !== 'agency') return res.status(403).json({ error: 'Agency account required' });
  next();
};

// Get all models for this agency
router.get('/models', auth, agencyOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.name, p.username, p.cover_url, p.is_published, p.accent_color,
       (SELECT COUNT(*) FROM links WHERE page_id=p.id) AS link_count,
       (SELECT COUNT(*) FROM tracking_slugs WHERE page_id=p.id) AS slug_count
       FROM pages p WHERE p.agency_id=$1 ORDER BY p.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Add a new model
router.post('/models', auth, agencyOnly, async (req, res) => {
  const { name, username } = req.body;
  if (!name) return res.status(400).json({ error: 'Model name required' });
  try {
    if (username) {
      const taken = await pool.query('SELECT id FROM pages WHERE username=$1', [username.toLowerCase()]);
      if (taken.rows.length) return res.status(400).json({ error: 'Username already taken' });
    }
    const { rows } = await pool.query(
      `INSERT INTO pages (user_id, agency_id, name, username, is_published, theme, accent_color)
       VALUES ($1, $1, $2, $3, false, 'dark', '#22c55e') RETURNING *`,
      [req.user.id, name, username?.toLowerCase() || null]
    );
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Get a model's full page data (links, tracking)
router.get('/models/:id', auth, agencyOnly, async (req, res) => {
  try {
    const { rows: pages } = await pool.query(
      'SELECT * FROM pages WHERE id=$1 AND agency_id=$2', [req.params.id, req.user.id]
    );
    if (!pages.length) return res.status(404).json({ error: 'Model not found' });
    const page = pages[0];
    const { rows: links } = await pool.query(
      'SELECT * FROM links WHERE page_id=$1 ORDER BY position', [page.id]
    );
    let linksWithDeep = links;
    try {
      const { rows: dl } = await pool.query('SELECT link_id, code FROM deep_links WHERE user_id=$1', [req.user.id]);
      const deepMap = {};
      dl.forEach(d => { deepMap[d.link_id] = 'https://fanlink.info/lnk/'+d.code; });
      linksWithDeep = links.map(l => ({ ...l, deep_link: deepMap[l.id]||null }));
    } catch(e) {}
    const { rows: slugs } = await pool.query(
      'SELECT * FROM tracking_slugs WHERE page_id=$1 ORDER BY created_at', [page.id]
    );
    const slugsWithDeep = slugs.map(s => ({
      ...s, deep_link: s.deep_link_code ? 'https://fanlink.info/lnk/'+s.deep_link_code : null
    }));
    res.json({ ...page, links: linksWithDeep, slugs: slugsWithDeep });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Update a model's page
router.put('/models/:id', auth, agencyOnly, async (req, res) => {
  const { name, bio, cover_url, accent_color, theme, username, is_published } = req.body;
  try {
    const fields = [], vals = [];
    let i = 1;
    if (name !== undefined)         { fields.push(`name=$${i++}`);         vals.push(name); }
    if (bio !== undefined)          { fields.push(`bio=$${i++}`);          vals.push(bio); }
    if (cover_url !== undefined)    { fields.push(`cover_url=$${i++}`);    vals.push(cover_url); }
    if (accent_color !== undefined) { fields.push(`accent_color=$${i++}`); vals.push(accent_color); }
    if (theme !== undefined)        { fields.push(`theme=$${i++}`);        vals.push(theme); }
    if (is_published !== undefined) { fields.push(`is_published=$${i++}`); vals.push(is_published); }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
    vals.push(req.params.id, req.user.id);
    const { rows } = await pool.query(
      `UPDATE pages SET ${fields.join(',')} WHERE id=$${i} AND agency_id=$${i+1} RETURNING *`, vals
    );
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Delete a model
router.delete('/models/:id', auth, agencyOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM pages WHERE id=$1 AND agency_id=$2', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Add link to a model
router.post('/models/:id/links', auth, agencyOnly, async (req, res) => {
  const { type, label, sub_label, url, icon_key, photo_url } = req.body;
  try {
    const { rows: pg } = await pool.query('SELECT id FROM pages WHERE id=$1 AND agency_id=$2', [req.params.id, req.user.id]);
    if (!pg.length) return res.status(404).json({ error: 'Model not found' });
    const { rows: pos } = await pool.query('SELECT COALESCE(MAX(position),-1)+1 AS next FROM links WHERE page_id=$1', [req.params.id]);
    const { rows } = await pool.query(
      'INSERT INTO links (page_id,type,label,sub_label,url,icon_key,photo_url,position) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [req.params.id, type||'button', label, sub_label, url, icon_key, photo_url, pos[0].next]
    );
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Update a model's link
router.put('/models/:id/links/:lid', auth, agencyOnly, async (req, res) => {
  const { label, sub_label, url, icon_key, photo_url, visible, type } = req.body;
  try {
    const fields = [], vals = [];
    let i = 1;
    if (label !== undefined)     { fields.push(`label=$${i++}`);     vals.push(label); }
    if (sub_label !== undefined) { fields.push(`sub_label=$${i++}`); vals.push(sub_label); }
    if (url !== undefined)       { fields.push(`url=$${i++}`);       vals.push(url); }
    if (icon_key !== undefined)  { fields.push(`icon_key=$${i++}`);  vals.push(icon_key); }
    if (photo_url !== undefined) { fields.push(`photo_url=$${i++}`); vals.push(photo_url); }
    if (visible !== undefined)   { fields.push(`visible=$${i++}`);   vals.push(visible); }
    if (type !== undefined)      { fields.push(`type=$${i++}`);      vals.push(type); }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
    vals.push(req.params.lid, req.params.id);
    const { rows } = await pool.query(`UPDATE links SET ${fields.join(',')} WHERE id=$${i} AND page_id=$${i+1} RETURNING *`, vals);
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Delete a model's link
router.delete('/models/:id/links/:lid', auth, agencyOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM links WHERE id=$1 AND page_id=$2', [req.params.lid, req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
