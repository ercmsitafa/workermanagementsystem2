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

// Get leave requests
router.get('/', verifyToken, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      worker_id,
      status,
      leave_type,
      startDate,
      endDate
    } = req.query;
    
    const offset = (page - 1) * limit;

    let whereClause = '1=1';
    const params = [];

    // Workers can only see their own requests, admins/HR can see all
    if (req.user.role === 'worker') {
      // Map user to worker
      const userWorker = await getSingleRow(
        'SELECT id FROM workers WHERE email = ?',
        [req.user.email]
      );
      if (userWorker.data) {
        whereClause += ' AND lr.worker_id = ?';
        params.push(userWorker.data.id);
      }
    } else if (worker_id) {
      whereClause += ' AND lr.worker_id = ?';
      params.push(worker_id);
    }

    if (status) {
      whereClause += ' AND lr.status = ?';
      params.push(status);
    }

    if (leave_type) {
      whereClause += ' AND lr.leave_type = ?';
      params.push(leave_type);
    }

    if (startDate) {
      whereClause += ' AND DATE(lr.start_date) >= ?';
      params.push(startDate);
    }

    if (endDate) {
      whereClause += ' AND DATE(lr.end_date) <= ?';
      params.push(endDate);
    }

    const query = `
      SELECT lr.*, w.first_name, w.last_name, w.email, d.name as department_name,
        u.username as approved_by_name
      FROM leave_requests lr
      JOIN workers w ON lr.worker_id = w.id
      LEFT JOIN departments d ON w.department_id = d.id
      LEFT JOIN users u ON lr.approved_by = u.id
      WHERE ${whereClause}
      ORDER BY lr.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const countQuery = `
      SELECT COUNT(*) as total 
      FROM leave_requests lr
      WHERE ${whereClause}
    `;

    const requests = await executeQuery(query, [...params, parseInt(limit), parseInt(offset)]);
    const total = await getSingleRow(countQuery, params);

    // Get pending count
    const pendingCount = await getSingleRow(`
      SELECT COUNT(*) as count FROM leave_requests WHERE status = 'pending'
    `);

    res.json({
      success: true,
      data: {
        requests: requests.data,
        pending_count: pendingCount.data?.count || 0,
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

// Get leave balance for a worker
router.get('/balance/:workerId', verifyToken, async (req, res) => {
  try {
    const { workerId } = req.params;
    const year = new Date().getFullYear();

    let balance = await getSingleRow(`
      SELECT * FROM leave_balances WHERE worker_id = ? AND year = ?
    `, [workerId, year]);

    // If no balance record, create one with defaults
    if (!balance.data) {
      await executeQuery(`
        INSERT INTO leave_balances (worker_id, year, annual_leave, sick_leave, personal_leave)
        VALUES (?, ?, 15, 10, 5)
      `, [workerId, year]);

      balance = await getSingleRow(`
        SELECT * FROM leave_balances WHERE worker_id = ? AND year = ?
      `, [workerId, year]);
    }

    // Get used leaves
    const used = await getSingleRow(`
      SELECT 
        SUM(CASE WHEN leave_type = 'annual' THEN days ELSE 0 END) as annual_used,
        SUM(CASE WHEN leave_type = 'sick' THEN days ELSE 0 END) as sick_used,
        SUM(CASE WHEN leave_type = 'personal' THEN days ELSE 0 END) as personal_used
      FROM leave_requests
      WHERE worker_id = ? AND YEAR(start_date) = ? AND status = 'approved'
    `, [workerId, year]);

    res.json({
      success: true,
      data: {
        year,
        allocated: balance.data,
        used: used.data || { annual_used: 0, sick_used: 0, personal_used: 0 },
        remaining: {
          annual: (balance.data?.annual_leave || 0) - (used.data?.annual_used || 0),
          sick: (balance.data?.sick_leave || 0) - (used.data?.sick_used || 0),
          personal: (balance.data?.personal_leave || 0) - (used.data?.personal_used || 0)
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

// Create leave request
router.post('/', [
  verifyToken,
  body('worker_id').isInt().withMessage('Valid worker ID required'),
  body('leave_type').isIn(['annual', 'sick', 'personal', 'maternity', 'paternity', 'unpaid']).withMessage('Invalid leave type'),
  body('start_date').isISO8601().withMessage('Valid start date required'),
  body('end_date').isISO8601().withMessage('Valid end date required'),
  body('reason').optional().trim()
], validate, async (req, res) => {
  try {
    const { worker_id, leave_type, start_date, end_date, reason } = req.body;

    // Validate dates
    if (new Date(start_date) > new Date(end_date)) {
      return res.status(400).json({ 
        success: false, 
        message: 'End date must be after start date' 
      });
    }

    // Calculate days (excluding weekends)
    const start = new Date(start_date);
    const end = new Date(end_date);
    let days = 0;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (d.getDay() !== 0 && d.getDay() !== 6) days++;
    }

    // Check for overlapping requests
    const overlap = await getSingleRow(`
      SELECT id FROM leave_requests 
      WHERE worker_id = ? AND status != 'rejected' AND status != 'cancelled'
      AND ((start_date <= ? AND end_date >= ?) OR (start_date <= ? AND end_date >= ?) OR (start_date >= ? AND end_date <= ?))
    `, [worker_id, end_date, start_date, start_date, start_date, start_date, end_date]);

    if (overlap.data) {
      return res.status(400).json({ 
        success: false, 
        message: 'Leave request overlaps with existing request' 
      });
    }

    const result = await executeQuery(`
      INSERT INTO leave_requests (worker_id, leave_type, start_date, end_date, days, reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [worker_id, leave_type, start_date, end_date, days, reason]);

    if (result.success) {
      const worker = await getSingleRow(
        'SELECT first_name, last_name FROM workers WHERE id = ?',
        [worker_id]
      );

      await logActivity(req.user.id, 'leave_request', `Leave requested: ${worker.data.first_name} ${worker.data.last_name} - ${leave_type} (${days} days)`);
      
      res.status(201).json({
        success: true,
        message: 'Leave request submitted successfully',
        data: { id: result.data?.insertId, days }
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

// Approve/reject leave request
router.put('/:id/status', [
  verifyToken,
  authorize('admin', 'hr'),
  body('status').isIn(['approved', 'rejected']).withMessage('Invalid status'),
  body('comments').optional().trim()
], validate, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, comments } = req.body;

    // Check if request exists
    const request = await getSingleRow(
      'SELECT * FROM leave_requests WHERE id = ?',
      [id]
    );

    if (!request.data) {
      return res.status(404).json({ 
        success: false, 
        message: 'Leave request not found' 
      });
    }

    if (request.data.status !== 'pending') {
      return res.status(400).json({ 
        success: false, 
        message: 'This request has already been processed' 
      });
    }

    const result = await executeQuery(`
      UPDATE leave_requests 
      SET status = ?, approved_by = ?, approved_at = NOW(), comments = ?
      WHERE id = ?
    `, [status, req.user.id, comments, id]);

    if (result.success) {
      const worker = await getSingleRow(
        'SELECT first_name, last_name FROM workers WHERE id = ?',
        [request.data.worker_id]
      );

      await logActivity(req.user.id, 'leave_status', `${status} leave request for ${worker.data.first_name} ${worker.data.last_name}`);
      
      res.json({
        success: true,
        message: `Leave request ${status} successfully`
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

// Cancel leave request
router.put('/:id/cancel', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const request = await getSingleRow(
      'SELECT * FROM leave_requests WHERE id = ?',
      [id]
    );

    if (!request.data) {
      return res.status(404).json({ 
        success: false, 
        message: 'Leave request not found' 
      });
    }

    // Only the requester or admin can cancel
    const userWorker = await getSingleRow(
      'SELECT id FROM workers WHERE email = ?',
      [req.user.email]
    );

    if (req.user.role !== 'admin' && request.data.worker_id !== userWorker.data?.id) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to cancel this request' 
      });
    }

    if (request.data.status === 'approved' && new Date(request.data.start_date) <= new Date()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot cancel an already started leave' 
      });
    }

    const result = await executeQuery(
      'UPDATE leave_requests SET status = ? WHERE id = ?',
      ['cancelled', id]
    );

    if (result.success) {
      res.json({
        success: true,
        message: 'Leave request cancelled successfully'
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

// Update leave balance
router.put('/balance/:workerId', [
  verifyToken,
  authorize('admin', 'hr'),
  body('annual_leave').optional().isFloat({ min: 0 }),
  body('sick_leave').optional().isFloat({ min: 0 }),
  body('personal_leave').optional().isFloat({ min: 0 })
], validate, async (req, res) => {
  try {
    const { workerId } = req.params;
    const { annual_leave, sick_leave, personal_leave } = req.body;
    const year = new Date().getFullYear();

    // Check if balance exists
    const existing = await getSingleRow(
      'SELECT id FROM leave_balances WHERE worker_id = ? AND year = ?',
      [workerId, year]
    );

    if (existing.data) {
      let updates = [];
      let params = [];
      
      if (annual_leave !== undefined) {
        updates.push('annual_leave = ?');
        params.push(annual_leave);
      }
      if (sick_leave !== undefined) {
        updates.push('sick_leave = ?');
        params.push(sick_leave);
      }
      if (personal_leave !== undefined) {
        updates.push('personal_leave = ?');
        params.push(personal_leave);
      }

      params.push(workerId, year);

      await executeQuery(
        `UPDATE leave_balances SET ${updates.join(', ')} WHERE worker_id = ? AND year = ?`,
        params
      );
    } else {
      await executeQuery(`
        INSERT INTO leave_balances (worker_id, year, annual_leave, sick_leave, personal_leave)
        VALUES (?, ?, ?, ?, ?)
      `, [workerId, year, annual_leave || 15, sick_leave || 10, personal_leave || 5]);
    }

    await logActivity(req.user.id, 'leave_balance', `Updated leave balance for worker ${workerId}`);

    res.json({
      success: true,
      message: 'Leave balance updated successfully'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

module.exports = router;
