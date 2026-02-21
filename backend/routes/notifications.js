const express = require('express');
const { body, validationResult } = require('express-validator');
const { executeQuery, getSingleRow } = require('../config/database');
const { verifyToken, authorize } = require('../middleware/auth');
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

// Get notifications for current user
router.get('/', verifyToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, unread_only } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'n.user_id = ?';
    const params = [req.user.id];

    if (unread_only === 'true') {
      whereClause += ' AND n.is_read = FALSE';
    }

    const query = `
      SELECT * FROM notifications n
      WHERE ${whereClause}
      ORDER BY n.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const countQuery = `
      SELECT COUNT(*) as total FROM notifications n
      WHERE ${whereClause}
    `;

    const notifications = await executeQuery(query, [...params, parseInt(limit), parseInt(offset)]);
    const total = await getSingleRow(countQuery, params);

    // Get unread count
    const unreadCount = await getSingleRow(`
      SELECT COUNT(*) as count FROM notifications 
      WHERE user_id = ? AND is_read = FALSE
    `, [req.user.id]);

    res.json({
      success: true,
      data: {
        notifications: notifications.data,
        unread_count: unreadCount.data?.count || 0,
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

// Create notification (admin only)
router.post('/', [
  verifyToken,
  authorize('admin'),
  body('user_id').isInt().withMessage('Valid user ID required'),
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('message').trim().notEmpty().withMessage('Message is required'),
  body('type').optional().isIn(['info', 'warning', 'success', 'error'])
], validate, async (req, res) => {
  try {
    const { user_id, title, message, type = 'info' } = req.body;

    const result = await executeQuery(
      'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
      [user_id, title, message, type]
    );

    if (result.success) {
      res.status(201).json({
        success: true,
        message: 'Notification sent',
        data: { id: result.data?.insertId }
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

// Broadcast notification to all users
router.post('/broadcast', [
  verifyToken,
  authorize('admin'),
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('message').trim().notEmpty().withMessage('Message is required'),
  body('type').optional().isIn(['info', 'warning', 'success', 'error'])
], validate, async (req, res) => {
  try {
    const { title, message, type = 'info', role } = req.body;

    // Get user IDs
    let users;
    if (role) {
      users = await executeQuery(
        'SELECT id FROM users WHERE role = ?',
        [role]
      );
    } else {
      users = await executeQuery('SELECT id FROM users');
    }

    let successCount = 0;
    for (const user of users.data) {
      const result = await executeQuery(
        'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
        [user.id, title, message, type]
      );
      if (result.success) successCount++;
    }

    await logActivity(req.user.id, 'notification_broadcast', `Broadcast notification to ${successCount} users`);

    res.json({
      success: true,
      message: `Notification sent to ${successCount} users`,
      data: { count: successCount }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Mark notification as read
router.put('/:id/read', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await executeQuery(
      'UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    if (result.success) {
      res.json({
        success: true,
        message: 'Notification marked as read'
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

// Mark all notifications as read
router.put('/read-all', verifyToken, async (req, res) => {
  try {
    const result = await executeQuery(
      'UPDATE notifications SET is_read = TRUE WHERE user_id = ?',
      [req.user.id]
    );

    res.json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Delete notification
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await executeQuery(
      'DELETE FROM notifications WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    if (result.success) {
      res.json({
        success: true,
        message: 'Notification deleted'
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

// Delete all read notifications
router.delete('/cleanup/read', verifyToken, async (req, res) => {
  try {
    const result = await executeQuery(
      'DELETE FROM notifications WHERE user_id = ? AND is_read = TRUE',
      [req.user.id]
    );

    res.json({
      success: true,
      message: 'Read notifications cleaned up'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

module.exports = router;
