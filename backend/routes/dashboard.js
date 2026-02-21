const express = require('express');
const { executeQuery, getSingleRow } = require('../config/database');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// Get main dashboard data
router.get('/', verifyToken, async (req, res) => {
  try {
    // Worker statistics
    const workerStats = await getSingleRow(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) as inactive,
        SUM(salary) as total_salary,
        AVG(salary) as avg_salary
      FROM workers
    `);

    // Today's attendance
    const todayAttendance = await getSingleRow(`
      SELECT 
        SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present,
        SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent,
        SUM(CASE WHEN status = 'leave' THEN 1 ELSE 0 END) as leave,
        COUNT(*) as total
      FROM attendance
      WHERE DATE(date) = CURDATE()
    `);

    // Department distribution
    const departmentStats = await executeQuery(`
      SELECT d.name, COUNT(w.id) as worker_count
      FROM departments d
      LEFT JOIN workers w ON d.id = w.department_id AND w.status = 'active'
      GROUP BY d.id
      ORDER BY worker_count DESC
    `);

    // Recent workers
    const recentWorkers = await executeQuery(`
      SELECT id, first_name, last_name, email, position, date_hired
      FROM workers
      ORDER BY created_at DESC
      LIMIT 5
    `);

    // Recent attendance (last 7 days)
    const weeklyAttendance = await executeQuery(`
      SELECT 
        DATE(date) as date,
        SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present,
        SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent,
        SUM(CASE WHEN status = 'leave' THEN 1 ELSE 0 END) as leave,
        COUNT(*) as total
      FROM attendance
      WHERE date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
      GROUP BY DATE(date)
      ORDER BY date
    `);

    // Salary stats for current month
    const currentMonth = new Date().toISOString().slice(0, 7);
    const salaryStats = await getSingleRow(`
      SELECT 
        SUM(base_salary) as total_base,
        SUM(deductions) as total_deductions,
        SUM(net_salary) as total_net
      FROM salaries
      WHERE month = ?
    `, [currentMonth]);

    // Attendance rate (last 30 days)
    const attendanceRate = await getSingleRow(`
      SELECT 
        ROUND(SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) as rate,
        SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present,
        SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent,
        SUM(CASE WHEN status = 'leave' THEN 1 ELSE 0 END) as leave
      FROM attendance
      WHERE date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
    `);

    res.json({
      success: true,
      data: {
        workers: workerStats.data,
        today_attendance: todayAttendance.data,
        departments: departmentStats.data,
        recent_workers: recentWorkers.data,
        weekly_attendance: weeklyAttendance.data,
        salaries: salaryStats.data,
        attendance_rate: attendanceRate.data
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Get analytics data
router.get('/analytics', verifyToken, async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const days = parseInt(period);

    // Worker trends
    const workerTrends = await executeQuery(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
      FROM workers
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(created_at)
      ORDER BY date
    `, [days]);

    // Salary distribution by department
    const salaryByDepartment = await executeQuery(`
      SELECT 
        d.name,
        COUNT(w.id) as worker_count,
        SUM(w.salary) as total_salary,
        AVG(w.salary) as avg_salary
      FROM departments d
      LEFT JOIN workers w ON d.id = w.department_id AND w.status = 'active'
      GROUP BY d.id
      ORDER BY total_salary DESC
    `);

    // Position distribution
    const positionDistribution = await executeQuery(`
      SELECT position, COUNT(*) as count
      FROM workers
      WHERE status = 'active' AND position IS NOT NULL
      GROUP BY position
      ORDER BY count DESC
      LIMIT 10
    `);

    // Monthly salary trends
    const salaryTrends = await executeQuery(`
      SELECT 
        month,
        SUM(base_salary) as total_base,
        SUM(net_salary) as total_net,
        COUNT(*) as employee_count
      FROM salaries
      WHERE month >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
      GROUP BY month
      ORDER BY month
    `);

    // Attendance heatmap data
    const attendanceHeatmap = await executeQuery(`
      SELECT 
        DAYOFWEEK(date) as day_of_week,
        COUNT(*) as count,
        SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present
      FROM attendance
      WHERE date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DAYOFWEEK(date)
      ORDER BY day_of_week
    `, [days]);

    res.json({
      success: true,
      data: {
        worker_trends: workerTrends.data,
        salary_by_department: salaryByDepartment.data,
        position_distribution: positionDistribution.data,
        salary_trends: salaryTrends.data,
        attendance_heatmap: attendanceHeatmap.data
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Get reports summary
router.get('/reports', verifyToken, async (req, res) => {
  try {
    const { startDate, endDate, department_id } = req.query;

    let workerFilter = '';
    const params = [];

    if (department_id) {
      workerFilter = 'AND department_id = ?';
      params.push(department_id);
    }

    // Workers hired in period
    const newHires = await getSingleRow(`
      SELECT COUNT(*) as count
      FROM workers
      WHERE date_hired BETWEEN ? AND ?
      ${workerFilter}
    `, [startDate, endDate, ...params.filter(p => p)]);

    // Attendance summary
    const attendanceSummary = await getSingleRow(`
      SELECT 
        SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present,
        SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent,
        SUM(CASE WHEN status = 'leave' THEN 1 ELSE 0 END) as leave,
        COUNT(*) as total,
        ROUND(SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 1) as attendance_rate
      FROM attendance a
      JOIN workers w ON a.worker_id = w.id
      WHERE a.date BETWEEN ? AND ?
      ${workerFilter ? 'AND w.department_id = ?' : ''}
    `, [startDate, endDate, ...params.filter(p => p)]);

    // Salary summary
    const salarySummary = await getSingleRow(`
      SELECT 
        SUM(base_salary) as total_base,
        SUM(deductions) as total_deductions,
        SUM(net_salary) as total_net,
        AVG(net_salary) as avg_salary
      FROM salaries s
      JOIN workers w ON s.worker_id = w.id
      WHERE s.month BETWEEN ? AND ?
      ${workerFilter ? 'AND w.department_id = ?' : ''}
    `, [startDate.slice(0, 7), endDate.slice(0, 7), ...params.filter(p => p)]);

    res.json({
      success: true,
      data: {
        period: { startDate, endDate },
        new_hires: newHires.data,
        attendance: attendanceSummary.data,
        salary: salarySummary.data
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Get quick stats
router.get('/quick-stats', verifyToken, async (req, res) => {
  try {
    const stats = await getSingleRow(`
      SELECT 
        (SELECT COUNT(*) FROM workers WHERE status = 'active') as active_workers,
        (SELECT COUNT(*) FROM workers WHERE status = 'inactive') as inactive_workers,
        (SELECT COUNT(*) FROM departments) as departments,
        (SELECT SUM(salary) FROM workers WHERE status = 'active') as total_payroll,
        (SELECT AVG(salary) FROM workers WHERE status = 'active') as avg_salary,
        (SELECT COUNT(*) FROM attendance WHERE date = CURDATE() AND status = 'present') as present_today,
        (SELECT COUNT(*) FROM workers WHERE status = 'active') as total_active
    `);

    res.json({
      success: true,
      data: {
        ...stats.data,
        attendance_today_rate: stats.data.total_active > 0 
          ? Math.round((stats.data.present_today / stats.data.total_active) * 100) 
          : 0
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
