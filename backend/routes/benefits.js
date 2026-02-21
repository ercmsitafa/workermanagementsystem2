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

// Get all benefit plans
router.get('/', verifyToken, async (req, res) => {
  try {
    const { type, active } = req.query;
    
    let whereClause = '1=1';
    const params = [];

    if (type) { whereClause += ' AND b.benefit_type = ?'; params.push(type); }
    if (active !== undefined) { whereClause += ' AND b.is_active = ?'; params.push(active === 'true'); }

    const benefits = await executeQuery(`
      SELECT b.*,
        (SELECT COUNT(*) FROM worker_benefits WHERE benefit_id = b.id AND status = 'active') as enrolled_count
      FROM benefits b
      WHERE ${whereClause}
      ORDER BY b.name
    `, params);

    res.json({ success: true, data: benefits.data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get single benefit
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const benefit = await getSingleRow(`
      SELECT b.*,
        (SELECT COUNT(*) FROM worker_benefits WHERE benefit_id = b.id AND status = 'active') as enrolled_count
      FROM benefits b
      WHERE b.id = ?
    `, [id]);

    if (!benefit.data) {
      return res.status(404).json({ success: false, message: 'Benefit not found' });
    }

    // Get enrolled workers
    const enrollments = await executeQuery(`
      SELECT wb.*, w.first_name, w.last_name, w.email
      FROM worker_benefits wb
      JOIN workers w ON wb.worker_id = w.id
      WHERE wb.benefit_id = ? AND wb.status = 'active'
      ORDER BY wb.start_date DESC
    `, [id]);

    res.json({ success: true, data: { ...benefit.data, enrollments: enrollments.data } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create benefit plan
router.post('/', [
  verifyToken,
  authorize('admin'),
  body('name').trim().notEmpty().withMessage('Name required'),
  body('benefit_type').isIn(['health', 'dental', 'vision', 'life', 'retirement', 'other']).withMessage('Invalid type')
], validate, async (req, res) => {
  try {
    const { name, description, benefit_type, coverage_amount, employee_contribution, employer_contribution } = req.body;

    const result = await executeQuery(`
      INSERT INTO benefits (name, description, benefit_type, coverage_amount, employee_contribution, employer_contribution)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [name, description, benefit_type, coverage_amount, employee_contribution || 0, employer_contribution || 0]);

    if (result.success) {
      await logActivity(req.user.id, 'benefit_create', `Created benefit: ${name}`);
      res.status(201).json({ success: true, message: 'Benefit created', data: { id: result.data?.insertId } });
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update benefit
router.put('/:id', [
  verifyToken,
  authorize('admin')
], async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, benefit_type, coverage_amount, employee_contribution, employer_contribution, is_active } = req.body;

    const result = await executeQuery(`
      UPDATE benefits SET 
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        benefit_type = COALESCE(?, benefit_type),
        coverage_amount = COALESCE(?, coverage_amount),
        employee_contribution = COALESCE(?, employee_contribution),
        employer_contribution = COALESCE(?, employer_contribution),
        is_active = COALESCE(?, is_active)
      WHERE id = ?
    `, [name, description, benefit_type, coverage_amount, employee_contribution, employer_contribution, is_active, id]);

    if (result.success) {
      res.json({ success: true, message: 'Benefit updated' });
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete benefit
router.delete('/:id', verifyToken, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if anyone is enrolled
    const enrolled = await getSingleRow(
      'SELECT COUNT(*) as count FROM worker_benefits WHERE benefit_id = ? AND status = ?',
      [id, 'active']
    );

    if (enrolled.data?.count > 0) {
      return res.status(400).json({ success: false, message: 'Cannot delete benefit with active enrollments' });
    }

    const result = await executeQuery('DELETE FROM benefits WHERE id = ?', [id]);
    if (result.success) {
      await logActivity(req.user.id, 'benefit_delete', `Deleted benefit ID: ${id}`);
      res.json({ success: true, message: 'Benefit deleted' });
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Enroll worker in benefit
router.post('/enroll', [
  verifyToken,
  authorize('admin', 'hr'),
  body('worker_id').isInt().withMessage('Valid worker ID required'),
  body('benefit_id').isInt().withMessage('Valid benefit ID required'),
  body('start_date').isISO8601().withMessage('Valid start date required')
], validate, async (req, res) => {
  try {
    const { worker_id, benefit_id, start_date, end_date, monthly_cost } = req.body;

    // Check if already enrolled
    const existing = await getSingleRow(
      'SELECT id FROM worker_benefits WHERE worker_id = ? AND benefit_id = ? AND status = ?',
      [worker_id, benefit_id, 'active']
    );

    if (existing.data) {
      return res.status(400).json({ success: false, message: 'Worker already enrolled in this benefit' });
    }

    // Get benefit cost
    const benefit = await getSingleRow('SELECT * FROM benefits WHERE id = ?', [benefit_id]);
    if (!benefit.data) {
      return res.status(404).json({ success: false, message: 'Benefit not found' });
    }

    const result = await executeQuery(`
      INSERT INTO worker_benefits (worker_id, benefit_id, start_date, end_date, monthly_cost)
      VALUES (?, ?, ?, ?, ?)
    `, [worker_id, benefit_id, start_date, end_date, monthly_cost || benefit.data.employee_contribution]);

    if (result.success) {
      const worker = await getSingleRow('SELECT first_name, last_name FROM workers WHERE id = ?', [worker_id]);
      await logActivity(req.user.id, 'benefit_enroll', `Enrolled ${worker.data.first_name} in ${benefit.data.name}`);
      res.status(201).json({ success: true, message: 'Worker enrolled in benefit' });
    } else {
      throw new Error(result.error);
    }
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
    const { end_date, status, monthly_cost } = req.body;

    const result = await executeQuery(`
      UPDATE worker_benefits SET 
        end_date = COALESCE(?, end_date),
        status = COALESCE(?, status),
        monthly_cost = COALESCE(?, monthly_cost)
      WHERE id = ?
    `, [end_date, status, monthly_cost, id]);

    if (result.success) {
      res.json({ success: true, message: 'Enrollment updated' });
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Cancel enrollment
router.delete('/enrollments/:id', verifyToken, authorize('admin', 'hr'), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await executeQuery(
      'UPDATE worker_benefits SET status = ? WHERE id = ?',
      ['cancelled', id]
    );
    if (result.success) {
      res.json({ success: true, message: 'Enrollment cancelled' });
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get worker's benefits
router.get('/worker/:workerId', verifyToken, async (req, res) => {
  try {
    const { workerId } = req.params;

    const benefits = await executeQuery(`
      SELECT wb.*, b.name, b.description, b.benefit_type, b.coverage_amount, b.employer_contribution
      FROM worker_benefits wb
      JOIN benefits b ON wb.benefit_id = b.id
      WHERE wb.worker_id = ?
      ORDER BY wb.start_date DESC
    `, [workerId]);

    const total = await getSingleRow(`
      SELECT 
        SUM(monthly_cost) as total_cost,
        SUM(b.employer_contribution) as total_employer
      FROM worker_benefits wb
      JOIN benefits b ON wb.benefit_id = b.id
      WHERE wb.worker_id = ? AND wb.status = 'active'
    `, [workerId]);

    res.json({ success: true, data: { benefits: benefits.data, totals: total.data } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get benefits summary
router.get('/summary/stats', verifyToken, async (req, res) => {
  try {
    const stats = await getSingleRow(`
      SELECT 
        (SELECT COUNT(*) FROM benefits WHERE is_active = TRUE) as total_plans,
        (SELECT COUNT(*) FROM worker_benefits WHERE status = 'active') as total_enrolled,
        (SELECT SUM(monthly_cost) FROM worker_benefits WHERE status = 'active') as total_employee_cost,
        (SELECT SUM(b.employer_contribution) FROM worker_benefits wb JOIN benefits b ON wb.benefit_id = b.id WHERE wb.status = 'active') as total_employer_cost
    `);

    const byType = await executeQuery(`
      SELECT 
        b.benefit_type,
        COUNT(wb.id) as enrolled_count,
        SUM(wb.monthly_cost) as total_cost
      FROM benefits b
      LEFT JOIN worker_benefits wb ON b.id = wb.benefit_id AND wb.status = 'active'
      WHERE b.is_active = TRUE
      GROUP BY b.benefit_type
    `);

    res.json({ success: true, data: { stats: stats.data, by_type: byType.data } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
