const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();
const { genCode } = require('./deeplinks');

const getPageId = async (userId) => {
  const { rows } = await pool.query('SELECT id FROM pages WHERE user_id=$1', [userId]);
  return rows[0]?.id;
};

router.get('/', auth, async (req, res) => {
  try {
    const page_id = await getPageId(req.user.id);
    const { rows } = await pool.query('SELECT * FROM tracking_slugs WHERE page_id=$1 ORDER BY created_at', [page_id]);
    // Attach deep links
    let slugsWithDeep = rows;
    try {
      const { rows: dl } = await pool.query(
        "SELECT code FROM deep_links WHERE user_id=$1 AND link_id IS NULL ORDER BY created_at",
        [req.user.id]
      );
      // Match by deep_link_code stored on slug
      slugsWithDeep = rows.map(s => ({
        ...s,
        deep_link: s.deep_link_code ? 'https://fanlink.info/lnk/' + s.deep_link_code : null
      }));
    } catch(de) { /* deep_links table not ready */ }
    res.json(slugsWithDeep);
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
    // Check not taken by another tracking slug
    const taken = await pool.query('SELECT id FROM tracking_slugs WHERE slug=$1', [slug.toLowerCase()]);
    if (taken.rows.length) return res.status(400).json({ error: 'This slug is already in use as a tracking link' });

    // Check not taken by a username (public page)
    const takenByUser = await pool.query('SELECT id FROM pages WHERE username=$1', [slug.toLowerCase()]);
    if (takenByUser.rows.length) return res.status(400).json({ error: 'This name is already used as a page username' });
    const { rows } = await pool.query(
      'INSERT INTO tracking_slugs (page_id,slug,of_url,name) VALUES ($1,$2,$3,$4) RETURNING *',
      [page_id, slug.toLowerCase(), of_url, name || slug]
    );
    const trackSlug = rows[0];

    // Auto-generate deep link for the OF tracking URL
    let deepLinkUrl = null;
    try {
      let code, taken = true;
      while(taken) {
        code = genCode();
        const { rows: ex } = await pool.query('SELECT id FROM deep_links WHERE code=$1', [code]);
        taken = ex.length > 0;
      }
      await pool.query(
        'INSERT INTO deep_links (code, original_url, user_id) VALUES ($1,$2,$3)',
        [code, of_url, req.user.id]
      );
      deepLinkUrl = 'https://fanlink.info/lnk/' + code;
      // Update slug with deep link code for reference
      await pool.query('UPDATE tracking_slugs SET deep_link_code=$1 WHERE id=$2', [code, trackSlug.id]).catch(()=>{});
    } catch(de) { console.error('Deep link gen failed:', de.message); }

    res.json({ ...trackSlug, deep_link: deepLinkUrl });
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
