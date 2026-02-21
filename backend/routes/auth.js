const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { executeQuery, getSingleRow } = require('../config/database');
const { generateToken, verifyToken, authorize } = require('../middleware/auth');
const { logActivity } = require('../middleware/activity');

const router = express.Router();

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false, 
      errors: errors.array() 
    });
  }
  next();
};

// Register new user
router.post('/register', [
  body('username').trim().isLength({ min: 3, max: 50 }).withMessage('Username must be 3-50 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').optional().isIn(['admin', 'hr', 'worker']).withMessage('Invalid role')
], validate, async (req, res) => {
  try {
    const { username, email, password, role = 'worker' } = req.body;

    // Check if user exists
    const existingUser = await getSingleRow(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email]
    );

    if (existingUser.success && existingUser.data) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username or email already exists' 
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user
    const result = await executeQuery(
      'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
      [username, email, hashedPassword, role]
    );

    if (result.success) {
      await logActivity(null, 'user_register', `New user registered: ${username}`);
      
      res.status(201).json({
        success: true,
        message: 'User registered successfully'
      });
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Login
router.post('/login', [
  body('username').trim().notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required')
], validate, async (req, res) => {
  try {
    const { username, password } = req.body;

    // Get user
    const user = await getSingleRow(
      'SELECT * FROM users WHERE username = ? OR email = ?',
      [username, username]
    );

    if (!user.success || !user.data) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.data.password);
    if (!isMatch) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }

    // Generate token
    const token = generateToken(user.data);

    await logActivity(user.data.id, 'user_login', `User logged in: ${user.data.username}`);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user.data.id,
          username: user.data.username,
          email: user.data.email,
          role: user.data.role
        }
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Get current user
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await getSingleRow(
      'SELECT id, username, email, role, created_at FROM users WHERE id = ?',
      [req.user.id]
    );

    if (!user.success || !user.data) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    res.json({
      success: true,
      data: user.data
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Change password
router.post('/change-password', [
  verifyToken,
  body('currentPassword').notEmpty().withMessage('Current password required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
], validate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await getSingleRow(
      'SELECT password FROM users WHERE id = ?',
      [req.user.id]
    );

    if (!user.success || !user.data) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.data.password);
    if (!isMatch) {
      return res.status(400).json({ 
        success: false, 
        message: 'Current password is incorrect' 
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    await executeQuery(
      'UPDATE users SET password = ? WHERE id = ?',
      [hashedPassword, req.user.id]
    );

    await logActivity(req.user.id, 'password_change', 'Password changed successfully');

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Get all users (admin only)
router.get('/users', verifyToken, authorize('admin'), async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    const offset = (page - 1) * limit;

    let query = 'SELECT id, username, email, role, created_at FROM users';
    let countQuery = 'SELECT COUNT(*) as total FROM users';
    const params = [];

    if (search) {
      query += ' WHERE username LIKE ? OR email LIKE ?';
      countQuery += ' WHERE username LIKE ? OR email LIKE ?';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    
    const users = await executeQuery(query, [...params, parseInt(limit), parseInt(offset)]);
    const total = await getSingleRow(countQuery, params);

    res.json({
      success: true,
      data: {
        users: users.data,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: total.data?.total || 0,
          pages: Math.ceil((total.data?.total || 0) / limit)
        }
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Update user role (admin only)
router.put('/users/:id/role', [
  verifyToken,
  authorize('admin'),
  body('role').isIn(['admin', 'hr', 'worker']).withMessage('Invalid role')
], validate, async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    const result = await executeQuery(
      'UPDATE users SET role = ? WHERE id = ?',
      [role, id]
    );

    if (result.success) {
      await logActivity(req.user.id, 'role_update', `Updated user ${id} role to ${role}`);
      
      res.json({
        success: true,
        message: 'Role updated successfully'
      });
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Delete user (admin only)
router.delete('/users/:id', verifyToken, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot delete your own account' 
      });
    }

    const result = await executeQuery('DELETE FROM users WHERE id = ?', [id]);

    if (result.success) {
      await logActivity(req.user.id, 'user_delete', `Deleted user ${id}`);
      
      res.json({
        success: true,
        message: 'User deleted successfully'
      });
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

module.exports = router;
