# 3R Mobile Laundry - Monorepo Structure

## Overview
This project is organized as a production-ready monorepo with clear separation of concerns between frontend applications, backend services, and shared utilities.

## Directory Structure

```
3rmobilelaundry/
├── apps/                          # Frontend applications
│   ├── student-web/              # User-facing web application (Expo)
│   │   ├── src/                  # Source code
│   │   │   ├── components/       # Reusable React components
│   │   │   ├── screens/          # Screen/page components
│   │   │   ├── services/         # API client and services
│   │   │   ├── context/          # React context for state management
│   │   │   └── constants/        # App constants and configuration
│   │   ├── assets/               # Static assets (icons, images)
│   │   ├── __tests__/            # Unit tests
│   │   ├── android/              # Android-specific config
│   │   ├── package.json          # App dependencies
│   │   ├── app.json              # Expo app configuration
│   │   ├── metro.config.js        # Metro bundler config
│   │   ├── webpack.config.js      # Webpack config for web build
│   │   └── README.md             # App-specific documentation
│   │
│   ├── admin-web/                # Admin dashboard
│   │   ├── app.js                # Main app component
│   │   ├── server.js             # Express server
│   │   ├── index.html            # HTML entry point
│   │   └── package.json          # Dependencies
│   │
│   ├── student-mobile/           # Student mobile app (React Native)
│   │   ├── App.js                # Main app component
│   │   └── package.json          # Dependencies
│   │
│   └── staff-mobile/             # Staff mobile app (React Native)
│       ├── App.js                # Main app component
│       └── package.json          # Dependencies
│
├── backend/                       # Node.js backend server
│   ├── src/
│   │   ├── config/               # Configuration files
│   │   ├── middleware/           # Express middleware
│   │   ├── models/               # Database models (Sequelize)
│   │   ├── routes/               # API routes
│   │   └── services/             # Business logic
│   ├── public/                   # Static files
│   │   └── uploads/              # User uploads
│   ├── scripts/                  # Utility scripts
│   │   ├── e2e_*.js              # End-to-end tests
│   │   ├── test_*.js             # Integration tests
│   │   └── verify_*.js           # Verification scripts
│   ├── __tests__/                # Backend unit tests
│   ├── tests/                    # Additional tests
│   ├── server.js                 # Express app entry point
│   ├── package.json              # Backend dependencies
│   └── jest.config.js            # Jest config
│
├── shared/                       # Shared utilities and APIs
│   ├── api.js                    # Frontend API client
│   └── types.js                  # Shared type definitions
│
├── scripts/                      # Root-level utility scripts
│   ├── dev-multi-web.js         # Multi-app development server
│   ├── configure_ip.js           # IP configuration utility
│   ├── fix_paths.js              # Path fixing utility
│   ├── generate_assets.js        # Generate placeholder assets
│   ├── download_wrapper.js       # Download utility
│   └── verify_chat_backend.js    # Chat verification script
│
├── .vscode/                      # VSCode configuration
│   └── launch.json               # Debug launch configuration
│
├── .archived/                    # Deprecated files
│   └── *.bat, *.txt              # Old Windows scripts and logs
│
├── .gitignore                    # Git ignore rules
├── package.json                  # Root monorepo dependencies (Expo CLI)
├── package-lock.json             # Dependency lock file
└── README.md                     # Main project documentation
```

## Import Paths Reference

### Importing Shared Code
All applications can import shared utilities from the `shared` folder:

```javascript
// In any app:
import { auth, student, admin, config } from '../../shared/api';

// Usage:
config.setBaseUrl('http://localhost:5000');
const loginResult = await auth.login({ phone_number, password });
```

**Shared API Functions:**
- `auth` - Authentication endpoints
  - `auth.register(payload)` - Register new user
  - `auth.login(payload)` - Login user
- `student` - Student-specific endpoints
  - `student.getPlans()` - Get available plans
  - `student.subscribe(user_id, plan_id)` - Subscribe to plan
  - `student.getOrders(user_id)` - Get orders
  - `student.bookPickup(payload)` - Book pickup
- `admin` - Admin endpoints
  - `admin.listPlans()` - List all plans
  - `admin.createPlan(payload)` - Create plan
  - `admin.updatePlan(id, payload)` - Update plan
  - `admin.deletePlan(id)` - Delete plan
  - `admin.getOrders(status)` - Get orders
  - `admin.updateOrderStatus(id, status)` - Update order status
- `config` - Configuration utilities
  - `config.setBaseUrl(url)` - Set base API URL
  - `config.setAuthToken(token)` - Set auth token

### Relative Import Examples

**From apps/student-web/src/screens/LoginScreen.js:**
```javascript
// Import components within the same app
import { ErrorBoundary } from '../components/ErrorBoundary';

// Import services
import { student, auth, config } from '../../shared/api';

// Import constants
import { theme } from '../constants/theme';

// Import context
import { useAuth } from '../context/AuthContext';
```

