require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: ['https://stellular-flan-1f7088.netlify.app', 'https://fanlink.com', 'http://localhost:3000'], credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve frontend
app.use(express.static(path.join(__dirname, '../frontend/public')));

// API Routes
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/pages',     require('./routes/pages'));
app.use('/api/links',     require('./routes/links'));
app.use('/api/tracking',  require('./routes/tracking'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/upload',    require('./routes/upload'));

// Short redirect
app.get('/r/:slug', (req, res) => res.redirect(`/api/tracking/r/${req.params.slug}`));

// SPA fallback - works with both Express 4 and 5
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 FanLink running on port ${PORT}`));
