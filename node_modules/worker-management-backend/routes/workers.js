const express = require('express');
const { body, query, validationResult } = require('express-validator');
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

// Get all workers with advanced filtering and search
router.get('/', verifyToken, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search = '',
      department_id,
      status,
      position,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;
    
    const offset = (page - 1) * limit;
    const allowedSortFields = ['first_name', 'last_name', 'email', 'salary', 'date_hired', 'created_at'];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    let whereClause = '1=1';
    const params = [];

    if (search) {
      whereClause += ` AND (w.first_name LIKE ? OR w.last_name LIKE ? OR w.email LIKE ? OR w.phone LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (department_id) {
      whereClause += ' AND w.department_id = ?';
      params.push(department_id);
    }

    if (status) {
      whereClause += ' AND w.status = ?';
      params.push(status);
    }

    if (position) {
      whereClause += ' AND w.position LIKE ?';
      params.push(`%${position}%`);
    }

    const query = `
      SELECT w.*, d.name as department_name 
      FROM workers w 
      LEFT JOIN departments d ON w.department_id = d.id 
      WHERE ${whereClause} 
      ORDER BY w.${sortField} ${order} 
      LIMIT ? OFFSET ?
    `;

    const countQuery = `
      SELECT COUNT(*) as total 
      FROM workers w 
      WHERE ${whereClause}
    `;

    const workers = await executeQuery(query, [...params, parseInt(limit), parseInt(offset)]);
    const total = await getSingleRow(countQuery, params);

    // Get department distribution
    const departmentStats = await executeQuery(`
      SELECT d.name, COUNT(w.id) as count 
      FROM departments d 
      LEFT JOIN workers w ON d.id = w.department_id AND w.status = 'active'
      GROUP BY d.id
    `);

    res.json({
      success: true,
      data: {
        workers: workers.data,
        stats: {
          department_distribution: departmentStats.data
        },
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

// Get single worker by ID
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const worker = await getSingleRow(`
      SELECT w.*, d.name as department_name 
      FROM workers w 
      LEFT JOIN departments d ON w.department_id = d.id 
      WHERE w.id = ?
    `, [id]);

    if (!worker.success || !worker.data) {
      return res.status(404).json({ 
        success: false, 
        message: 'Worker not found' 
      });
    }

    // Get recent attendance
    const attendance = await executeQuery(`
      SELECT * FROM attendance 
      WHERE worker_id = ? 
      ORDER BY date DESC 
      LIMIT 10
    `, [id]);

    // Get salary history
    const salaries = await executeQuery(`
      SELECT * FROM salaries 
      WHERE worker_id = ? 
      ORDER BY month DESC 
      LIMIT 12
    `, [id]);

    res.json({
      success: true,
      data: {
        ...worker.data,
        recent_attendance: attendance.data,
        salary_history: salaries.data
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Create new worker
router.post('/', [
  verifyToken,
  authorize('admin', 'hr'),
  body('first_name').trim().notEmpty().withMessage('First name is required'),
  body('last_name').trim().notEmpty().withMessage('Last name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('phone').optional().trim(),
  body('address').optional().trim(),
  body('department_id').optional().isInt(),
  body('position').optional().trim(),
  body('salary').optional().isFloat({ min: 0 }),
  body('date_hired').optional().isISO8601(),
  body('status').optional().isIn(['active', 'inactive'])
], validate, async (req, res) => {
  try {
    const { 
      first_name, 
      last_name, 
      email, 
      phone, 
      address, 
      department_id, 
      position, 
      salary = 0, 
      date_hired,
      status = 'active'
    } = req.body;

    // Check if email exists
    const existingWorker = await getSingleRow(
      'SELECT id FROM workers WHERE email = ?',
      [email]
    );

    if (existingWorker.success && existingWorker.data) {
      return res.status(400).json({ 
        success: false, 
        message: 'Worker with this email already exists' 
      });
    }

    const result = await executeQuery(`
      INSERT INTO workers (first_name, last_name, email, phone, address, department_id, position, salary, date_hired, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [first_name, last_name, email, phone, address, department_id, position, salary, date_hired || new Date(), status]);

    if (result.success) {
      await logActivity(req.user.id, 'worker_create', `Created worker: ${first_name} ${last_name}`);
      
      res.status(201).json({
        success: true,
        message: 'Worker created successfully',
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

// Update worker
router.put('/:id', [
  verifyToken,
  authorize('admin', 'hr'),
  body('first_name').optional().trim().notEmpty(),
  body('last_name').optional().trim().notEmpty(),
  body('email').optional().isEmail().normalizeEmail(),
  body('status').optional().isIn(['active', 'inactive'])
], validate, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Check if worker exists
    const existingWorker = await getSingleRow(
      'SELECT * FROM workers WHERE id = ?',
      [id]
    );

    if (!existingWorker.success || !existingWorker.data) {
      return res.status(404).json({ 
        success: false, 
        message: 'Worker not found' 
      });
    }

    // If email is being updated, check if it's already in use
    if (updates.email && updates.email !== existingWorker.data.email) {
      const emailExists = await getSingleRow(
        'SELECT id FROM workers WHERE email = ? AND id != ?',
        [updates.email, id]
      );

      if (emailExists.success && emailExists.data) {
        return res.status(400).json({ 
          success: false, 
          message: 'Email already in use' 
        });
      }
    }

    // Build update query
    const allowedFields = ['first_name', 'last_name', 'email', 'phone', 'address', 'department_id', 'position', 'salary', 'date_hired', 'status', 'profile_image'];
    const updateFields = [];
    const updateValues = [];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updateFields.push(`${field} = ?`);
        updateValues.push(updates[field]);
      }
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No valid fields to update' 
      });
    }

    updateValues.push(id);
    
    const result = await executeQuery(
      `UPDATE workers SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    if (result.success) {
      await logActivity(req.user.id, 'worker_update', `Updated worker ID: ${id}`);
      
      res.json({
        success: true,
        message: 'Worker updated successfully'
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

// Delete worker
router.delete('/:id', verifyToken, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if worker exists
    const existingWorker = await getSingleRow(
      'SELECT first_name, last_name FROM workers WHERE id = ?',
      [id]
    );

    if (!existingWorker.success || !existingWorker.data) {
      return res.status(404).json({ 
        success: false, 
        message: 'Worker not found' 
      });
    }

    const result = await executeQuery('DELETE FROM workers WHERE id = ?', [id]);

    if (result.success) {
      await logActivity(req.user.id, 'worker_delete', `Deleted worker: ${existingWorker.data.first_name} ${existingWorker.data.last_name}`);
      
      res.json({
        success: true,
        message: 'Worker deleted successfully'
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

// Bulk import workers
router.post('/bulk-import', [
  verifyToken,
  authorize('admin', 'hr')
], async (req, res) => {
  try {
    const { workers } = req.body;

    if (!Array.isArray(workers) || workers.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No workers provided' 
      });
    }

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    for (const worker of workers) {
      try {
        const { first_name, last_name, email, phone, department_id, position, salary } = worker;
        
        if (!first_name || !last_name || !email) {
          errorCount++;
          errors.push(`Missing required fields for: ${email || 'unknown'}`);
          continue;
        }

        const result = await executeQuery(`
          INSERT INTO workers (first_name, last_name, email, phone, department_id, position, salary, date_hired, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), 'active')
        `, [first_name, last_name, email, phone, department_id, position, salary || 0]);

        if (result.success) {
          successCount++;
        } else {
          errorCount++;
          errors.push(`Failed to insert: ${email}`);
        }
      } catch (err) {
        errorCount++;
        errors.push(`Error: ${err.message}`);
      }
    }

    await logActivity(req.user.id, 'bulk_import', `Imported ${successCount} workers, ${errorCount} failed`);

    res.json({
      success: true,
      message: `Import completed: ${successCount} success, ${errorCount} failed`,
      data: { success_count: successCount, error_count: errorCount, errors }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

module.exports = router;
