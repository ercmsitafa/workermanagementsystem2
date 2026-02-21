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

// Get performance reviews
router.get('/', verifyToken, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      worker_id,
      reviewer_id,
      status,
      review_period
    } = req.query;
    
    const offset = (page - 1) * limit;

    let whereClause = '1=1';
    const params = [];

    if (worker_id) {
      whereClause += ' AND pr.worker_id = ?';
      params.push(worker_id);
    }

    if (reviewer_id) {
      whereClause += ' AND pr.reviewer_id = ?';
      params.push(reviewer_id);
    }

    if (status) {
      whereClause += ' AND pr.status = ?';
      params.push(status);
    }

    if (review_period) {
      whereClause += ' AND pr.review_period = ?';
      params.push(review_period);
    }

    const query = `
      SELECT pr.*, w.first_name, w.last_name, w.email, w.position, d.name as department_name,
        u.username as reviewer_name
      FROM performance_reviews pr
      JOIN workers w ON pr.worker_id = w.id
      LEFT JOIN departments d ON w.department_id = d.id
      LEFT JOIN users u ON pr.reviewer_id = u.id
      WHERE ${whereClause}
      ORDER BY pr.review_date DESC
      LIMIT ? OFFSET ?
    `;

    const countQuery = `
      SELECT COUNT(*) as total 
      FROM performance_reviews pr
      WHERE ${whereClause}
    `;

    const reviews = await executeQuery(query, [...params, parseInt(limit), parseInt(offset)]);
    const total = await getSingleRow(countQuery, params);

    // Get average rating
    const avgRating = await getSingleRow(`
      SELECT 
        AVG(overall_rating) as avg_overall,
        AVG(goals_achievement) as avg_goals,
        AVG(attendance_rating) as avg_attendance,
        AVG(teamwork_rating) as avg_teamwork,
        AVG(communication_rating) as avg_communication,
        AVG(technical_skills_rating) as avg_technical
      FROM performance_reviews
      WHERE status = 'completed'
    `);

    res.json({
      success: true,
      data: {
        reviews: reviews.data,
        averages: avgRating.data,
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

// Get single review
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const review = await getSingleRow(`
      SELECT pr.*, w.first_name, w.last_name, w.email, w.position, d.name as department_name,
        u.username as reviewer_name
      FROM performance_reviews pr
      JOIN workers w ON pr.worker_id = w.id
      LEFT JOIN departments d ON w.department_id = d.id
      LEFT JOIN users u ON pr.reviewer_id = u.id
      WHERE pr.id = ?
    `, [id]);

    if (!review.data) {
      return res.status(404).json({ 
        success: false, 
        message: 'Review not found' 
      });
    }

    res.json({
      success: true,
      data: review.data
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Get reviews for a specific worker
router.get('/worker/:workerId', verifyToken, async (req, res) => {
  try {
    const { workerId } = req.params;

    const reviews = await executeQuery(`
      SELECT pr.*, u.username as reviewer_name
      FROM performance_reviews pr
      LEFT JOIN users u ON pr.reviewer_id = u.id
      WHERE pr.worker_id = ?
      ORDER BY pr.review_date DESC
    `, [workerId]);

    const latestReview = await getSingleRow(`
      SELECT * FROM performance_reviews 
      WHERE worker_id = ? AND status = 'completed'
      ORDER BY review_date DESC
      LIMIT 1
    `, [workerId]);

    res.json({
      success: true,
      data: {
        reviews: reviews.data,
        latest: latestReview.data
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Create performance review
router.post('/', [
  verifyToken,
  authorize('admin', 'hr'),
  body('worker_id').isInt().withMessage('Valid worker ID required'),
  body('review_period').trim().notEmpty().withMessage('Review period required'),
  body('overall_rating').isFloat({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('goals_achievement').optional().isFloat({ min: 1, max: 5 }),
  body('attendance_rating').optional().isFloat({ min: 1, max: 5 }),
  body('teamwork_rating').optional().isFloat({ min: 1, max: 5 }),
  body('communication_rating').optional().isFloat({ min: 1, max: 5 }),
  body('technical_skills_rating').optional().isFloat({ min: 1, max: 5 })
], validate, async (req, res) => {
  try {
    const { 
      worker_id, 
      review_period,
      review_date = new Date().toISOString().split('T')[0],
      overall_rating,
      goals_achievement = overall_rating,
      attendance_rating = overall_rating,
      teamwork_rating = overall_rating,
      communication_rating = overall_rating,
      technical_skills_rating = overall_rating,
      strengths,
      areas_for_improvement,
      comments,
      status = 'completed'
    } = req.body;

    // Check if worker exists
    const worker = await getSingleRow(
      'SELECT first_name, last_name FROM workers WHERE id = ?',
      [worker_id]
    );

    if (!worker.data) {
      return res.status(404).json({ 
        success: false, 
        message: 'Worker not found' 
      });
    }

    const result = await executeQuery(`
      INSERT INTO performance_reviews 
      (worker_id, reviewer_id, review_period, review_date, overall_rating, 
       goals_achievement, attendance_rating, teamwork_rating, communication_rating, 
       technical_skills_rating, strengths, areas_for_improvement, comments, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      worker_id, req.user.id, review_period, review_date, overall_rating,
      goals_achievement, attendance_rating, teamwork_rating, communication_rating,
      technical_skills_rating, strengths, areas_for_improvement, comments, status
    ]);

    if (result.success) {
      await logActivity(req.user.id, 'performance_review', `Created review for ${worker.data.first_name} ${worker.data.last_name}`);
      
      res.status(201).json({
        success: true,
        message: 'Performance review created successfully',
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

// Update performance review
router.put('/:id', [
  verifyToken,
  authorize('admin', 'hr'),
  body('overall_rating').optional().isFloat({ min: 1, max: 5 })
], validate, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const existing = await getSingleRow(
      'SELECT * FROM performance_reviews WHERE id = ?',
      [id]
    );

    if (!existing.data) {
      return res.status(404).json({ 
        success: false, 
        message: 'Review not found' 
      });
    }

    const allowedFields = [
      'overall_rating', 'goals_achievement', 'attendance_rating', 
      'teamwork_rating', 'communication_rating', 'technical_skills_rating',
      'strengths', 'areas_for_improvement', 'comments', 'status'
    ];

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
      `UPDATE performance_reviews SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    if (result.success) {
      await logActivity(req.user.id, 'performance_update', `Updated review ID: ${id}`);
      
      res.json({
        success: true,
        message: 'Performance review updated successfully'
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

// Delete performance review
router.delete('/:id', verifyToken, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await executeQuery('DELETE FROM performance_reviews WHERE id = ?', [id]);

    if (result.success) {
      await logActivity(req.user.id, 'performance_delete', `Deleted review ID: ${id}`);
      
      res.json({
        success: true,
        message: 'Performance review deleted successfully'
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

// Get performance analytics
router.get('/analytics/summary', verifyToken, async (req, res) => {
  try {
    const { department_id, year } = req.query;
    const targetYear = year || new Date().getFullYear();

    let workerFilter = '';
    const params = [];

    if (department_id) {
      workerFilter = 'AND w.department_id = ?';
      params.push(department_id);
    }

    // Average ratings by department
    const byDepartment = await executeQuery(`
      SELECT 
        d.name,
        COUNT(pr.id) as review_count,
        AVG(pr.overall_rating) as avg_rating,
        AVG(pr.goals_achievement) as avg_goals,
        AVG(pr.attendance_rating) as avg_attendance
      FROM performance_reviews pr
      JOIN workers w ON pr.worker_id = w.id
      LEFT JOIN departments d ON w.department_id = d.id
      WHERE pr.status = 'completed' AND YEAR(pr.review_date) = ?
      ${workerFilter}
      GROUP BY d.id
      ORDER BY avg_rating DESC
    `, [targetYear, ...params.filter(p => p)]);

    // Top performers
    const topPerformers = await executeQuery(`
      SELECT 
        w.id, w.first_name, w.last_name, w.position, d.name as department,
        AVG(pr.overall_rating) as avg_rating
      FROM performance_reviews pr
      JOIN workers w ON pr.worker_id = w.id
      LEFT JOIN departments d ON w.department_id = d.id
      WHERE pr.status = 'completed' AND YEAR(pr.review_date) = ?
      GROUP BY w.id
      ORDER BY avg_rating DESC
      LIMIT 10
    `, [targetYear]);

    // Rating distribution
    const ratingDistribution = await getSingleRow(`
      SELECT 
        SUM(CASE WHEN overall_rating >= 4.5 THEN 1 ELSE 0 END) as excellent,
        SUM(CASE WHEN overall_rating >= 3.5 AND overall_rating < 4.5 THEN 1 ELSE 0 END) as good,
        SUM(CASE WHEN overall_rating >= 2.5 AND overall_rating < 3.5 THEN 1 ELSE 0 END) as average,
        SUM(CASE WHEN overall_rating < 2.5 THEN 1 ELSE 0 END) as needs_improvement,
        COUNT(*) as total
      FROM performance_reviews
      WHERE status = 'completed' AND YEAR(review_date) = ?
    `, [targetYear]);

    res.json({
      success: true,
      data: {
        year: targetYear,
        by_department: byDepartment.data,
        top_performers: topPerformers.data,
        distribution: ratingDistribution.data
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
