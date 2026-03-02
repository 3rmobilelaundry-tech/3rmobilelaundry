const jwt = require('jsonwebtoken');
const { User } = require('../models');

const verifyToken = async (req, res, next) => {
  const token = req.headers['authorization'];

  if (!token) {
    return res.status(403).json({ error: 'A token is required for authentication', code: 'missing_token' });
  }

  try {
    const bearer = token.split(' ');
    const bearerToken = bearer[1] || token;
    
    const decoded = jwt.verify(bearerToken, process.env.JWT_SECRET || 'secret');
    
    // Fetch latest user data to ensure role/status is up to date
    const user = await User.findByPk(decoded.user_id);
    if (!user) {
      return res.status(401).json({ error: 'User not found', code: 'user_not_found' });
    }

    if (user.is_deleted || user.status === 'suspended' || user.status === 'inactive') {
      return res.status(403).json({ error: 'Account inactive', code: 'account_inactive' });
    }

    if ((decoded?.token_version || 0) !== (user.token_version || 0)) {
      return res.status(401).json({ error: 'Invalid Token', code: 'invalid_token' });
    }

    // Update req.user with latest data (especially role)
    req.user = {
      user_id: user.user_id,
      role: user.role,
      email_verified: user.email_verified,
      phone_verified: user.phone_verified,
      ...decoded // keep other claims if any
    };
    
  } catch (err) {
    return res.status(401).json({ error: 'Invalid Token', code: 'invalid_token' });
  }
  return next();
};

const verifyRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized', code: 'unauthorized' });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied. Insufficient permissions.', code: 'forbidden' });
    }
    
    next();
  };
};

module.exports = { verifyToken, verifyRole };
