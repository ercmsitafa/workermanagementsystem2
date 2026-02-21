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

// Get all shift types
router.get('/types', verifyToken, async (req, res) => {
  try {
    const shifts = await executeQuery('SELECT * FROM shifts ORDER BY start_time');
    res.json({ success: true, data: shifts.data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create shift type
router.post('/types', [
  verifyToken,
  authorize('admin'),
  body('name').trim().notEmpty().withMessage('Shift name required'),
  body('start_time').matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Valid start time required'),
  body('end_time').matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Valid end time required')
], validate, async (req, res) => {
  try {
    const { name, start_time, end_time, color, is_night_shift } = req.body;
    
    const result = await executeQuery(
      'INSERT INTO shifts (name, start_time, end_time, color, is_night_shift) VALUES (?, ?, ?, ?, ?)',
      [name, start_time, end_time, color || '#3b82f6', is_night_shift || false]
    );

    if (result.success) {
      await logActivity(req.user.id, 'shift_create', `Created shift: ${name}`);
      res.status(201).json({ success: true, message: 'Shift created', data: { id: result.data?.insertId } });
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update shift type
router.put('/types/:id', [
  verifyToken,
  authorize('admin')
], async (req, res) => {
  try {
    const { id } = req.params;
    const { name, start_time, end_time, color, is_night_shift } = req.body;

    const result = await executeQuery(
      'UPDATE shifts SET name = COALESCE(?, name), start_time = COALESCE(?, start_time), end_time = COALESCE(?, end_time), color = COALESCE(?, color), is_night_shift = COALESCE(?, is_night_shift) WHERE id = ?',
      [name, start_time, end_time, color, is_night_shift, id]
    );

    if (result.success) {
      res.json({ success: true, message: 'Shift updated' });
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete shift type
router.delete('/types/:id', verifyToken, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await executeQuery('DELETE FROM shifts WHERE id = ?', [id]);
    if (result.success) {
      await logActivity(req.user.id, 'shift_delete', `Deleted shift ID: ${id}`);
      res.json({ success: true, message: 'Shift deleted' });
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get shift schedules
router.get('/schedules', verifyToken, async (req, res) => {
  try {
    const { worker_id, shift_id, startDate, endDate, status } = req.query;
    
    let whereClause = '1=1';
    const params = [];

    if (worker_id) { whereClause += ' AND ss.worker_id = ?'; params.push(worker_id); }
    if (shift_id) { whereClause += ' AND ss.shift_id = ?'; params.push(shift_id); }
    if (startDate) { whereClause += ' AND ss.date >= ?'; params.push(startDate); }
    if (endDate) { whereClause += ' AND ss.date <= ?'; params.push(endDate); }
    if (status) { whereClause += ' AND ss.status = ?'; params.push(status); }

    const schedules = await executeQuery(`
      SELECT ss.*, s.name as shift_name, s.start_time, s.end_time, s.color,
             w.first_name, w.last_name, d.name as department_name
      FROM shift_schedules ss
      JOIN shifts s ON ss.shift_id = s.id
      JOIN workers w ON ss.worker_id = w.id
      LEFT JOIN departments d ON w.department_id = d.id
      WHERE ${whereClause}
      ORDER BY ss.date DESC, w.first_name
    `, params);

    res.json({ success: true, data: schedules.data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get today's shift schedule
router.get('/schedules/today', verifyToken, async (req, res) => {
  try {
    const schedules = await executeQuery(`
      SELECT ss.*, s.name as shift_name, s.start_time, s.end_time, s.color,
             w.first_name, w.last_name, w.position, d.name as department_name
      FROM shift_schedules ss
      JOIN shifts s ON ss.shift_id = s.id
      JOIN workers w ON ss.worker_id = w.id
      LEFT JOIN departments d ON w.department_id = d.id
      WHERE ss.date = CURDATE() AND w.status = 'active'
      ORDER BY s.start_time
    `);

    res.json({ success: true, data: schedules.data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create shift schedule
router.post('/schedules', [
  verifyToken,
  authorize('admin', 'hr'),
  body('worker_id').isInt().withMessage('Valid worker ID required'),
  body('shift_id').isInt().withMessage('Valid shift ID required'),
  body('date').isISO8601().withMessage('Valid date required')
], validate, async (req, res) => {
  try {
    const { worker_id, shift_id, date, notes } = req.body;

    // Check for conflicts
    const existing = await getSingleRow(
      'SELECT id FROM shift_schedules WHERE worker_id = ? AND date = ?',
      [worker_id, date]
    );

    if (existing.data) {
      return res.status(400).json({ success: false, message: 'Schedule already exists for this date' });
    }

    const result = await executeQuery(
      'INSERT INTO shift_schedules (worker_id, shift_id, date, notes) VALUES (?, ?, ?, ?)',
      [worker_id, shift_id, date, notes]
    );

    if (result.success) {
      const worker = await getSingleRow('SELECT first_name, last_name FROM workers WHERE id = ?', [worker_id]);
      const shift = await getSingleRow('SELECT name FROM shifts WHERE id = ?', [shift_id]);
      await logActivity(req.user.id, 'schedule_create', `Scheduled ${worker.data.first_name} for ${shift.data.name} on ${date}`);
      res.status(201).json({ success: true, message: 'Schedule created' });
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Bulk create schedules
router.post('/schedules/bulk', [
  verifyToken,
  authorize('admin', 'hr'),
  body('schedules').isArray({ min: 1 }).withMessage('Schedules array required')
], validate, async (req, res) => {
  try {
    const { schedules } = req.body;
    let successCount = 0;

    for (const sched of schedules) {
      const { worker_id, shift_id, date, notes } = sched;
      try {
        const existing = await getSingleRow(
          'SELECT id FROM shift_schedules WHERE worker_id = ? AND date = ?',
          [worker_id, date]
        );
        if (!existing.data) {
          await executeQuery(
            'INSERT INTO shift_schedules (worker_id, shift_id, date, notes) VALUES (?, ?, ?, ?)',
            [worker_id, shift_id, date, notes]
          );
          successCount++;
        }
      } catch (e) { /* skip errors */ }
    }

    await logActivity(req.user.id, 'bulk_schedule', `Created ${successCount} shift schedules`);
    res.json({ success: true, message: `${successCount} schedules created` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update schedule status
router.put('/schedules/:id/status', [
  verifyToken,
  authorize('admin', 'hr'),
  body('status').isIn(['scheduled', 'completed', 'absent', 'cancelled']).withMessage('Invalid status')
], validate, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const result = await executeQuery(
      'UPDATE shift_schedules SET status = ?, notes = COALESCE(?, notes) WHERE id = ?',
      [status, notes, id]
    );

    if (result.success) {
      res.json({ success: true, message: 'Schedule updated' });
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete schedule
router.delete('/schedules/:id', verifyToken, authorize('admin', 'hr'), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await executeQuery('DELETE FROM shift_schedules WHERE id = ?', [id]);
    if (result.success) {
      res.json({ success: true, message: 'Schedule deleted' });
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get weekly schedule overview
router.get('/schedules/weekly', verifyToken, async (req, res) => {
  try {
    const { startDate } = req.query;
    const start = startDate || new Date().toISOString().split('T')[0];

    const schedules = await executeQuery(`
      SELECT ss.*, s.name, s.start_time, s.end_time, s.color,
             w.id as worker_id, w.first_name, w.last_name
      FROM shift_schedules ss
      JOIN shifts s ON ss.shift_id = s.id
      JOIN workers w ON ss.worker_id = w.id
      WHERE ss.date BETWEEN ? AND DATE_ADD(?, INTERVAL 6 DAY) AND w.status = 'active'
      ORDER BY w.id, ss.date
    `, [start, start]);

    // Group by worker
    const grouped = {};
    schedules.data.forEach(sched => {
      if (!grouped[sched.worker_id]) {
        grouped[sched.worker_id] = {
          worker: { id: sched.worker_id, first_name: sched.first_name, last_name: sched.last_name },
          shifts: []
        };
      }
      grouped[sched.worker_id].shifts.push(sched);
    });

    res.json({ success: true, data: Object.values(grouped) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
