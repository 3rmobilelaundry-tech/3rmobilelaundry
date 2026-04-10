const express = require('express')
const router = express.Router()
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const { verifyToken } = require('../middleware/auth')
const { User } = require('../models')

const uploadsDir = path.join(__dirname, '..', 'public', 'uploads')
try { if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true }) } catch {}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const safeName = String(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_')
    cb(null, `avatar-${Date.now()}-${safeName}`)
  }
})

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
  cb(null, allowed.includes(file.mimetype))
}

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter
})

router.post('/upload-profile', verifyToken, upload.single('profile_image'), async (req, res) => {
  try {
    const userId = req.user.user_id
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
    const user = await User.findByPk(userId)
    if (!user) return res.status(404).json({ error: 'User not found' })
    const imageUrl = `/uploads/${req.file.filename}`
    await user.update({ avatar_url: imageUrl })
    return res.json({ success: true, imageUrl })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

module.exports = router
