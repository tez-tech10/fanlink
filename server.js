require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const pool = require('./db');

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve frontend only if it exists
const frontendPath = path.join(__dirname, 'frontend/public');
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
}

// API Routes
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/pages',     require('./routes/pages'));
app.use('/api/links',     require('./routes/links'));
app.use('/api/tracking',  require('./routes/tracking'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/upload',    require('./routes/upload'));
app.use('/api/admin',     require('./routes/admin'));
app.use('/api/deeplinks', require('./routes/deeplinks').router);
app.use('/api/agency',    require('./routes/agency'));

// Deep link redirect — fanlink.info/lnk/Xk9mP2qR4nYt
app.get('/lnk/:code', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM deep_links WHERE code=$1', [req.params.code]
    );
    if(!rows.length) return res.status(404).send('Link not found');
    // Count click
    await pool.query('UPDATE deep_links SET clicks=clicks+1 WHERE id=$1', [rows[0].id]);
    res.redirect(rows[0].original_url);
  } catch(e) { res.status(500).send('Server error'); }
});

// Short tracking redirect
app.get('/r/:slug', (req, res) => res.redirect(`/api/tracking/r/${req.params.slug}`));

// Fallback
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  if (fs.existsSync(frontendPath)) {
    return res.sendFile(path.join(frontendPath, 'index.html'));
  }
  res.status(404).json({ error: 'Not found' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 FanLink running on port ${PORT}`));