**From apps/admin-web/app.js:**
```javascript
// Import shared API
import { config, auth, admin } from '../shared/api.js';
```

**From backend/src/server.js:**
```javascript
// Backend doesn't import from shared (it uses different API style)
// Instead uses direct imports from local modules
const { router } = require('./routes');
const { middleware } = require('./middleware');
```

## Build and Run Commands

### Root Level
```bash
# Install dependencies for CLI tools
npm install

# Start all development servers
node scripts/dev-multi-web.js
```

### Student Web (apps/student-web/)
```bash
# Install dependencies
npm install

# Start development server
npm start

# Build for web
npm run build:web

# Run tests
npm test

# Build APK for Android
npm run build:apk
```

### Admin Web (apps/admin-web/)
```bash
# Install dependencies
npm install

# Start development server
npm start

# Start with nodemon (auto-reload)
npm run dev
```

### Backend (backend/)
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Start production server
npm start

# Run tests
npm test

# Run e2e tests
npm run e2e:user
```

## Updated Import Paths

### Changes Made During Restructuring

1. **App Import Paths Updated:**
   - ❌ `from '../new-shared/api'` → ✅ `from '../shared/api'`
   - ❌ `path.resolve(__dirname, '...', 'admin-app', ...)` → ✅ `path.resolve(__dirname, '...', 'apps', 'admin-web', ...)`
   - ❌ `path.resolve(__dirname, '...', 'user-app', ...)` → ✅ `path.resolve(__dirname, '...', 'apps', 'student-web', ...)`

2. **Script Path Updates:**
   - `scripts/dev-multi-web.js` - Updated to reference `apps/student-web` and `apps/admin-web`
   - `scripts/configure_ip.js` - Updated paths for app API configuration
   - `scripts/generate_assets.js` - Updated asset generation paths

3. **Test Path Updates:**
   - `backend/__tests__/admin.test.js` - Updated asset path references

## Environment Configuration

### Shared Configuration
- **Base API URL:** Controlled via `config.setBaseUrl(url)` in shared/api.js
- **Default:** `http://localhost:5100`
- **Configurable via:** Environment variable `BASE_URL`

### App-Specific Configuration
Each app can have its own configuration through:
- Environment files (`.env`, `.env.local`)
- App-specific config files (e.g., `app.json` for Expo apps)
- Configuration scripts in the `scripts/` folder

## Key Files and Configuration

### Root Configuration Files
- **package.json** - Root dependencies (Expo CLI, EAS CLI)
- **.gitignore** - Git ignore rules (updated with monorepo patterns)
- **.vscode/launch.json** - VSCode debug configuration

### App Configuration Files
- **apps/student-web/app.json** - Expo app configuration
- **apps/student-web/package.json** - User app dependencies
- **apps/student-web/webpack.config.js** - Web build configuration
- **apps/admin-web/package.json** - Admin app dependencies
- **backend/package.json** - Backend dependencies
- **backend/src/config/app-settings.json** - Backend settings
- **backend/src/config/database.js** - Database configuration

## Database

- **Type:** SQLite (default) or PostgreSQL
- **Location:** `backend/database.sqlite` (SQLite)
- **ORM:** Sequelize
- **Models:** Located in `backend/src/models/`

## Testing

### Backend Tests
```bash
cd backend
npm test              # Run unit tests
npm run e2e:user     # Run e2e tests
```

### Frontend Tests
```bash
cd apps/student-web
npm test             # Run unit tests
```

## Common Issues and Solutions

### Issue: "Cannot find module '../new-shared/api'"
**Solution:** Update imports to use `'../shared/api'` instead of `'../new-shared/api'`

### Issue: "Module not found: apps/admin-web/assets/logo.png"
**Solution:** Create assets folder or use existing assets from student-web/assets/

### Issue: "Port already in use"
**Solution:** Set custom port via environment variables:
- `USER_WEB_PORT` - Student web port (default: 19006)
- `ADMIN_WEB_PORT` - Admin web port (default: 19007)
- `BACKEND_PORT` - Backend port (default: 5001)
- `PROXY_PORT` - Proxy port (default: 5000)

## Deployment

### Frontend (Student Web)
```bash
cd apps/student-web
npm run build:web
# Deploy the `web-build/` directory to static hosting
```

### Backend
```bash
cd backend
npm install --production
npm start
# Backend is ready to deploy to Railway or similar platforms
```

## Git Workflow

All files are tracked properly with the updated `.gitignore`:
- `node_modules/` - Excluded (reinstall with npm install)
- `backend/database.sqlite` - Excluded (local development only)
- `.env` - Excluded (add to .gitignore for sensitive data)
- `.archived/` - Excluded (deprecated files)

## Next Steps

1. **Run npm install** in each app and backend folder
2. **Configure environment variables** (BASE_URL, database credentials, etc.)
3. **Start development servers** using the app-specific scripts
4. **Run tests** to ensure everything is working correctly

---

**Last Updated:** March 5, 2026  
**Monorepo Version:** 1.0.0
