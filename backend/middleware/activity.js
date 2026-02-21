const { executeQuery } = require('../config/database');

// Log user activity
const logActivity = async (userId, action, details) => {
  try {
    await executeQuery(
      'INSERT INTO activity_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
      [userId, action, details, '127.0.0.1']
    );
  } catch (error) {
    console.error('Activity log error:', error.message);
  }
};

// Get activity logs (admin only)
const getActivityLogs = async (req, res) => {
  try {
    const { page = 1, limit = 20, userId, action, startDate, endDate } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT al.*, u.username, u.email 
      FROM activity_logs al 
      LEFT JOIN users u ON al.user_id = u.id 
      WHERE 1=1
    `;
    let countQuery = 'SELECT COUNT(*) as total FROM activity_logs WHERE 1=1';
    const params = [];
    const countParams = [];

    if (userId) {
      query += ' AND al.user_id = ?';
      countQuery += ' AND user_id = ?';
      params.push(userId);
      countParams.push(userId);
    }

    if (action) {
      query += ' AND al.action = ?';
      countQuery += ' AND action = ?';
      params.push(action);
      countParams.push(action);
    }

    if (startDate) {
      query += ' AND DATE(al.created_at) >= ?';
      countQuery += ' AND DATE(created_at) >= ?';
      params.push(startDate);
      countParams.push(startDate);
    }

    if (endDate) {
      query += ' AND DATE(al.created_at) <= ?';
      countQuery += ' AND DATE(created_at) <= ?';
      params.push(endDate);
      countParams.push(endDate);
    }

    query += ' ORDER BY al.created_at DESC LIMIT ? OFFSET ?';
    
    const logs = await executeQuery(query, [...params, parseInt(limit), parseInt(offset)]);
    const total = await getSingleRow(countQuery, countParams);

    res.json({
      success: true,
      data: {
        logs: logs.data,
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
};

const { getSingleRow } = require('../config/database');

module.exports = {
  logActivity,
  getActivityLogs
};
