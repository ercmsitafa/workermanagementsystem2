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

// Get all departments
router.get('/', verifyToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = '1=1';
    const params = [];

    if (search) {
      whereClause += ' AND (name LIKE ? OR description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    const query = `
      SELECT d.*, 
        (SELECT COUNT(*) FROM workers WHERE department_id = d.id AND status = 'active') as worker_count,
        (SELECT SUM(salary) FROM workers WHERE department_id = d.id AND status = 'active') as total_salary
      FROM departments d 
      WHERE ${whereClause}
      ORDER BY d.name ASC
      LIMIT ? OFFSET ?
    `;

    const countQuery = `SELECT COUNT(*) as total FROM departments WHERE ${whereClause}`;

    const departments = await executeQuery(query, [...params, parseInt(limit), parseInt(offset)]);
    const total = await getSingleRow(countQuery, params);

    res.json({
      success: true,
      data: {
        departments: departments.data,
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

// Get single department
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const department = await getSingleRow(`
      SELECT d.*, 
        (SELECT COUNT(*) FROM workers WHERE department_id = d.id AND status = 'active') as worker_count
      FROM departments d 
      WHERE d.id = ?
    `, [id]);

    if (!department.success || !department.data) {
      return res.status(404).json({ 
        success: false, 
        message: 'Department not found' 
      });
    }

    // Get workers in this department
    const workers = await executeQuery(`
      SELECT id, first_name, last_name, email, position, status 
      FROM workers 
      WHERE department_id = ?
      ORDER BY first_name
    `, [id]);

    res.json({
      success: true,
      data: {
        ...department.data,
        workers: workers.data
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Create department
router.post('/', [
  verifyToken,
  authorize('admin', 'hr'),
  body('name').trim().notEmpty().withMessage('Department name is required'),
  body('description').optional().trim()
], validate, async (req, res) => {
  try {
    const { name, description } = req.body;

    // Check if department exists
    const existingDept = await getSingleRow(
      'SELECT id FROM departments WHERE name = ?',
      [name]
    );

    if (existingDept.success && existingDept.data) {
      return res.status(400).json({ 
        success: false, 
        message: 'Department already exists' 
      });
    }

    const result = await executeQuery(
      'INSERT INTO departments (name, description) VALUES (?, ?)',
      [name, description]
    );

    if (result.success) {
      await logActivity(req.user.id, 'department_create', `Created department: ${name}`);
      
      res.status(201).json({
        success: true,
        message: 'Department created successfully',
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

// Update department
router.put('/:id', [
  verifyToken,
  authorize('admin', 'hr'),
  body('name').optional().trim().notEmpty(),
  body('description').optional()
], validate, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    // Check if department exists
    const existingDept = await getSingleRow(
      'SELECT * FROM departments WHERE id = ?',
      [id]
    );

    if (!existingDept.success || !existingDept.data) {
      return res.status(404).json({ 
        success: false, 
        message: 'Department not found' 
      });
    }

    // Check for duplicate name
    if (name && name !== existingDept.data.name) {
      const duplicateName = await getSingleRow(
        'SELECT id FROM departments WHERE name = ? AND id != ?',
        [name, id]
      );

      if (duplicateName.success && duplicateName.data) {
        return res.status(400).json({ 
          success: false, 
          message: 'Department name already exists' 
        });
      }
    }

    const result = await executeQuery(
      'UPDATE departments SET name = COALESCE(?, name), description = COALESCE(?, description) WHERE id = ?',
      [name, description, id]
    );

    if (result.success) {
      await logActivity(req.user.id, 'department_update', `Updated department ID: ${id}`);
      
      res.json({
        success: true,
        message: 'Department updated successfully'
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

// Delete department
router.delete('/:id', verifyToken, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if department has workers
    const workerCount = await getSingleRow(
      'SELECT COUNT(*) as count FROM workers WHERE department_id = ?',
      [id]
    );

    if (workerCount.data?.count > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot delete department with active workers. Please reassign workers first.' 
      });
    }

    const result = await executeQuery('DELETE FROM departments WHERE id = ?', [id]);

    if (result.success) {
      await logActivity(req.user.id, 'department_delete', `Deleted department ID: ${id}`);
      
      res.json({
        success: true,
        message: 'Department deleted successfully'
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

// Get department statistics
router.get('/:id/stats', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    // Worker count
    const workerStats = await getSingleRow(`
      SELECT 
        COUNT(*) as total_workers,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_workers,
        SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) as inactive_workers,
        AVG(salary) as avg_salary,
        SUM(salary) as total_salary
      FROM workers 
      WHERE department_id = ?
    `, [id]);

    // Recent hires
    const recentHires = await executeQuery(`
      SELECT id, first_name, last_name, position, date_hired 
      FROM workers 
      WHERE department_id = ? 
      ORDER BY date_hired DESC 
      LIMIT 5
    `, [id]);

    // Attendance stats (last 30 days)
    const attendanceStats = await getSingleRow(`
      SELECT 
        SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present,
        SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent,
        SUM(CASE WHEN status = 'leave' THEN 1 ELSE 0 END) as leave
      FROM attendance a
      JOIN workers w ON a.worker_id = w.id
      WHERE w.department_id = ? 
      AND a.date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
    `, [id]);

    res.json({
      success: true,
      data: {
        workers: workerStats.data,
        recent_hires: recentHires.data,
        attendance: attendanceStats.data
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

module.exports = router;
