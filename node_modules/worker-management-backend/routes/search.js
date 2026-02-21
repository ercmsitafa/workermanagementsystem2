const express = require('express');
const { executeQuery, getSingleRow } = require('../config/database');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// Advanced global search
router.get('/', verifyToken, async (req, res) => {
  try {
    const { q, type, page = 1, limit = 10 } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({ success: false, message: 'Search query must be at least 2 characters' });
    }

    const searchTerm = `%${q}%`;
    const results = {};
    const offset = (page - 1) * limit;

    // Search workers
    if (!type || type === 'workers') {
      const workers = await executeQuery(`
        SELECT id, first_name, last_name, email, phone, position, status,
               'worker' as type
        FROM workers 
        WHERE first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR phone LIKE ? OR position LIKE ?
        ORDER BY first_name, last_name
        LIMIT ?
      `, [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, parseInt(limit)]);
      results.workers = workers.data;
    }

    // Search departments
    if (!type || type === 'departments') {
      const departments = await executeQuery(`
        SELECT id, name, description, 'department' as type
        FROM departments 
        WHERE name LIKE ? OR description LIKE ?
        ORDER BY name
        LIMIT ?
      `, [searchTerm, searchTerm, parseInt(limit)]);
      results.departments = departments.data;
    }

    // Search users
    if (!type || type === 'users') {
      const users = await executeQuery(`
        SELECT id, username, email, role, 'user' as type
        FROM users 
        WHERE username LIKE ? OR email LIKE ?
        ORDER BY username
        LIMIT ?
      `, [searchTerm, searchTerm, parseInt(limit)]);
      results.users = users.data;
    }

    // Search leave requests (admin/hr only)
    if (req.user.role !== 'worker') {
      if (!type || type === 'leave') {
        const leave = await executeQuery(`
          SELECT lr.id, lr.leave_type, lr.status, lr.start_date, lr.end_date,
                 w.first_name, w.last_name, 'leave' as type
          FROM leave_requests lr
          JOIN workers w ON lr.worker_id = w.id
          WHERE w.first_name LIKE ? OR w.last_name LIKE ? OR lr.leave_type LIKE ?
          ORDER BY lr.created_at DESC
          LIMIT ?
        `, [searchTerm, searchTerm, searchTerm, parseInt(limit)]);
        results.leave_requests = leave.data;
      }
    }

    // Get total count
    let total = 0;
    if (results.workers) total += results.workers.length;
    if (results.departments) total += results.departments.length;
    if (results.users) total += results.users.length;
    if (results.leave_requests) total += results.leave_requests.length;

    res.json({
      success: true,
      data: {
        results,
        pagination: { page: parseInt(page), limit: parseInt(limit), total }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Quick search (autocomplete)
router.get('/quick', verifyToken, async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 1) {
      return res.json({ success: true, data: [] });
    }

    const searchTerm = `%${q}%`;
    const results = [];

    // Get workers
    const workers = await executeQuery(`
      SELECT id, first_name, last_name, email, position, 'worker' as type
      FROM workers 
      WHERE first_name LIKE ? OR last_name LIKE ? OR email LIKE ?
      ORDER BY first_name, last_name
      LIMIT 5
    `, [searchTerm, searchTerm, searchTerm]);

    workers.data.forEach(w => {
      results.push({
        id: w.id,
        type: 'worker',
        label: `${w.first_name} ${w.last_name}`,
        sublabel: w.position || w.email
      });
    });

    // Get departments
    const departments = await executeQuery(`
      SELECT id, name, 'department' as type
      FROM departments 
      WHERE name LIKE ?
      ORDER BY name
      LIMIT 3
    `, [searchTerm]);

    departments.data.forEach(d => {
      results.push({
        id: d.id,
        type: 'department',
        label: d.name,
        sublabel: 'Department'
      });
    });

    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Advanced filter endpoint
router.post('/filter', verifyToken, async (req, res) => {
  try {
    const { 
      entity = 'workers',
      filters = {},
      sortBy = 'created_at',
      sortOrder = 'DESC',
      page = 1,
      limit = 10
    } = req.body;

    const offset = (page - 1) * limit;
    let data = [];
    let total = 0;

    if (entity === 'workers') {
      let whereClause = '1=1';
      const params = [];

      if (filters.search) {
        whereClause += ' AND (w.first_name LIKE ? OR w.last_name LIKE ? OR w.email LIKE ?)';
        params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
      }
      if (filters.department_id) {
        whereClause += ' AND w.department_id = ?';
        params.push(filters.department_id);
      }
      if (filters.status) {
        whereClause += ' AND w.status = ?';
        params.push(filters.status);
      }
      if (filters.position) {
        whereClause += ' AND w.position LIKE ?';
        params.push(`%${filters.position}%`);
      }
      if (filters.salary_min) {
        whereClause += ' AND w.salary >= ?';
        params.push(filters.salary_min);
      }
      if (filters.salary_max) {
        whereClause += ' AND w.salary <= ?';
        params.push(filters.salary_max);
      }
      if (filters.date_hired_from) {
        whereClause += ' AND w.date_hired >= ?';
        params.push(filters.date_hired_from);
      }
      if (filters.date_hired_to) {
        whereClause += ' AND w.date_hired <= ?';
        params.push(filters.date_hired_to);
      }

      data = await executeQuery(`
        SELECT w.*, d.name as department_name
        FROM workers w
        LEFT JOIN departments d ON w.department_id = d.id
        WHERE ${whereClause}
        ORDER BY w.${sortBy} ${sortOrder}
        LIMIT ? OFFSET ?
      `, [...params, parseInt(limit), parseInt(offset)]);

      const countResult = await getSingleRow(`SELECT COUNT(*) as total FROM workers w WHERE ${whereClause}`, params);
      total = countResult.data?.total || 0;
    }

    if (entity === 'attendance') {
      let whereClause = '1=1';
      const params = [];

      if (filters.worker_id) {
        whereClause += ' AND a.worker_id = ?';
        params.push(filters.worker_id);
      }
      if (filters.status) {
        whereClause += ' AND a.status = ?';
        params.push(filters.status);
      }
      if (filters.startDate) {
        whereClause += ' AND DATE(a.date) >= ?';
        params.push(filters.startDate);
      }
      if (filters.endDate) {
        whereClause += ' AND DATE(a.date) <= ?';
        params.push(filters.endDate);
      }

      data = await executeQuery(`
        SELECT a.*, w.first_name, w.last_name
        FROM attendance a
        JOIN workers w ON a.worker_id = w.id
        WHERE ${whereClause}
        ORDER BY a.${sortBy || 'date'} ${sortOrder}
        LIMIT ? OFFSET ?
      `, [...params, parseInt(limit), parseInt(offset)]);

      const countResult = await getSingleRow(`SELECT COUNT(*) as total FROM attendance a WHERE ${whereClause}`, params);
      total = countResult.data?.total || 0;
    }

    res.json({
      success: true,
      data: {
        results: data.data,
        pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
