const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Op } = require('sequelize');
const { User, Invite, Notification, AuditLog, School } = require('../models');
const { verifyToken } = require('../middleware/auth');
const sse = require('../services/sse');
const { queueLoginEmail, queueEmailNotification } = require('../services/syncService');
const IntegrationService = require('../services/integrationService');
const { createSyncEvent } = require('../services/syncService');

const normalizeNigerianPhone = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return { error: 'Phone number is required' };
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) return { error: 'Phone number is required' };
  if (digits.startsWith('0')) {
    if (!/^0(70|80|81|90|91)\d{8}$/.test(digits)) {
      return { error: 'Invalid Nigerian phone number' };
    }
    return { normalized: `+234${digits.slice(1)}`, local: digits };
  }
  if (digits.startsWith('234')) {
    if (!/^234(70|80|81|90|91)\d{8}$/.test(digits)) {
      return { error: 'Invalid Nigerian phone number' };
    }
    return { normalized: `+${digits}`, local: `0${digits.slice(3)}` };
  }
  return { error: 'Invalid Nigerian phone number' };
};
const normalizeEmail = (value) => {
  if (!value) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed.toLowerCase() : null;
};
const generateOtp = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
const otpExpiresAt = () => new Date(Date.now() + 10 * 60 * 1000);
const shouldThrottle = (sentAt, cooldownSeconds = 60) => {
  if (!sentAt) return false;
  const sinceMs = Date.now() - new Date(sentAt).getTime();
  return sinceMs < cooldownSeconds * 1000;
};
const remainingCooldown = (sentAt, cooldownSeconds = 60) => {
  if (!sentAt) return 0;
  const sinceMs = Date.now() - new Date(sentAt).getTime();
  return Math.max(0, cooldownSeconds - Math.floor(sinceMs / 1000));
};
const STAFF_ROLES = new Set(['admin', 'receptionist', 'washer', 'rider']);
const isStaffUser = (user) => !!user && STAFF_ROLES.has(user.role);
const buildStaffEmail = (title, message, meta = {}) => {
  const time = new Date().toISOString();
  const lines = [
    title,
    message,
    `Time: ${time}`
  ];
  if (meta.ip) lines.push(`IP: ${meta.ip}`);
  if (meta.userAgent) lines.push(`Device: ${meta.userAgent}`);
  if (meta.phone) lines.push(`Phone: ${meta.phone}`);
  if (meta.email) lines.push(`Email: ${meta.email}`);
  if (meta.details) lines.push(`Details: ${meta.details}`);
  return lines.join('\n');
};
const notifyUserInApp = async (userId, title, message, eventType = 'system') => {
  if (!userId) return null;
  return Notification.create({
    user_id: userId,
    title,
    message,
    event_type: eventType,
    channel: 'app'
  });
};
const notifyAdmins = async ({ title, message, subject, text, action, meta, actorUserId }) => {
  const admins = await User.findAll({ where: { role: 'admin' } });
  if (admins.length === 0) return;
  await Notification.bulkCreate(admins.map((admin) => ({
    user_id: admin.user_id,
    title,
    message,
    event_type: 'system',
    channel: 'app'
  })));
  const emailSubject = subject || title;
  const emailText = text || message;
  await Promise.all(admins.map((admin) => (
    queueEmailNotification({
      action,
      entityId: `admin:${action}:${admin.user_id}:${Date.now()}`,
      to: admin.email,
      subject: emailSubject,
      text: emailText,
      html: null,
      userId: admin.user_id,
      meta,
      source: 'auth',
      actorUserId
    })
  )));
};
const notifyStaffUser = async ({ user, title, message, subject, text, action, meta, actorUserId }) => {
  if (!isStaffUser(user)) return;
  await notifyUserInApp(user.user_id, title, message, 'system');
  await queueEmailNotification({
    action,
    entityId: `staff:${action}:${user.user_id}:${Date.now()}`,
    to: user.email,
    subject: subject || title,
    text: text || message,
    html: null,
    userId: user.user_id,
    meta,
    source: 'auth',
    actorUserId
  });
};

