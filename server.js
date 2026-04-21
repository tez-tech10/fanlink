require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve frontend only if it exists (not needed when using Netlify)
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

// Short redirect
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
