const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();

const getPageId = async (userId) => {
  const { rows } = await pool.query('SELECT id FROM pages WHERE user_id=$1', [userId]);
  return rows[0]?.id;
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
    res.json(rows[0]);
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
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const page_id = await getPageId(req.user.id);
    await pool.query('DELETE FROM links WHERE id=$1 AND page_id=$2', [req.params.id, page_id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
