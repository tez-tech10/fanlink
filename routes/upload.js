const express = require('express');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const pool = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'));
  }
});

router.post('/avatar', auth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const ext = req.file.originalname.split('.').pop().toLowerCase() || 'jpg';
  const filePath = `avatars/${req.user.id}_${Date.now()}.${ext}`;
  try {
    const { error } = await supabase.storage
      .from('fanlink-uploads')
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true,
      });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from('fanlink-uploads').getPublicUrl(filePath);
    await pool.query('UPDATE pages SET avatar_url=$1 WHERE user_id=$2', [data.publicUrl, req.user.id]);
    res.json({ url: data.publicUrl });
  } catch (e) {
    console.error('Upload error:', e.message);
    res.status(500).json({ error: 'Upload failed: ' + e.message });
  }
});

router.post('/cover', auth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const ext = req.file.originalname.split('.').pop().toLowerCase() || 'jpg';
  const filePath = `covers/${req.user.id}_${Date.now()}.${ext}`;
  try {
    const { error } = await supabase.storage
      .from('fanlink-uploads')
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from('fanlink-uploads').getPublicUrl(filePath);
    await pool.query('UPDATE pages SET cover_url=$1 WHERE user_id=$2', [data.publicUrl, req.user.id]);
    res.json({ url: data.publicUrl });
  } catch (e) {
    console.error('Upload error:', e.message);
    res.status(500).json({ error: 'Upload failed: ' + e.message });
  }
});

router.post('/photo', auth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const ext = req.file.originalname.split('.').pop().toLowerCase() || 'jpg';
  const filePath = `photos/${req.user.id}_${Date.now()}.${ext}`;
  try {
    const { error } = await supabase.storage
      .from('fanlink-uploads')
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from('fanlink-uploads').getPublicUrl(filePath);
    res.json({ url: data.publicUrl });
  } catch (e) {
    console.error('Upload error:', e.message);
    res.status(500).json({ error: 'Upload failed: ' + e.message });
  }
});

module.exports = router;

// Delete file from Supabase Storage
router.post('/delete', auth, async (req, res) => {
  const { path } = req.body;
  if (!path) return res.status(400).json({ error: 'Path required' });
  // Security: only allow deleting files that belong to this user
  if (!path.includes(req.user.id)) return res.status(403).json({ error: 'Forbidden' });
  try {
    const { error } = await supabase.storage.from('fanlink-uploads').remove([path]);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    console.error('Delete error:', e.message);
    res.status(500).json({ error: e.message });
  }
});
