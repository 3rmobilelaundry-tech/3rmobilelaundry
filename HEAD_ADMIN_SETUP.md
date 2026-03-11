# Head Admin Seeding Instructions

The backend for this monorepo is maintained separately from the apps.  To satisfy the requirement of an initial `head_admin` account you need to add a small boot‑time check in your server code.  Below is a generic example in Node/Express with MongoDB (Mongoose) that you can adapt to your actual stack.

## 1. User model (mongoose example)
```js
// models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  phone: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, required: true },
  name: String,
});

module.exports = mongoose.model('User', UserSchema);
```

If you use a relational database, make a similar schema/table definition.

## 2. Seed logic on server start
```js
// seed/ensureHeadAdmin.js
const bcrypt = require('bcrypt');
const User = require('../models/User');

// NOTE: this file is executed when your app boots.  it ensures the
// "first" head admin account exists, and does nothing if it already does.
async function ensureHeadAdmin() {
  const phone = '080690090488';
  const existing = await User.findOne({ phone });
  if (existing && existing.role === 'head_admin') return;

  const hashed = await bcrypt.hash('everest324', 10);
  await User.create({
    phone,
    password: hashed,
    role: 'head_admin',
    name: 'Head Admin',
  });
  console.log('Head admin user created');
}

module.exports = ensureHeadAdmin;
```

Then in your main server entrypoint (`app.js`, `index.js`, etc.) call this before listening:
```js
const express = require('express');
const ensureHeadAdmin = require('./seed/ensureHeadAdmin');

const app = express();
// ... other middleware and routes

ensureHeadAdmin().catch(err => {
  console.error('failed to seed head admin', err);
  process.exit(1);
});

app.listen(PORT, () => console.log('listening')); 
```

> **Comment:** this is the system's initial admin account, created automatically once at startup if missing.  The password is hashed with bcrypt; the plaintext `everest324` never gets stored.

## 3. Authentication route
Make sure your login route verifies phone/password and issues a JWT.
```js
// routes/auth.js
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { phone, password } = req.body;
  const user = await User.findOne({ phone });
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({ token });
});

module.exports = router;
```

Your admin web app already expects a JWT from login (`api.login()`), so this will integrate seamlessly.  Ensure `JWT_SECRET` is set in your environment.

## 4. Protecting admin routes
Use middleware that verifies the token and checks `role === 'head_admin'` or other permitted roles.

```js
// middleware/auth.js
const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.replace(/^Bearer\s+/, '');
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user && req.user.role === role) return next();
    return res.status(403).json({ error: 'Forbidden' });
  };
}

module.exports = { requireAuth, requireRole };
```

## 5. Frontend usage
The admin app's login screen already stores the returned JWT and includes it in `Authorization` headers.  Once the head admin user logs in with the provided credentials (`080690090488` / `everest324`), subsequent API calls will succeed and the dashboard will be accessible.

---

**Note:** the workspace you provided only contains the frontend; the backend code isn't checked in here.  Apply the above changes to your backend repository.  After deployment, the first time the server starts it will create the initial head admin account if missing; future restarts leave the user intact.

Once you've added and deployed these backend changes, test by calling the login endpoint and verifying you receive a token and can access protected admin endpoints.