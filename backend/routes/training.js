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

// Get all training programs
router.get('/programs', verifyToken, async (req, res) => {
  try {
    const { status, startDate, endDate } = req.query;
    
    let whereClause = '1=1';
    const params = [];

    if (status) { whereClause += ' AND tp.status = ?'; params.push(status); }
    if (startDate) { whereClause += ' AND tp.start_date >= ?'; params.push(startDate); }
    if (endDate) { whereClause += ' AND tp.end_date <= ?'; params.push(endDate); }

    const programs = await executeQuery(`
      SELECT tp.*,
        (SELECT COUNT(*) FROM training_enrollments WHERE program_id = tp.id) as enrolled_count,
        (SELECT COUNT(*) FROM training_enrollments WHERE program_id = tp.id AND status = 'completed') as completed_count
      FROM training_programs tp
      WHERE ${whereClause}
      ORDER BY tp.start_date DESC
    `, params);

    res.json({ success: true, data: programs.data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get single program
router.get('/programs/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const program = await getSingleRow(`
      SELECT tp.*,
        (SELECT COUNT(*) FROM training_enrollments WHERE program_id = tp.id) as enrolled_count
      FROM training_programs tp
      WHERE tp.id = ?
    `, [id]);

    if (!program.data) {
      return res.status(404).json({ success: false, message: 'Program not found' });
    }

    // Get enrolled workers
    const enrollments = await executeQuery(`
      SELECT te.*, w.first_name, w.last_name, w.email, w.position
      FROM training_enrollments te
      JOIN workers w ON te.worker_id = w.id
      WHERE te.program_id = ?
      ORDER BY te.enrollment_date DESC
    `, [id]);

    res.json({ success: true, data: { ...program.data, enrollments: enrollments.data } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create training program
router.post('/programs', [
  verifyToken,
  authorize('admin', 'hr'),
  body('title').trim().notEmpty().withMessage('Title required'),
  body('start_date').isISO8601().withMessage('Valid start date required'),
  body('end_date').isISO8601().withMessage('Valid end date required')
], validate, async (req, res) => {
  try {
    const { title, description, trainer, start_date, end_date, duration_hours, location, max_participants } = req.body;

    const result = await executeQuery(`
      INSERT INTO training_programs (title, description, trainer, start_date, end_date, duration_hours, location, max_participants)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [title, description, trainer, start_date, end_date, duration_hours, location, max_participants]);

    if (result.success) {
      await logActivity(req.user.id, 'program_create', `Created training program: ${title}`);
      res.status(201).json({ success: true, message: 'Program created', data: { id: result.data?.insertId } });
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update program
router.put('/programs/:id', [
  verifyToken,
  authorize('admin', 'hr')
], async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, trainer, start_date, end_date, duration_hours, location, max_participants, status } = req.body;

    const result = await executeQuery(`
      UPDATE training_programs SET 
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        trainer = COALESCE(?, trainer),
        start_date = COALESCE(?, start_date),
        end_date = COALESCE(?, end_date),
        duration_hours = COALESCE(?, duration_hours),
        location = COALESCE(?, location),
        max_participants = COALESCE(?, max_participants),
        status = COALESCE(?, status)
      WHERE id = ?
    `, [title, description, trainer, start_date, end_date, duration_hours, location, max_participants, status, id]);

    if (result.success) {
      res.json({ success: true, message: 'Program updated' });
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete program
router.delete('/programs/:id', verifyToken, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await executeQuery('DELETE FROM training_programs WHERE id = ?', [id]);
    if (result.success) {
      await logActivity(req.user.id, 'program_delete', `Deleted training program ID: ${id}`);
      res.json({ success: true, message: 'Program deleted' });
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Enroll worker in program
router.post('/enroll', [
  verifyToken,
  authorize('admin', 'hr'),
  body('program_id').isInt().withMessage('Valid program ID required'),
  body('worker_id').isInt().withMessage('Valid worker ID required')
], validate, async (req, res) => {
  try {
    const { program_id, worker_id } = req.body;

    // Check if already enrolled
    const existing = await getSingleRow(
      'SELECT id FROM training_enrollments WHERE program_id = ? AND worker_id = ?',
      [program_id, worker_id]
    );

    if (existing.data) {
      return res.status(400).json({ success: false, message: 'Worker already enrolled' });
    }

    const result = await executeQuery(
      'INSERT INTO training_enrollments (program_id, worker_id, enrollment_date) VALUES (?, ?, CURDATE())',
      [program_id, worker_id]
    );

    if (result.success) {
      const worker = await getSingleRow('SELECT first_name, last_name FROM workers WHERE id = ?', [worker_id]);
      const program = await getSingleRow('SELECT title FROM training_programs WHERE id = ?', [program_id]);
      await logActivity(req.user.id, 'training_enroll', `Enrolled ${worker.data.first_name} in ${program.data.title}`);
      res.status(201).json({ success: true, message: 'Worker enrolled' });
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Bulk enroll
router.post('/enroll/bulk', [
  verifyToken,
  authorize('admin', 'hr'),
  body('program_id').isInt().withMessage('Program ID required'),
  body('worker_ids').isArray({ min: 1 }).withMessage('Worker IDs required')
], validate, async (req, res) => {
  try {
    const { program_id, worker_ids } = req.body;
    let successCount = 0;

    for (const worker_id of worker_ids) {
      const existing = await getSingleRow(
        'SELECT id FROM training_enrollments WHERE program_id = ? AND worker_id = ?',
        [program_id, worker_id]
      );
      if (!existing.data) {
        await executeQuery(
          'INSERT INTO training_enrollments (program_id, worker_id, enrollment_date) VALUES (?, ?, CURDATE())',
          [program_id, worker_id]
        );
        successCount++;
      }
    }

    res.json({ success: true, message: `${successCount} workers enrolled` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update enrollment
router.put('/enrollments/:id', [
  verifyToken,
  authorize('admin', 'hr')
], async (req, res) => {
  try {
    const { id } = req.params;
    const { status, score, completion_date, certificate_issued } = req.body;

    const result = await executeQuery(`
      UPDATE training_enrollments SET 
        status = COALESCE(?, status),
        score = COALESCE(?, score),
        completion_date = COALESCE(?, completion_date),
        certificate_issued = COALESCE(?, certificate_issued)
      WHERE id = ?
    `, [status, score, completion_date, certificate_issued, id]);

    if (result.success) {
      res.json({ success: true, message: 'Enrollment updated' });
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Unenroll worker
router.delete('/enrollments/:id', verifyToken, authorize('admin', 'hr'), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await executeQuery('DELETE FROM training_enrollments WHERE id = ?', [id]);
    if (result.success) {
      res.json({ success: true, message: 'Unenrolled successfully' });
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get worker's training history
router.get('/worker/:workerId', verifyToken, async (req, res) => {
  try {
    const { workerId } = req.params;

    const enrollments = await executeQuery(`
      SELECT te.*, tp.title, tp.description, tp.trainer, tp.start_date, tp.end_date, tp.duration_hours
      FROM training_enrollments te
      JOIN training_programs tp ON te.program_id = tp.id
      WHERE te.worker_id = ?
      ORDER BY te.enrollment_date DESC
    `, [workerId]);

    const stats = await getSingleRow(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        AVG(score) as avg_score
      FROM training_enrollments
      WHERE worker_id = ?
    `, [workerId]);

    res.json({ success: true, data: { enrollments: enrollments.data, stats: stats.data } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
