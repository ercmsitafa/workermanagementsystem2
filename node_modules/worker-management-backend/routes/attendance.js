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

// Get attendance records
router.get('/', verifyToken, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      worker_id,
      department_id,
      status,
      startDate,
      endDate
    } = req.query;
    
    const offset = (page - 1) * limit;

    let whereClause = '1=1';
    const params = [];

    if (worker_id) {
      whereClause += ' AND a.worker_id = ?';
      params.push(worker_id);
    }

    if (department_id) {
      whereClause += ' AND w.department_id = ?';
      params.push(department_id);
    }

    if (status) {
      whereClause += ' AND a.status = ?';
      params.push(status);
    }

    if (startDate) {
      whereClause += ' AND DATE(a.date) >= ?';
      params.push(startDate);
    }

    if (endDate) {
      whereClause += ' AND DATE(a.date) <= ?';
      params.push(endDate);
    }

    const query = `
      SELECT a.*, w.first_name, w.last_name, w.email, d.name as department_name
      FROM attendance a
      JOIN workers w ON a.worker_id = w.id
      LEFT JOIN departments d ON w.department_id = d.id
      WHERE ${whereClause}
      ORDER BY a.date DESC, w.first_name ASC
      LIMIT ? OFFSET ?
    `;

    const countQuery = `
      SELECT COUNT(*) as total 
      FROM attendance a
      JOIN workers w ON a.worker_id = w.id
      WHERE ${whereClause}
    `;

    const attendance = await executeQuery(query, [...params, parseInt(limit), parseInt(offset)]);
    const total = await getSingleRow(countQuery, params);

    // Get summary stats
    const summary = await getSingleRow(`
      SELECT 
        SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present,
        SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent,
        SUM(CASE WHEN status = 'leave' THEN 1 ELSE 0 END) as leave,
        COUNT(*) as total
      FROM attendance a
      JOIN workers w ON a.worker_id = w.id
      WHERE ${whereClause}
    `, params);

    res.json({
      success: true,
      data: {
        attendance: attendance.data,
        summary: summary.data,
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

// Get today's attendance
router.get('/today', verifyToken, async (req, res) => {
  try {
    const attendance = await executeQuery(`
      SELECT a.*, w.first_name, w.last_name, w.email, w.position, d.name as department_name
      FROM attendance a
      JOIN workers w ON a.worker_id = w.id
      LEFT JOIN departments d ON w.department_id = d.id
      WHERE DATE(a.date) = CURDATE()
      ORDER BY w.first_name
    `);

    // Get all active workers to show who's not marked
    const allWorkers = await executeQuery(`
      SELECT w.id, w.first_name, w.last_name, w.email, w.position, d.name as department_name
      FROM workers w
      LEFT JOIN departments d ON w.department_id = d.id
      WHERE w.status = 'active'
      ORDER BY w.first_name
    `);

    // Mark attendance for workers not in today's list
    const markedIds = new Set(attendance.data.map(a => a.worker_id));
    const unmarked = allWorkers.data.filter(w => !markedIds.has(w.id));

    res.json({
      success: true,
      data: {
        marked: attendance.data,
        unmarked_count: unmarked.length,
        unmarked_workers: unmarked.slice(0, 10) // Show first 10
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Record attendance
router.post('/', [
  verifyToken,
  authorize('admin', 'hr'),
  body('worker_id').isInt().withMessage('Valid worker ID required'),
  body('date').isISO8601().withMessage('Valid date required'),
  body('status').isIn(['present', 'absent', 'leave']).withMessage('Invalid status')
], validate, async (req, res) => {
  try {
    const { worker_id, date, status, notes } = req.body;

    // Check if worker exists
    const worker = await getSingleRow(
      'SELECT first_name, last_name FROM workers WHERE id = ?',
      [worker_id]
    );

    if (!worker.success || !worker.data) {
      return res.status(404).json({ 
        success: false, 
        message: 'Worker not found' 
      });
    }

    // Check if attendance already exists for this date
    const existing = await getSingleRow(
      'SELECT id FROM attendance WHERE worker_id = ? AND date = ?',
      [worker_id, date]
    );

    let result;
    if (existing.success && existing.data) {
      // Update existing
      result = await executeQuery(
        'UPDATE attendance SET status = ?, notes = ? WHERE id = ?',
        [status, notes, existing.data.id]
      );
    } else {
      // Insert new
      result = await executeQuery(
        'INSERT INTO attendance (worker_id, date, status, notes) VALUES (?, ?, ?, ?)',
        [worker_id, date, status, notes]
      );
    }

    if (result.success) {
      await logActivity(req.user.id, 'attendance_record', `Marked ${worker.data.first_name} ${worker.data.last_name} as ${status} for ${date}`);
      
      res.json({
        success: true,
        message: 'Attendance recorded successfully'
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

// Bulk record attendance
router.post('/bulk', [
  verifyToken,
  authorize('admin', 'hr'),
  body('date').isISO8601().withMessage('Valid date required'),
  body('records').isArray({ min: 1 }).withMessage('Records array required')
], validate, async (req, res) => {
  try {
    const { date, records, status = 'present' } = req.body;

    let successCount = 0;
    let errorCount = 0;

    for (const record of records) {
      const { worker_id, record_status = status } = record;
      
      try {
        const existing = await getSingleRow(
          'SELECT id FROM attendance WHERE worker_id = ? AND date = ?',
          [worker_id, date]
        );

        if (existing.success && existing.data) {
          await executeQuery(
            'UPDATE attendance SET status = ? WHERE id = ?',
            [record_status, existing.data.id]
          );
        } else {
          await executeQuery(
            'INSERT INTO attendance (worker_id, date, status) VALUES (?, ?, ?)',
            [worker_id, date, record_status]
          );
        }
        successCount++;
      } catch (err) {
        errorCount++;
      }
    }

    await logActivity(req.user.id, 'bulk_attendance', `Bulk recorded attendance for ${successCount} workers`);

    res.json({
      success: true,
      message: `Attendance recorded: ${successCount} success, ${errorCount} failed`,
      data: { success_count: successCount, error_count: errorCount }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Auto-mark today's attendance for all active workers
router.post('/auto-mark', [
  verifyToken,
  authorize('admin', 'hr'),
  body('status').optional().isIn(['present', 'absent']).withMessage('Invalid status')
], validate, async (req, res) => {
  try {
    const { status = 'present' } = req.body;

    // Get all active workers
    const workers = await executeQuery(
      'SELECT id FROM workers WHERE status = ?',
      ['active']
    );

    let successCount = 0;
    const today = new Date().toISOString().split('T')[0];

    for (const worker of workers.data) {
      try {
        const existing = await getSingleRow(
          'SELECT id FROM attendance WHERE worker_id = ? AND date = ?',
          [worker.id, today]
        );

        if (!existing.data) {
          await executeQuery(
            'INSERT INTO attendance (worker_id, date, status) VALUES (?, ?, ?)',
            [worker.id, today, status]
          );
        }
        successCount++;
      } catch (err) {
        console.error(`Error marking attendance for worker ${worker.id}:`, err.message);
      }
    }

    await logActivity(req.user.id, 'auto_attendance', `Auto-marked ${successCount} workers as ${status}`);

    res.json({
      success: true,
      message: `Auto-marked ${successCount} workers as ${status}`,
      data: { count: successCount }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Get attendance by worker
router.get('/worker/:workerId', verifyToken, async (req, res) => {
  try {
    const { workerId } = req.params;
    const { startDate, endDate, month, year } = req.query;

    let dateFilter = '';
    const params = [workerId];

    if (month && year) {
      dateFilter = 'AND MONTH(a.date) = ? AND YEAR(a.date) = ?';
      params.push(parseInt(month), parseInt(year));
    } else if (startDate && endDate) {
      dateFilter = 'AND DATE(a.date) >= ? AND DATE(a.date) <= ?';
      params.push(startDate, endDate);
    } else {
      // Default to last 30 days
      dateFilter = 'AND a.date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
    }

    const attendance = await executeQuery(`
      SELECT a.*, w.first_name, w.last_name
      FROM attendance a
      JOIN workers w ON a.worker_id = w.id
      WHERE a.worker_id = ? ${dateFilter}
      ORDER BY a.date DESC
    `, params);

    const summary = await getSingleRow(`
      SELECT 
        SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present,
        SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent,
        SUM(CASE WHEN status = 'leave' THEN 1 ELSE 0 END) as leave,
        COUNT(*) as total,
        ROUND(SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) as attendance_rate
      FROM attendance a
      WHERE a.worker_id = ? ${dateFilter}
    `, params);

    res.json({
      success: true,
      data: {
        attendance: attendance.data,
        summary: summary.data
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Delete attendance record
router.delete('/:id', verifyToken, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await executeQuery('DELETE FROM attendance WHERE id = ?', [id]);

    if (result.success) {
      await logActivity(req.user.id, 'attendance_delete', `Deleted attendance record ID: ${id}`);
      
      res.json({
        success: true,
        message: 'Attendance record deleted successfully'
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
