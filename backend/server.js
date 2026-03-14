const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');
const { Server } = require('socket.io'); // Import socket.io
const { sequelize } = require('./src/models');
const { DataTypes } = require('sequelize');
const authRoutes = require('./src/routes/auth');
const studentRoutes = require('./src/routes/student');
const adminRoutes = require('./src/routes/admin');
const carouselRoutes = require('./src/routes/carousel');
const webhooksRoutes = require('./src/routes/webhooks');
const pushRoutes = require('./src/routes/push');
const { User, Plan } = require('./src/models');
const bcrypt = require('bcryptjs');
const chatSocket = require('./src/services/chatSocket'); // Import chat service
const { processPendingSyncEvents } = require('./src/services/syncService');

const app = express();
const server = http.createServer(app); // Create HTTP server
const PORT = process.env.PORT || 5000;

// Path for Admin Web Build (Static)
const adminIndexPath = path.join(__dirname, 'public', 'admin', 'index.html');

// Path for Student Web Build (Static)
// Priority: 1. public/user (Production/Vercel) 2. ../apps/student-web/web-build (Local Dev)
const localStudentBuild = path.join(__dirname, '..', 'apps', 'student-web', 'web-build');
const prodStudentBuild = path.join(__dirname, 'public', 'user');
const userIndexPath = fs.existsSync(path.join(prodStudentBuild, 'index.html')) 
  ? path.join(prodStudentBuild, 'index.html') 
  : path.join(localStudentBuild, 'index.html');

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for now (adjust for prod)
    methods: ["GET", "POST"]
  }
});

app.set('io', io); // Expose io to routes

// Initialize Chat Socket Service
chatSocket(io);

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  fs.appendFileSync('crash.log', `[${new Date().toISOString()}] ${err.stack}\n`);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
  fs.appendFileSync('crash.log', `[${new Date().toISOString()}] Unhandled Rejection: ${reason}\n`);
});

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  if (!req.path.startsWith('/admin-web') && !req.path.startsWith('/auth') && !req.path.startsWith('/student') && !req.path.startsWith('/admin') && !req.path.startsWith('/api') && !req.path.startsWith('/carousel') && !req.path.startsWith('/webhooks') && !req.path.startsWith('/uploads')) {
    console.log(`[web-user] ${req.method} ${req.originalUrl}`);
  }
  if (req.path.startsWith('/admin-web')) {
    console.log(`[web-admin] ${req.method} ${req.originalUrl}`);
  }
  next();
});