// Register
router.post('/register', async (req, res) => {
  try {
    const { full_name, email, phone_number, password, student_id, school, hostel_address, role, profile_fields } = req.body;
    const phoneResult = normalizeNigerianPhone(phone_number);
    const cleanEmail = normalizeEmail(email);
    
    // Validation
    if (!full_name || !cleanEmail || !password || !phone_number) {
      return res.status(400).json({ error: 'Full name, email, phone number and password are required', code: 'missing_credentials' });
    }
    if (phoneResult.error) {
      return res.status(400).json({ error: phoneResult.error, code: 'invalid_phone' });
    }
    
    // Check if email or phone exists
    const existingEmail = await User.findOne({ where: { email: cleanEmail } });
    if (existingEmail) return res.status(400).json({ error: 'Email already registered' });
    
    const existingPhone = await User.findOne({ where: { phone_number: { [Op.in]: [phoneResult.normalized, phoneResult.local] } } });
    if (existingPhone) return res.status(400).json({ error: 'Phone number already registered' });

    const hashedPassword = await bcrypt.hash(password, 10);
    let cleanSchool = school ? String(school).trim() : null;
    if (cleanSchool) {
      const match = await School.findOne({ where: { school_name: cleanSchool, active: true } });
      if (!match) {
        return res.status(400).json({ error: 'Selected school is not available', code: 'invalid_school' });
      }
      cleanSchool = match.school_name;
    }
    const nextProfileFields = profile_fields && typeof profile_fields === 'object' && !Array.isArray(profile_fields)
      ? profile_fields
      : null;
    
    const resolvedRole = role || 'student';
    const needsEmailVerification = resolvedRole === 'student';
    const user = await User.create({
      full_name,
      email: cleanEmail,
      phone_number: phoneResult.normalized,
      password: hashedPassword,
      student_id,
      school: cleanSchool,
      hostel_address,
      profile_fields: nextProfileFields,
      role: resolvedRole,
      email_verified: !needsEmailVerification,
      email_verified_at: !needsEmailVerification ? new Date() : null
    });

    if (needsEmailVerification) {
      const otp = generateOtp();
      const otpHash = await bcrypt.hash(otp, 10);
      const expiresAt = otpExpiresAt();
      await user.update({
        email_verification_otp_hash: otpHash,
        email_verification_expires_at: expiresAt,
        email_verification_sent_at: new Date()
      });
      await IntegrationService.sendEmail(
        user.email,
        'Verify your email',
        `Your verification code is ${otp}. It expires in 10 minutes.`
      );
    }
    const tokenPayload = { user_id: user.user_id, role: user.role, token_version: user.token_version || 0 };
    const token = !needsEmailVerification
      ? jwt.sign(tokenPayload, process.env.JWT_SECRET || 'secret', { expiresIn: '24h' })
      : null;

    sse.broadcast('user_registered', user);

    res.status(201).json({ message: 'User created successfully', token, user, verification_required: needsEmailVerification });
  } catch (error) {
    console.error('Register error:', error?.message || error);
    res.status(500).json({ error: 'Server error', code: 'server_error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { phone_number, email, password } = req.body;
    
    // Determine login method
    const isEmailLogin = !!email || (phone_number && phone_number.includes('@'));
    let user;
    let identifier;
    let phoneResult = null;

    if (isEmailLogin) {
      const emailInput = email || phone_number;
      identifier = normalizeEmail(emailInput);
      if (!identifier) return res.status(400).json({ error: 'Invalid email address', code: 'invalid_email' });
      user = await User.findOne({ where: { email: identifier } });
    } else {
      const phoneInput = phone_number;
      if (!phoneInput) {
        return res.status(400).json({ error: 'Phone number or Email is required', code: 'missing_credentials' });
      }
      phoneResult = normalizeNigerianPhone(phoneInput);
      if (phoneResult.error) {
        return res.status(400).json({ error: phoneResult.error, code: 'invalid_phone' });
      }
      identifier = phoneResult.normalized;
      user = await User.findOne({ where: { phone_number: { [Op.in]: [phoneResult.normalized, phoneResult.local] } } });
    }

    if (!password) {
      return res.status(400).json({ error: 'Password is required', code: 'missing_credentials' });
    }
    
    if (!user) {
      console.info('Login failed: user not found', { identifier, ip: req.ip, ua: req.get('User-Agent') || 'unknown' });
      await AuditLog.create({
        actor_user_id: null,
        action: 'login_failed',
        entity_type: 'user',
        entity_id: `id:${identifier}`,
        details: 'User not found'
      });
      const meta = {
        ip: req.ip,
        userAgent: req.get('User-Agent') || 'Unknown',
        [isEmailLogin ? 'email' : 'phone']: identifier
      };
      const text = buildStaffEmail('Failed login attempt', 'Unknown user login attempt detected.', meta);
      await notifyAdmins({
        title: 'Failed login attempt',
        message: 'Unknown user login attempt detected.',
        subject: 'Failed login attempt',
        text,
        action: 'login_failed_unknown',
        meta
      });
      return res.status(401).json({ error: 'Invalid credentials', code: 'invalid_credentials' });
    }

    if (user.is_deleted || user.status === 'suspended' || user.status === 'inactive') {
      console.info('Login blocked: suspended', { user_id: user.user_id, ip: req.ip });
      await AuditLog.create({
        actor_user_id: user.user_id,
        action: 'login_blocked',
        entity_type: 'user',
        entity_id: String(user.user_id),
        details: user.is_deleted ? 'Account deleted' : `Account ${user.status}`
      });
      return res.status(403).json({ error: 'Account inactive. Please contact support.', code: 'account_inactive' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    
    if (!validPassword) {
      // SECURITY: Track failed login
      user.failed_login_attempts = (user.failed_login_attempts || 0) + 1;
      user.last_failed_login = new Date();
      
      if (user.failed_login_attempts >= 3 && !user.is_flagged) {
        user.is_flagged = true;
        user.flag_reason = 'Multiple failed logins';
        if (isStaffUser(user)) {
          await notifyUserInApp(user.user_id, 'Security Alert', 'Your account has been flagged due to multiple failed login attempts.', 'system');
          const meta = {
            ip: req.ip,
            userAgent: req.get('User-Agent') || 'Unknown',
            phone: user.phone_number,
            email: user.email,
            details: 'Multiple failed login attempts'
          };
          const text = buildStaffEmail('Suspicious login activity', 'Account flagged due to multiple failed login attempts.', meta);
          await notifyAdmins({
            title: 'Suspicious login activity',
            message: `Account flagged for ${user.full_name || user.email || user.user_id}.`,
            subject: 'Suspicious login activity',
            text,
            action: 'login_suspicious',
            meta,
            actorUserId: user.user_id
          });
        }
      }
      await user.save();

      await AuditLog.create({
        actor_user_id: user.user_id,
        action: 'login_failed',
        entity_type: 'user',
        entity_id: String(user.user_id),
        details: `Failed attempt ${user.failed_login_attempts} from ${req.ip}`
      });

      const meta = {
        ip: req.ip,
        userAgent: req.get('User-Agent') || 'Unknown',
        phone: user.phone_number,
        email: user.email
      };
      if (isStaffUser(user)) {
        const text = buildStaffEmail('Failed login attempt', `Failed login attempt for ${user.full_name || user.email || user.user_id}.`, meta);
        await notifyStaffUser({
          user,
          title: 'Failed login attempt',
          message: 'We detected a failed login attempt on your account.',
          subject: 'Failed login attempt',
          text,
          action: 'login_failed',
          meta,
          actorUserId: user.user_id
        });
        await notifyAdmins({
          title: 'Failed staff login',
          message: `Failed login for ${user.full_name || user.email || user.user_id}.`,
          subject: 'Failed staff login',
          text,
          action: 'staff_login_failed',
          meta,
          actorUserId: user.user_id
        });
      }
      console.info('Login failed: invalid password', { user_id: user.user_id, ip: req.ip });
      return res.status(401).json({ error: 'Invalid credentials', code: 'invalid_credentials' });
    }

    // SECURITY: Reset on success
    if (user.failed_login_attempts > 0) {
        user.failed_login_attempts = 0;
        await user.save();
    }

    if (user.role === 'student' && !user.email_verified) {
      await AuditLog.create({
        actor_user_id: user.user_id,
        action: 'login_blocked',
        entity_type: 'user',
        entity_id: String(user.user_id),
        details: 'Email not verified'
      });
      return res.status(403).json({ error: 'Email not verified', code: 'email_unverified', email: user.email });
    }

    await AuditLog.create({
        actor_user_id: user.user_id,
        action: 'login_success',
        entity_type: 'user',
        entity_id: String(user.user_id),
        details: `Login successful from ${req.ip}`
    });

    try {
      await queueLoginEmail({
        user,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });
    } catch (e) {
      console.error('Login email queue failed:', e.message);
    }

    if (isStaffUser(user)) {
      await notifyUserInApp(user.user_id, 'Login successful', 'A successful login was detected on your account.', 'system');
      const profileFields = user.profile_fields && typeof user.profile_fields === 'object' && !Array.isArray(user.profile_fields)
        ? { ...user.profile_fields }
        : {};
      const lastMeta = profileFields.last_login_meta || null;
      const nextMeta = {
        ip_address: req.ip || 'Unknown',
        user_agent: req.get('User-Agent') || 'Unknown',
        logged_in_at: new Date().toISOString()
      };
      const isNewDevice = !!lastMeta && (
        lastMeta.ip_address !== nextMeta.ip_address ||
        lastMeta.user_agent !== nextMeta.user_agent
      );
      profileFields.last_login_meta = nextMeta;
      await user.update({ profile_fields: profileFields });
      if (isNewDevice) {
        const meta = {
          ip: nextMeta.ip_address,
          userAgent: nextMeta.user_agent,
          email: user.email
        };
        const text = buildStaffEmail('New device access', `New device or session detected for ${user.full_name || user.email || user.user_id}.`, meta);
        await notifyStaffUser({
          user,
          title: 'New device access',
          message: 'We detected a login from a new device or session.',
          subject: 'New device access',
          text,
          action: 'new_device_login',
          meta,
          actorUserId: user.user_id
        });
      }
    }

    const token = jwt.sign({ user_id: user.user_id, role: user.role, token_version: user.token_version || 0 }, process.env.JWT_SECRET || 'secret', { expiresIn: '24h' });

    console.info('Login success', { user_id: user.user_id, role: user.role, ip: req.ip });
    res.json({ message: 'Login successful', token, user });
  } catch (error) {
    console.error('Login error:', error?.message || error);
    res.status(500).json({ error: 'Server error', code: 'server_error' });
  }
});

// Signup route for creating head admin
router.post('/signup', async (req, res) => {
  try {
    const { phone_number, password, name, role } = req.body;

    // Validate required fields
    if (!phone_number || !password || !name || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Normalize phone number
    const phoneResult = normalizeNigerianPhone(phone_number);
    if (phoneResult.error) {
      return res.status(400).json({ error: phoneResult.error, code: 'invalid_phone' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ where: { phone_number: { [Op.in]: [phoneResult.normalized, phoneResult.local] } } });
    if (existingUser) {
      return res.status(409).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const newUser = await User.create({
      full_name: name,
      phone_number: phoneResult.normalized,
      password: hashedPassword,
      role,
      email_verified: true,
      email_verified_at: new Date()
    });

    // Return success (don't return the password)
    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: newUser.user_id,
        phone: newUser.phone_number,
        name: newUser.full_name,
        role: newUser.role,
      }
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Accept Staff Invite and Register
router.post('/accept-invite', async (req, res) => {
  try {
    const { token, full_name, phone_number, password } = req.body;
    if (!token || !full_name || !phone_number || !password) {
      return res.status(400).json({ error: 'token, full_name, phone_number, password are required' });
    }
    const phoneResult = normalizeNigerianPhone(phone_number);
    if (phoneResult.error) {
      return res.status(400).json({ error: phoneResult.error, code: 'invalid_phone' });
    }
    const invite = await Invite.findOne({ where: { token, status: 'pending' } });
    if (!invite) return res.status(404).json({ error: 'Invalid invite token' });
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      invite.status = 'expired';
      await invite.save();
      return res.status(400).json({ error: 'Invite expired' });
    }
    if (invite.phone_number && invite.phone_number !== phoneResult.normalized && invite.phone_number !== phoneResult.local) {
      return res.status(400).json({ error: 'Invite was issued to a different phone number' });
    }
    const exists = await User.findOne({ where: { phone_number: { [Op.in]: [phoneResult.normalized, phoneResult.local] } } });
    if (exists) return res.status(400).json({ error: 'Phone number already registered' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      full_name,
      phone_number: phoneResult.normalized,
      password: hashedPassword,
      role: invite.role,
      email_verified: true,
      email_verified_at: new Date()
    });
    invite.status = 'accepted';
    await invite.save();
    const jwtToken = jwt.sign({ user_id: user.user_id, role: user.role, token_version: user.token_version || 0 }, process.env.JWT_SECRET || 'secret', { expiresIn: '24h' });
    sse.broadcast('user_registered', user);
    return res.status(201).json({ message: 'Staff registered via invite', token: jwtToken, user });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/email-verification/resend', async (req, res) => {
  try {
    const cleanEmail = normalizeEmail(req.body?.email);
    if (!cleanEmail) return res.status(400).json({ error: 'Email is required', code: 'missing_email' });
    const user = await User.findOne({ where: { email: cleanEmail } });
    if (!user) return res.status(404).json({ error: 'User not found', code: 'user_not_found' });
    if (user.email_verified) return res.status(400).json({ error: 'Email already verified', code: 'already_verified' });
    if (shouldThrottle(user.email_verification_sent_at)) {
      return res.status(429).json({ error: 'Please wait before resending', code: 'cooldown', cooldown_seconds: remainingCooldown(user.email_verification_sent_at) });
    }
    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = otpExpiresAt();
    await user.update({
      email_verification_otp_hash: otpHash,
      email_verification_expires_at: expiresAt,
      email_verification_sent_at: new Date()
    });
    await IntegrationService.sendEmail(
      user.email,
      'Verify your email',
      `Your verification code is ${otp}. It expires in 10 minutes.`
    );
    res.json({ message: 'Verification code sent', cooldown_seconds: 60 });
  } catch (error) {
    res.status(500).json({ error: 'Server error', code: 'server_error' });
  }
});

router.post('/email-verification/verify', async (req, res) => {
  try {
    const cleanEmail = normalizeEmail(req.body?.email);
    const otp = String(req.body?.otp || '').trim();
    if (!cleanEmail || !otp) return res.status(400).json({ error: 'Email and OTP are required', code: 'missing_credentials' });
    const user = await User.findOne({ where: { email: cleanEmail } });
    if (!user) return res.status(404).json({ error: 'User not found', code: 'user_not_found' });
    if (user.email_verified) return res.json({ message: 'Email verified', user });
    if (!user.email_verification_otp_hash || !user.email_verification_expires_at) {
      return res.status(400).json({ error: 'No verification code found', code: 'missing_otp' });
    }
    if (new Date(user.email_verification_expires_at) < new Date()) {
      return res.status(400).json({ error: 'Verification code expired', code: 'otp_expired' });
    }
    const validOtp = await bcrypt.compare(otp, user.email_verification_otp_hash);
    if (!validOtp) {
      return res.status(400).json({ error: 'Invalid verification code', code: 'otp_invalid' });
    }
    await user.update({
      email_verified: true,
      email_verified_at: new Date(),
      email_verification_otp_hash: null,
      email_verification_expires_at: null
    });
    await AuditLog.create({
      actor_user_id: user.user_id,
      action: 'email_verified',
      entity_type: 'user',
      entity_id: String(user.user_id),
      details: 'Email verified by user'
    });
    await createSyncEvent({
      actor_user_id: user.user_id,
      target_user_id: user.user_id,
      source: 'student',
      entity_type: 'profile',
      entity_id: user.user_id,
      action: 'email_verified',
      payload: { email_verified: true },
      critical: true
    });
    sse.broadcast('user_updated', user);
    res.json({ message: 'Email verified', user });
  } catch (error) {
    res.status(500).json({ error: 'Server error', code: 'server_error' });
  }
});

router.post('/password-reset/request', async (req, res) => {
  try {
    const cleanEmail = normalizeEmail(req.body?.email);
    if (!cleanEmail) return res.status(400).json({ error: 'Email is required', code: 'missing_email' });
    const user = await User.findOne({ where: { email: cleanEmail } });
    if (!user) {
      await AuditLog.create({
        actor_user_id: null,
        action: 'password_reset_failed',
        entity_type: 'user',
        entity_id: `email:${cleanEmail}`,
        details: 'User not found'
      });
      return res.json({ message: 'If the email exists, a reset code has been sent' });
    }
    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = otpExpiresAt();
    await user.update({
      password_reset_otp_hash: otpHash,
      password_reset_expires_at: expiresAt,
      password_reset_requested_at: new Date()
    });
    await IntegrationService.sendEmail(
      user.email,
      'Password reset code',
      `Your password reset code is ${otp}. It expires in 10 minutes.`
    );
    await AuditLog.create({
      actor_user_id: user.user_id,
      action: 'password_reset_requested',
      entity_type: 'user',
      entity_id: String(user.user_id),
      details: 'Password reset requested'
    });
    if (isStaffUser(user)) {
      const meta = {
        ip: req.ip,
        userAgent: req.get('User-Agent') || 'Unknown',
        email: user.email
      };
      const text = buildStaffEmail('Password reset requested', `Password reset requested for ${user.full_name || user.email || user.user_id}.`, meta);
      await notifyStaffUser({
        user,
        title: 'Password reset requested',
        message: 'A password reset was requested for your account.',
        subject: 'Password reset requested',
        text,
        action: 'password_reset_requested',
        meta,
        actorUserId: user.user_id
      });
      await notifyAdmins({
        title: 'Staff password reset requested',
        message: `Password reset requested for ${user.full_name || user.email || user.user_id}.`,
        subject: 'Staff password reset requested',
        text,
        action: 'staff_password_reset_requested',
        meta,
        actorUserId: user.user_id
      });
    }
    res.json({ message: 'If the email exists, a reset code has been sent' });
  } catch (error) {
    res.status(500).json({ error: 'Server error', code: 'server_error' });
  }
});

router.post('/password-reset/reset', async (req, res) => {
  try {
    const cleanEmail = normalizeEmail(req.body?.email);
    const otp = String(req.body?.otp || '').trim();
    const password = String(req.body?.password || '');
    if (!cleanEmail || !otp || !password) {
      return res.status(400).json({ error: 'Email, OTP and password are required', code: 'missing_credentials' });
    }
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/;
    if (!passwordRegex.test(password)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long and contain both letters and numbers.' });
    }
    const user = await User.findOne({ where: { email: cleanEmail } });
    if (!user) return res.status(404).json({ error: 'User not found', code: 'user_not_found' });
    if (!user.password_reset_otp_hash || !user.password_reset_expires_at) {
      return res.status(400).json({ error: 'No reset code found', code: 'missing_otp' });
    }
    if (new Date(user.password_reset_expires_at) < new Date()) {
      return res.status(400).json({ error: 'Reset code expired', code: 'otp_expired' });
    }
    const validOtp = await bcrypt.compare(otp, user.password_reset_otp_hash);
    if (!validOtp) {
      await AuditLog.create({
        actor_user_id: user.user_id,
        action: 'password_reset_failed',
        entity_type: 'user',
        entity_id: String(user.user_id),
        details: 'Invalid reset code'
      });
      return res.status(400).json({ error: 'Invalid reset code', code: 'otp_invalid' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const nextTokenVersion = (user.token_version || 0) + 1;
    await user.update({
      password: hashedPassword,
      password_reset_otp_hash: null,
      password_reset_expires_at: null,
      token_version: nextTokenVersion
    });
    await AuditLog.create({
      actor_user_id: user.user_id,
      action: 'password_reset_completed',
      entity_type: 'user',
      entity_id: String(user.user_id),
      details: 'Password reset completed'
    });
    await createSyncEvent({
      actor_user_id: user.user_id,
      target_user_id: user.user_id,
      source: 'student',
      entity_type: 'profile',
      entity_id: user.user_id,
      action: 'password_reset',
      payload: { token_version: nextTokenVersion },
      critical: true
    });
    if (isStaffUser(user)) {
      const meta = {
        ip: req.ip,
        userAgent: req.get('User-Agent') || 'Unknown',
        email: user.email
      };
      const text = buildStaffEmail('Password reset completed', `Password reset completed for ${user.full_name || user.email || user.user_id}.`, meta);
      await notifyStaffUser({
        user,
        title: 'Password reset completed',
        message: 'Your password has been reset successfully.',
        subject: 'Password reset completed',
        text,
        action: 'password_reset_completed',
        meta,
        actorUserId: user.user_id
      });
      await notifyAdmins({
        title: 'Staff password reset completed',
        message: `Password reset completed for ${user.full_name || user.email || user.user_id}.`,
        subject: 'Staff password reset completed',
        text,
        action: 'staff_password_reset_completed',
        meta,
        actorUserId: user.user_id
      });
    }
    res.json({ message: 'Password reset successful' });
  } catch (error) {
    res.status(500).json({ error: 'Server error', code: 'server_error' });
  }
});

router.post('/logout', verifyToken, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.user_id);
    if (!user) return res.status(404).json({ error: 'User not found', code: 'user_not_found' });
    await AuditLog.create({
      actor_user_id: user.user_id,
      action: 'logout',
      entity_type: 'user',
      entity_id: String(user.user_id),
      details: `Logout from ${req.ip}`
    });
    if (isStaffUser(user)) {
      const meta = {
        ip: req.ip,
        userAgent: req.get('User-Agent') || 'Unknown',
        email: user.email
      };
      const text = buildStaffEmail('Logout detected', `Logout detected for ${user.full_name || user.email || user.user_id}.`, meta);
      await notifyStaffUser({
        user,
        title: 'Logout detected',
        message: 'You have been logged out successfully.',
        subject: 'Logout detected',
        text,
        action: 'logout',
        meta,
        actorUserId: user.user_id
      });
    }
    res.json({ message: 'Logged out' });
  } catch (error) {
    res.status(500).json({ error: 'Server error', code: 'server_error' });
  }
});

module.exports = router;
