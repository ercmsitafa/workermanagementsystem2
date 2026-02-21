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

// Get all salary records
router.get('/', verifyToken, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      worker_id,
      department_id,
      month,
      year
    } = req.query;
    
    const offset = (page - 1) * limit;

    let whereClause = '1=1';
    const params = [];

    if (worker_id) {
      whereClause += ' AND s.worker_id = ?';
      params.push(worker_id);
    }

    if (department_id) {
      whereClause += ' AND w.department_id = ?';
      params.push(department_id);
    }

    if (month && year) {
      whereClause += ' AND MONTH(s.month) = ? AND YEAR(s.month) = ?';
      params.push(parseInt(month), parseInt(year));
    }

    const query = `
      SELECT s.*, w.first_name, w.last_name, w.email, w.position, d.name as department_name
      FROM salaries s
      JOIN workers w ON s.worker_id = w.id
      LEFT JOIN departments d ON w.department_id = d.id
      WHERE ${whereClause}
      ORDER BY s.month DESC, w.first_name ASC
      LIMIT ? OFFSET ?
    `;

    const countQuery = `
      SELECT COUNT(*) as total 
      FROM salaries s
      JOIN workers w ON s.worker_id = w.id
      WHERE ${whereClause}
    `;

    const salaries = await executeQuery(query, [...params, parseInt(limit), parseInt(offset)]);
    const total = await getSingleRow(countQuery, params);

    // Get totals
    const totals = await getSingleRow(`
      SELECT 
        SUM(base_salary) as total_base,
        SUM(deductions) as total_deductions,
        SUM(net_salary) as total_net,
        AVG(net_salary) as avg_salary
      FROM salaries s
      JOIN workers w ON s.worker_id = w.id
      WHERE ${whereClause}
    `, params);

    res.json({
      success: true,
      data: {
        salaries: salaries.data,
        totals: totals.data,
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

// Get salary by ID
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const salary = await getSingleRow(`
      SELECT s.*, w.first_name, w.last_name, w.email, w.position, d.name as department_name
      FROM salaries s
      JOIN workers w ON s.worker_id = w.id
      LEFT JOIN departments d ON w.department_id = d.id
      WHERE s.id = ?
    `, [id]);

    if (!salary.success || !salary.data) {
      return res.status(404).json({ 
        success: false, 
        message: 'Salary record not found' 
      });
    }

    res.json({
      success: true,
      data: salary.data
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Create salary record
router.post('/', [
  verifyToken,
  authorize('admin', 'hr'),
  body('worker_id').isInt().withMessage('Valid worker ID required'),
  body('month').matches(/^\d{4}-\d{2}$/).withMessage('Month must be in YYYY-MM format'),
  body('base_salary').isFloat({ min: 0 }).withMessage('Base salary must be positive'),
  body('deductions').optional().isFloat({ min: 0 })
], validate, async (req, res) => {
  try {
    const { worker_id, month, base_salary, deductions = 0, bonus = 0, allowances = 0 } = req.body;
    const net_salary = parseFloat(base_salary) + parseFloat(bonus) + parseFloat(allowances) - parseFloat(deductions);

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

    // Check if salary record already exists for this month
    const existing = await getSingleRow(
      'SELECT id FROM salaries WHERE worker_id = ? AND month = ?',
      [worker_id, month]
    );

    if (existing.success && existing.data) {
      return res.status(400).json({ 
        success: false, 
        message: 'Salary record already exists for this month' 
      });
    }

    const result = await executeQuery(`
      INSERT INTO salaries (worker_id, month, base_salary, deductions, net_salary, bonus, allowances)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [worker_id, month, base_salary, deductions, net_salary, bonus, allowances]);

    if (result.success) {
      await logActivity(req.user.id, 'salary_create', `Created salary record for ${worker.data.first_name} ${worker.data.last_name} - ${month}`);
      
      res.status(201).json({
        success: true,
        message: 'Salary record created successfully',
        data: { id: result.data?.insertId, net_salary }
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

// Update salary record
router.put('/:id', [
  verifyToken,
  authorize('admin', 'hr'),
  body('base_salary').optional().isFloat({ min: 0 }),
  body('deductions').optional().isFloat({ min: 0 })
], validate, async (req, res) => {
  try {
    const { id } = req.params;
    const { base_salary, deductions = 0, bonus = 0, allowances = 0 } = req.body;

    // Get existing record
    const existing = await getSingleRow(
      'SELECT * FROM salaries WHERE id = ?',
      [id]
    );

    if (!existing.success || !existing.data) {
      return res.status(404).json({ 
        success: false, 
        message: 'Salary record not found' 
      });
    }

    const newBaseSalary = base_salary !== undefined ? base_salary : existing.data.base_salary;
    const newDeductions = deductions !== undefined ? deductions : existing.data.deductions;
    const newBonus = bonus !== undefined ? bonus : (existing.data.bonus || 0);
    const newAllowances = allowances !== undefined ? allowances : (existing.data.allowances || 0);
    const net_salary = parseFloat(newBaseSalary) + parseFloat(newBonus) + parseFloat(newAllowances) - parseFloat(newDeductions);

    const result = await executeQuery(`
      UPDATE salaries 
      SET base_salary = ?, deductions = ?, net_salary = ?, bonus = ?, allowances = ?
      WHERE id = ?
    `, [newBaseSalary, newDeductions, net_salary, newBonus, newAllowances, id]);

    if (result.success) {
      await logActivity(req.user.id, 'salary_update', `Updated salary record ID: ${id}`);
      
      res.json({
        success: true,
        message: 'Salary record updated successfully',
        data: { net_salary }
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

// Generate monthly salaries for all active workers
router.post('/generate-monthly', [
  verifyToken,
  authorize('admin', 'hr'),
  body('month').matches(/^\d{4}-\d{2}$/).withMessage('Month must be in YYYY-MM format')
], validate, async (req, res) => {
  try {
    const { month, deductions = 0 } = req.body;

    // Get all active workers
    const workers = await executeQuery(
      'SELECT id, salary FROM workers WHERE status = ?',
      ['active']
    );

    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const worker of workers.data) {
      try {
        // Check if already exists
        const existing = await getSingleRow(
          'SELECT id FROM salaries WHERE worker_id = ? AND month = ?',
          [worker.id, month]
        );

        if (existing.data) {
          skippedCount++;
          continue;
        }

        await executeQuery(`
          INSERT INTO salaries (worker_id, month, base_salary, deductions, net_salary)
          VALUES (?, ?, ?, ?, ?)
        `, [worker.id, month, worker.salary, deductions, worker.salary - deductions]);

        successCount++;
      } catch (err) {
        errorCount++;
      }
    }

    await logActivity(req.user.id, 'salary_generate', `Generated salaries for ${successCount} workers - ${month}`);

    res.json({
      success: true,
      message: `Salaries generated: ${successCount} success, ${skippedCount} skipped, ${errorCount} failed`,
      data: { success_count: successCount, skipped_count: skippedCount, error_count: errorCount }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Get salary history for a worker
router.get('/worker/:workerId', verifyToken, async (req, res) => {
  try {
    const { workerId } = req.params;
    const { limit = 12 } = req.query;

    const salaries = await executeQuery(`
      SELECT * FROM salaries 
      WHERE worker_id = ?
      ORDER BY month DESC
      LIMIT ?
    `, [workerId, parseInt(limit)]);

    const summary = await getSingleRow(`
      SELECT 
        SUM(base_salary) as total_paid,
        SUM(deductions) as total_deductions,
        SUM(net_salary) as total_net,
        AVG(net_salary) as avg_salary
      FROM salaries 
      WHERE worker_id = ?
    `, [workerId]);

    res.json({
      success: true,
      data: {
        salaries: salaries.data,
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

// Delete salary record
router.delete('/:id', verifyToken, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await executeQuery('DELETE FROM salaries WHERE id = ?', [id]);

    if (result.success) {
      await logActivity(req.user.id, 'salary_delete', `Deleted salary record ID: ${id}`);
      
      res.json({
        success: true,
        message: 'Salary record deleted successfully'
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