// Serve uploaded files (logos, favicons)
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Log 4xx/5xx responses to file for monitoring
const API_LOG_PATH = path.join(__dirname, 'src', 'logs', 'api-errors.log');
app.use((req, res, next) => {
  res.on('finish', () => {
    try {
      if (res.statusCode >= 400) {
        const dir = path.dirname(API_LOG_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const line = `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${res.statusCode}\n`;
        fs.appendFileSync(API_LOG_PATH, line, 'utf-8');
      }
    } catch {}
  });
  next();
});
// Serve Head Admin Web App (static build) under port 5000
try {
  const adminWebBuild = path.join(__dirname, 'public', 'admin');
  if (fs.existsSync(adminWebBuild)) {
    app.use('/admin', express.static(adminWebBuild));
    console.log('Admin web static mounted at /admin');
  } else {
    console.warn(`Admin web build missing at ${adminWebBuild}`);
  }
} catch (e) {
  console.warn('Failed to mount admin web static:', e.message);
}

// Routes
app.use('/auth', authRoutes);
app.use('/student', studentRoutes);
app.use('/admin', adminRoutes);
app.use('/api', adminRoutes); // Mount admin routes at /api to support /api/staff
app.use('/carousel', carouselRoutes);
app.use('/webhooks', webhooksRoutes);
app.use('/api/push', pushRoutes);

// Serve Student Web App (static build) under root
try {
  let studentWebBuild = localStudentBuild;
  if (fs.existsSync(prodStudentBuild)) {
      studentWebBuild = prodStudentBuild;
      console.log('Using Production Student Web Build from:', studentWebBuild);
  } else {
      console.log('Using Local Dev Student Web Build from:', studentWebBuild);
  }
  
  if (fs.existsSync(studentWebBuild)) {
    app.use('/user', express.static(studentWebBuild));
    app.use(express.static(studentWebBuild));
    console.log('Student web static mounted at /');
  } else {
    console.warn(`Student web build missing at ${studentWebBuild}`);
  }
} catch (e) {
  console.warn('Failed to mount student web static:', e.message);
}

// SPA Fallback Handling: Serve index.html for unknown routes
// 1. Admin App Catch-All
app.get('/admin-web/*', (req, res) => {
  const adminIndexPath = path.join(__dirname, 'public', 'admin', 'index.html');
  if (fs.existsSync(adminIndexPath)) {
    res.set('Cache-Control', 'no-store');
    res.sendFile(adminIndexPath);
  } else {
    console.error(`Admin App build not found at: ${adminIndexPath}`);
    res.status(404).send('Admin App build not found');
  }
});

app.get('/user/*', (req, res) => {
  if (fs.existsSync(userIndexPath)) {
    res.set('Cache-Control', 'no-store');
    res.sendFile(userIndexPath);
  } else {
    res.status(404).send('User App build not found');
  }
});

// 2. User App Catch-All (Must be last)
app.get('*', (req, res, next) => {
  if (req.path === '/health' || req.path === '/health/live' || req.path === '/health/ready') {
    return next();
  }
  // Exclude API routes just in case (though Express order usually handles this)
  if (req.path.startsWith('/api') || req.path.startsWith('/auth') || req.path.startsWith('/student') || req.path.startsWith('/admin')) {
     return res.status(404).json({ error: 'API endpoint not found' });
  }

  if (fs.existsSync(userIndexPath)) {
    res.set('Cache-Control', 'no-store');
    res.sendFile(userIndexPath);
  } else {
    res.status(404).send('User App build not found');
  }
});

// Health Check
app.get('/health', (req, res) => {
  const adminBuildReady = fs.existsSync(adminIndexPath);
  const userBuildReady = fs.existsSync(userIndexPath);
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      backend: 'up',
      admin_web: adminBuildReady ? 'served' : 'missing_build',
      student_web: userBuildReady ? 'served' : 'missing_build',
      websocket: 'active'
    },
    web_builds: {
      admin_web: adminBuildReady,
      student_web: userBuildReady
    }
  });
});

app.get('/health/live', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/health/ready', async (req, res) => {
  try {
    await sequelize.authenticate();
    const adminBuildReady = fs.existsSync(adminIndexPath);
    const userBuildReady = fs.existsSync(userIndexPath);
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      dependencies: {
        database: 'up',
        admin_web: adminBuildReady ? 'served' : 'missing_build',
        student_web: userBuildReady ? 'served' : 'missing_build'
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      dependencies: { database: 'down' },
      error: error.message
    });
  }
});

// SPA Fallback Logic
app.get('*', (req, res, next) => {
  // Skip API routes
  if (req.path.startsWith('/auth') || 
      req.path.startsWith('/student') || 
      req.path.startsWith('/admin') || 
      req.path.startsWith('/carousel') || 
      req.path.startsWith('/webhooks') || 
      req.path.startsWith('/uploads')) {
    return next();
  }

  // Determine if request is for Admin or Student App
  // Logic: If Referer contains /admin-web, serve admin index.html
  // Otherwise serve student index.html
  // Ideally, we should use specific paths like /admin-dashboard for admin SPA
  // But given current setup, let's try to infer or default to Student
  
  const referer = req.get('Referer') || '';
  if (req.path.startsWith('/admin-web') || referer.includes('/admin-web')) {
     if (fs.existsSync(adminIndexPath)) {
         res.set('Cache-Control', 'no-store');
         return res.sendFile(adminIndexPath);
     }
  }

  if (fs.existsSync(userIndexPath)) {
    res.set('Cache-Control', 'no-store');
    res.sendFile(userIndexPath);
  } else {
    next();
  }
});

const checkPortAvailable = (port) => new Promise((resolve) => {
  const tester = net.createServer();
  tester.once('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      resolve(false);
      return;
    }
    resolve(false);
  });
  tester.once('listening', () => {
    tester.close(() => resolve(true));
  });
  tester.listen(port, '0.0.0.0');
});

