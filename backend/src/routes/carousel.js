const express = require('express');
const router = express.Router();
const { CarouselItem } = require('../models');
const { verifyToken, verifyRole } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Upload config
const uploadsDir = path.join(__dirname, '..', '..', 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext).replace(/[^a-z0-9-_]/gi, '_');
    cb(null, `carousel-${Date.now()}-${base}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Invalid file type'));
  },
});

// Public: Get Active Items
router.get('/active', async (req, res) => {
  try {
    const items = await CarouselItem.findAll({
      where: { status: 'active' },
      order: [['order_index', 'ASC']]
    });
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get All Items
router.get('/', verifyToken, verifyRole(['admin', 'head_admin']), async (req, res) => {
  try {
    const items = await CarouselItem.findAll({
      order: [['order_index', 'ASC']]
    });
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Create Item
router.post('/', verifyToken, verifyRole(['admin', 'head_admin']), upload.single('image'), async (req, res) => {
  try {
    const { title, description, link, status, order_index } = req.body;
    let image_url = '';
    
    if (req.file) {
      image_url = `/uploads/${req.file.filename}`;
    } else {
      return res.status(400).json({ error: 'Image is required' });
    }

    const item = await CarouselItem.create({
      image_url,
      title,
      description,
      link,
      status: status || 'active',
      order_index: order_index || 0
    });
    
    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Update Item
router.put('/:id', verifyToken, verifyRole(['admin', 'head_admin']), upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, link, status, order_index } = req.body;
    
    const item = await CarouselItem.findByPk(id);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    if (req.file) {
      item.image_url = `/uploads/${req.file.filename}`;
    }
    
    if (title !== undefined) item.title = title;
    if (description !== undefined) item.description = description;
    if (link !== undefined) item.link = link;
    if (status !== undefined) item.status = status;
    if (order_index !== undefined) item.order_index = order_index;

    await item.save();
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Delete Item
router.delete('/:id', verifyToken, verifyRole(['admin', 'head_admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const item = await CarouselItem.findByPk(id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    
    await item.destroy();
    res.json({ message: 'Item deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Reorder Items
router.put('/reorder', verifyToken, verifyRole(['admin', 'head_admin']), async (req, res) => {
  try {
    const { items } = req.body; // Array of { id, order_index }
    if (!Array.isArray(items)) return res.status(400).json({ error: 'Invalid data format' });

    await Promise.all(items.map(item => 
      CarouselItem.update({ order_index: item.order_index }, { where: { id: item.id } })
    ));

    res.json({ message: 'Order updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
