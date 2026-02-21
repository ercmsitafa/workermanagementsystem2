const express = require('express');
const { executeQuery, getSingleRow } = require('../config/database');
const { verifyToken, authorize } = require('../middleware/auth');

const router = express.Router();

// Get activity logs
router.get('/', verifyToken, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      userId,
      action,
      startDate,
      endDate
    } = req.query;
    
    const offset = (page - 1) * limit;

    let whereClause = '1=1';
    const params = [];

    if (userId) {
      whereClause += ' AND al.user_id = ?';
      params.push(userId);
    }

    if (action) {
      whereClause += ' AND al.action = ?';
      params.push(action);
    }

    if (startDate) {
      whereClause += ' AND DATE(al.created_at) >= ?';
      params.push(startDate);
    }

    if (endDate) {
      whereClause += ' AND DATE(al.created_at) <= ?';
      params.push(endDate);
    }

    const query = `
      SELECT al.*, u.username, u.email 
      FROM activity_logs al 
      LEFT JOIN users u ON al.user_id = u.id
      WHERE ${whereClause}
      ORDER BY al.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const countQuery = `
      SELECT COUNT(*) as total 
      FROM activity_logs al
      WHERE ${whereClause}
    `;

    const logs = await executeQuery(query, [...params, parseInt(limit), parseInt(offset)]);
    const total = await getSingleRow(countQuery, params);

    // Get action statistics
    const actionStats = await executeQuery(`
      SELECT action, COUNT(*) as count
      FROM activity_logs
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
      GROUP BY action
      ORDER BY count DESC
      LIMIT 10
    `);

    res.json({
      success: true,
      data: {
        logs: logs.data,
        action_stats: actionStats.data,
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

// Get user activity
router.get('/user/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50 } = req.query;

    const logs = await executeQuery(`
      SELECT * FROM activity_logs 
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `, [userId, parseInt(limit)]);

    res.json({
      success: true,
      data: logs.data
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Get recent activity summary
router.get('/summary', verifyToken, async (req, res) => {
  try {
    const today = await getSingleRow(`
      SELECT COUNT(*) as count FROM activity_logs 
      WHERE DATE(created_at) = CURDATE()
    `);

    const thisWeek = await getSingleRow(`
      SELECT COUNT(*) as count FROM activity_logs 
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
    `);

    const thisMonth = await getSingleRow(`
      SELECT COUNT(*) as count FROM activity_logs 
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
    `);

    const recentLogs = await executeQuery(`
      SELECT al.*, u.username 
      FROM activity_logs al 
      LEFT JOIN users u ON al.user_id = u.id
      ORDER BY al.created_at DESC
      LIMIT 10
    `);

    res.json({
      success: true,
      data: {
        today: today.data?.count || 0,
        this_week: thisWeek.data?.count || 0,
        this_month: thisMonth.data?.count || 0,
        recent: recentLogs.data
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Delete old logs (admin only)
router.delete('/cleanup', verifyToken, authorize('admin'), async (req, res) => {
  try {
    const { days = 90 } = req.query;

    const result = await executeQuery(`
      DELETE FROM activity_logs 
      WHERE created_at < DATE_SUB(CURDATE(), INTERVAL ? DAY)
    `, [parseInt(days)]);

    res.json({
      success: true,
      message: `Deleted ${result.data?.affectedRows || 0} old activity logs`
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

module.exports = router;