const ensureSeedAdmin = async () => {
  // NOTE: This creates the system's initial Head Admin account.
  // It runs once when the backend starts, if the user doesn't exist.
  // Credentials: email 3rmobilelaundry@gmail.com, password Everest324, role head_admin
  const email = '3rmobilelaundry@gmail.com';
  const password = 'Everest324';
  const name = 'Everest';
  const phone = '08069090488';

  let admin = await User.findOne({ where: { email } });
  if (admin) {
      // Check if phone number is different, if so, update it to match requirements
      let changed = false;
      if (admin.phone_number !== phone) {
          console.log('Updating Head Admin phone number...');
          admin.phone_number = phone;
          changed = true;
      }
      if (admin.role !== 'head_admin') {
          console.log('Updating Head Admin role...');
          admin.role = 'head_admin';
          changed = true;
      }
      if (admin.full_name !== name) {
          console.log('Updating Head Admin name...');
          admin.full_name = name;
          changed = true;
      }
      if (changed) await admin.save();
      return; 
  }

  // Check if phone exists to avoid unique constraint error
  const phoneExists = await User.findOne({ where: { phone_number: phone } });
  if (phoneExists) {
      console.warn('Head Admin creation skipped: Phone number already in use by another account. Upgrading that account to Head Admin.');
      phoneExists.role = 'head_admin';
      phoneExists.email = email;
      phoneExists.full_name = name;
      phoneExists.email_verified = true;
      phoneExists.email_verified_at = new Date();
      // Optional: Update password here if critical, but safer to let user keep existing password
      await phoneExists.save();
      console.log('Existing account upgraded to Head Admin');
      return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  admin = await User.create({
    full_name: name,
    email: email,
    phone_number: phone,
    password: hashedPassword,
    role: 'head_admin',
    status: 'active',
    email_verified: true,
    email_verified_at: new Date()
  });
  console.log('Head Admin account created successfully');
};

if (require.main === module) {
  // Test connection first
  sequelize.authenticate()
    .then(() => {
       console.log('Database connected successfully');
       const dialect = sequelize.getDialect();
       console.log(`Active Database Dialect: ${dialect}`);
       if (dialect === 'postgres') {
           console.log('Connecting to PostgreSQL...');
       }
       return sequelize.sync();
    })
    .then(async () => {
    console.log('Database tables initialized');
    try {
      const dialect = sequelize.getDialect();
      const table = await sequelize.getQueryInterface().describeTable('Users');
      
      if (!table.avatar_url) {
        await sequelize.getQueryInterface().addColumn('Users', 'avatar_url', {
          type: DataTypes.STRING,
          allowNull: true
        });
      }
      if (!table.is_deleted) {
        await sequelize.getQueryInterface().addColumn('Users', 'is_deleted', {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false
        });
      }
      if (!table.deleted_at) {
        await sequelize.getQueryInterface().addColumn('Users', 'deleted_at', {
          type: DataTypes.DATE,
          allowNull: true
        });
      }
      if (!table.profile_fields) {
        await sequelize.getQueryInterface().addColumn('Users', 'profile_fields', {
          type: DataTypes.JSON,
          allowNull: true
        });
      }
      if (!table.email_verified) {
        await sequelize.getQueryInterface().addColumn('Users', 'email_verified', {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false
        });
      }
      if (!table.email_verified_at) {
        await sequelize.getQueryInterface().addColumn('Users', 'email_verified_at', {
          type: DataTypes.DATE,
          allowNull: true
        });
      }
      if (!table.email_verification_otp_hash) {
        await sequelize.getQueryInterface().addColumn('Users', 'email_verification_otp_hash', {
          type: DataTypes.STRING,
          allowNull: true
        });
      }
      if (!table.email_verification_expires_at) {
        await sequelize.getQueryInterface().addColumn('Users', 'email_verification_expires_at', {
          type: DataTypes.DATE,
          allowNull: true
        });
      }
      if (!table.email_verification_sent_at) {
        await sequelize.getQueryInterface().addColumn('Users', 'email_verification_sent_at', {
          type: DataTypes.DATE,
          allowNull: true
        });
      }
      if (!table.phone_verified) {
        await sequelize.getQueryInterface().addColumn('Users', 'phone_verified', {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false
        });
      }
      if (!table.phone_verified_at) {
        await sequelize.getQueryInterface().addColumn('Users', 'phone_verified_at', {
          type: DataTypes.DATE,
          allowNull: true
        });
      }
      if (!table.phone_verified_by) {
        await sequelize.getQueryInterface().addColumn('Users', 'phone_verified_by', {
          type: DataTypes.INTEGER,
          allowNull: true
        });
      }
      if (!table.phone_verification_otp_hash) {
        await sequelize.getQueryInterface().addColumn('Users', 'phone_verification_otp_hash', {
          type: DataTypes.STRING,
          allowNull: true
        });
      }
      if (!table.phone_verification_expires_at) {
        await sequelize.getQueryInterface().addColumn('Users', 'phone_verification_expires_at', {
          type: DataTypes.DATE,
          allowNull: true
        });
      }
      if (!table.phone_verification_sent_at) {
        await sequelize.getQueryInterface().addColumn('Users', 'phone_verification_sent_at', {
          type: DataTypes.DATE,
          allowNull: true
        });
      }
      if (!table.password_reset_otp_hash) {
        await sequelize.getQueryInterface().addColumn('Users', 'password_reset_otp_hash', {
          type: DataTypes.STRING,
          allowNull: true
        });
      }
      if (!table.password_reset_expires_at) {
        await sequelize.getQueryInterface().addColumn('Users', 'password_reset_expires_at', {
          type: DataTypes.DATE,
          allowNull: true
        });
      }
      if (!table.password_reset_requested_at) {
        await sequelize.getQueryInterface().addColumn('Users', 'password_reset_requested_at', {
          type: DataTypes.DATE,
          allowNull: true
        });
      }
      if (!table.token_version) {
        await sequelize.getQueryInterface().addColumn('Users', 'token_version', {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0
        });
      }
      if (table.school && String(table.school.type || '').toLowerCase().includes('enum')) {
        await sequelize.getQueryInterface().changeColumn('Users', 'school', {
          type: DataTypes.STRING,
          allowNull: true
        });
      }
    } catch (err) {
      console.error('Failed to ensure avatar_url column:', err.message);
    }

    // Ensure head_admin is in the role enum
    try {
      if (sequelize.getDialect() === 'postgres') {
        // PostgreSQL ENUM handling
        const [results] = await sequelize.query(`SELECT enum_range(NULL::"enum_Users_role") as values;`);
        const values = results[0].values ? results[0].values.replace(/[{}]/g, '').split(',') : [];
        if (!values.includes('head_admin')) {
          await sequelize.query(`ALTER TYPE "enum_Users_role" ADD VALUE 'head_admin';`);
          console.log('Added head_admin to role enum (PostgreSQL)');
        }
        
        // Ensure payment_update is in the Notifications event_type enum
        const [notifyResults] = await sequelize.query(`SELECT enum_range(NULL::"enum_Notifications_event_type") as values;`);
        const notifyValues = notifyResults[0].values ? notifyResults[0].values.replace(/[{}]/g, '').split(',') : [];
        if (!notifyValues.includes('payment_update')) {
          await sequelize.query(`ALTER TYPE "enum_Notifications_event_type" ADD VALUE 'payment_update';`);
          console.log('Added payment_update to notification enum (PostgreSQL)');
        }

      } else {
        // SQLite or other dialects - skip complex ENUM alteration
        console.log('Skipping ENUM migration for non-Postgres dialect:', sequelize.getDialect());
      }
    } catch (e) {
      console.error('Failed to alter role enum:', e.message);
    }

    await ensureSeedAdmin();

    setInterval(() => {
      processPendingSyncEvents().catch((err) => {
        console.error('Sync processor error:', err);
      });
    }, 5000);

    const available = await checkPortAvailable(PORT);
    if (!available) {
      console.error(`Port ${PORT} is already in use.`);
      process.exit(1);
    }

    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  }).catch(err => {
    console.error('Database connection failed:', err);
  });
}

module.exports = app;
