const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();
const { genCode, DEEP_PLATFORMS } = require('./deeplinks');

const getPageId = async (userId) => {
  const { rows } = await pool.query('SELECT id FROM pages WHERE user_id=$1', [userId]);
  return rows[0]?.id;
};

// Auto-generate deep link for OF/Fansly/ManyVids URLs
const maybeCreateDeepLink = async (url, iconKey, linkId, userId) => {
  if (!url || !DEEP_PLATFORMS.includes(iconKey)) return null;
  try {
    // Check table exists first
    await pool.query('SELECT 1 FROM deep_links LIMIT 1');
    // Check if one already exists for this link
    const { rows: existing } = await pool.query(
      'SELECT * FROM deep_links WHERE link_id=$1', [linkId]
    );
    if (existing.length) return existing[0];

    let code, taken = true;
    while(taken) {
      code = genCode();
      const { rows } = await pool.query('SELECT id FROM deep_links WHERE code=$1', [code]);
      taken = rows.length > 0;
    }
    const { rows } = await pool.query(
      'INSERT INTO deep_links (code, original_url, link_id, user_id) VALUES ($1,$2,$3,$4) RETURNING *',
      [code, url, linkId, userId]
    );
    return rows[0];
  } catch(e) { console.error('Deep link error:', e.message); return null; }
};

router.post('/', auth, async (req, res) => {
  const { type, label, sub_label, url, icon_key, photo_url } = req.body;
  try {
    const page_id = await getPageId(req.user.id);
    if (!page_id) return res.status(404).json({ error: 'Page not found' });
    const { rows: pos } = await pool.query('SELECT COALESCE(MAX(position),-1)+1 AS next FROM links WHERE page_id=$1', [page_id]);
    const { rows } = await pool.query(
      'INSERT INTO links (page_id,type,label,sub_label,url,icon_key,photo_url,position) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [page_id, type||'button', label, sub_label, url, icon_key, photo_url, pos[0].next]
    );
    const link = rows[0];
    // Auto-generate deep link for OF/Fansly/ManyVids
    const deepLink = await maybeCreateDeepLink(url, icon_key, link.id, req.user.id);
    res.json({ ...link, deep_link: deepLink ? `https://fanlink.info/lnk/${deepLink.code}` : null });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

router.put('/reorder/all', auth, async (req, res) => {
  const { order } = req.body;
  try {
    const page_id = await getPageId(req.user.id);
    for (const item of order) {
      await pool.query('UPDATE links SET position=$1 WHERE id=$2 AND page_id=$3', [item.position, item.id, page_id]);
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.put('/:id', auth, async (req, res) => {
  const { label, sub_label, url, icon_key, photo_url, visible, type } = req.body;
  try {
    const page_id = await getPageId(req.user.id);
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
    vals.push(req.params.id, page_id);
    const { rows } = await pool.query(`UPDATE links SET ${fields.join(',')} WHERE id=$${i} AND page_id=$${i+1} RETURNING *`, vals);
    const link = rows[0];
    // Update or create deep link if URL changed
    if (url !== undefined && icon_key !== undefined) {
      // Delete old deep link first
      try { await pool.query('DELETE FROM deep_links WHERE link_id=$1', [req.params.id]); } catch(de) { /* table may not exist */ }
      const deepLink = await maybeCreateDeepLink(url, icon_key || link.icon_key, req.params.id, req.user.id);
      return res.json({ ...link, deep_link: deepLink ? `https://fanlink.info/lnk/${deepLink.code}` : null });
    }
    res.json(link);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const page_id = await getPageId(req.user.id);
    try { await pool.query('DELETE FROM deep_links WHERE link_id=$1', [req.params.id]); } catch(de) { /* table may not exist */ }
    await pool.query('DELETE FROM links WHERE id=$1 AND page_id=$2', [req.params.id, page_id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
