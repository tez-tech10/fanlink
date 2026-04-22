const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();

const getPageId = async (userId) => {
  const { rows } = await pool.query('SELECT id FROM pages WHERE user_id=$1', [userId]);
  return rows[0]?.id;
};

router.get('/', auth, async (req, res) => {
  try {
    const page_id = await getPageId(req.user.id);
    const { rows } = await pool.query('SELECT * FROM tracking_slugs WHERE page_id=$1 ORDER BY created_at', [page_id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.post('/', auth, async (req, res) => {
  const { slug, of_url, name } = req.body;
  if (!slug || !of_url) return res.status(400).json({ error: 'Slug and OF URL required' });
  if (!/^[a-zA-Z0-9_-]{1,50}$/.test(slug)) return res.status(400).json({ error: 'Slug: letters, numbers, _ or - only' });
  try {
    const page_id = await getPageId(req.user.id);
    const { rows: u } = await pool.query('SELECT plan,promo_expires_at FROM users WHERE id=$1', [req.user.id]);
    const isPremium = u[0].plan === 'premium' || (u[0].promo_expires_at && new Date(u[0].promo_expires_at) > new Date());
    if (!isPremium) {
      const { rows: ex } = await pool.query('SELECT id FROM tracking_slugs WHERE page_id=$1', [page_id]);
      if (ex.length >= 1) return res.status(403).json({ error: 'Free plan: 1 tracking link max. Upgrade for unlimited.' });
    }
    const taken = await pool.query('SELECT id FROM tracking_slugs WHERE slug=$1', [slug.toLowerCase()]);
    if (taken.rows.length) return res.status(400).json({ error: 'Slug already taken' });
    const { rows } = await pool.query(
      'INSERT INTO tracking_slugs (page_id,slug,of_url,name) VALUES ($1,$2,$3,$4) RETURNING *',
      [page_id, slug.toLowerCase(), of_url, name || slug]
    );
    res.json(rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const page_id = await getPageId(req.user.id);
    await pool.query('DELETE FROM tracking_slugs WHERE id=$1 AND page_id=$2', [req.params.id, page_id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.get('/r/:slug', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tracking_slugs WHERE slug=$1', [req.params.slug.toLowerCase()]);
    if (!rows.length) return res.status(404).send('Link not found');
    const t = rows[0];
    await pool.query('UPDATE tracking_slugs SET clicks=clicks+1 WHERE id=$1', [t.id]);
    await pool.query('INSERT INTO analytics (page_id,slug_id,event_type) VALUES ($1,$2,$3)', [t.page_id, t.id, 'slug_click']);
    res.redirect(t.of_url);
  } catch (e) { res.status(500).send('Server error'); }
});

module.exports = router;

// Get full page by tracking slug (replaces OF link with tracking URL)
router.get('/page/:slug', async (req, res) => {
  try {
    const { rows: slugRows } = await pool.query(
      'SELECT * FROM tracking_slugs WHERE slug=$1',
      [req.params.slug.toLowerCase()]
    );
    if (!slugRows.length) return res.status(404).json({ error: 'Not found' });
    const t = slugRows[0];

    // Get the full page
    const { rows: pages } = await pool.query('SELECT * FROM pages WHERE id=$1 AND is_published=true', [t.page_id]);
    if (!pages.length) return res.status(404).json({ error: 'Page not found' });
    const page = pages[0];

    // Get links - replace OnlyFans URL with tracking URL
    const { rows: links } = await pool.query(
      'SELECT id,type,label,sub_label,url,icon_key,photo_url,position FROM links WHERE page_id=$1 AND visible=true ORDER BY position',
      [page.id]
    );

    const trackedLinks = links.map(l => {
      if (l.icon_key === 'onlyfans') return { ...l, url: t.of_url };
      return l;
    });

    // Count click
    await pool.query('UPDATE tracking_slugs SET clicks=clicks+1 WHERE id=$1', [t.id]);
    await pool.query('INSERT INTO analytics (page_id,slug_id,event_type) VALUES ($1,$2,$3)', [t.page_id, t.id, 'slug_click']);

    res.json({ ...page, links: trackedLinks, tracking_slug: t.slug });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});
