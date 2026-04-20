const express = require('express');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const pool = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();

// Supabase client just for storage (uses REST API not pg)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.post('/avatar', auth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const ext = req.file.originalname.split('.').pop();
  const path = `avatars/${req.user.id}.${ext}`;
  try {
    const { error } = await supabase.storage
      .from('fanlink-uploads')
      .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('fanlink-uploads').getPublicUrl(path);
    await pool.query('UPDATE pages SET avatar_url=$1 WHERE user_id=$2', [publicUrl, req.user.id]);
    res.json({ url: publicUrl });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Upload failed: ' + e.message }); }
});

router.post('/photo', auth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const ext = req.file.originalname.split('.').pop();
  const path = `photos/${req.user.id}_${Date.now()}.${ext}`;
  try {
    const { error } = await supabase.storage
      .from('fanlink-uploads')
      .upload(path, req.file.buffer, { contentType: req.file.mimetype });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('fanlink-uploads').getPublicUrl(path);
    res.json({ url: publicUrl });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Upload failed: ' + e.message }); }
});

module.exports = router;
