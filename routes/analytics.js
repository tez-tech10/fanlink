const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    const { rows: pages } = await pool.query('SELECT id FROM pages WHERE user_id=$1', [req.user.id]);
    if (!pages.length) return res.status(404).json({ error: 'Page not found' });
    const page_id = pages[0].id;

    const { rows: total } = await pool.query(
      "SELECT COUNT(*) as total FROM analytics WHERE page_id=$1 AND event_type='page_view'", [page_id]
    );
    const { rows: slugs } = await pool.query(
      'SELECT name, slug, clicks FROM tracking_slugs WHERE page_id=$1 ORDER BY clicks DESC', [page_id]
    );

    res.json({ total_views: parseInt(total[0].total), tracking_slugs: slugs });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
