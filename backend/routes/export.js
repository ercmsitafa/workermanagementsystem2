const express = require('express');
const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');
const { executeQuery, getSingleRow } = require('../config/database');
const { verifyToken, authorize } = require('../middleware/auth');

const router = express.Router();

// Export workers to Excel
router.get('/workers/excel', verifyToken, async (req, res) => {
  try {
    const { department_id, status, search } = req.query;

    let whereClause = '1=1';
    const params = [];

    if (department_id) {
      whereClause += ' AND w.department_id = ?';
      params.push(department_id);
    }

    if (status) {
      whereClause += ' AND w.status = ?';
      params.push(status);
    }

    if (search) {
      whereClause += ' AND (w.first_name LIKE ? OR w.last_name LIKE ? OR w.email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const workers = await executeQuery(`
      SELECT w.*, d.name as department_name
      FROM workers w
      LEFT JOIN departments d ON w.department_id = d.id
      WHERE ${whereClause}
      ORDER BY w.first_name
    `, params);

    // Transform data for Excel
    const data = workers.data.map(w => ({
      'First Name': w.first_name,
      'Last Name': w.last_name,
      'Email': w.email,
      'Phone': w.phone || '',
      'Position': w.position || '',
      'Department': w.department_name || '',
      'Salary': w.salary || 0,
      'Date Hired': w.date_hired ? new Date(w.date_hired).toLocaleDateString() : '',
      'Status': w.status
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Workers');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=workers.xlsx');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Export attendance to Excel
router.get('/attendance/excel', verifyToken, async (req, res) => {
  try {
    const { startDate, endDate, department_id } = req.query;

    let whereClause = '1=1';
    const params = [];

    if (startDate) {
      whereClause += ' AND DATE(a.date) >= ?';
      params.push(startDate);
    }

    if (endDate) {
      whereClause += ' AND DATE(a.date) <= ?';
      params.push(endDate);
    }

    if (department_id) {
      whereClause += ' AND w.department_id = ?';
      params.push(department_id);
    }

    const attendance = await executeQuery(`
      SELECT a.*, w.first_name, w.last_name, w.email, d.name as department_name
      FROM attendance a
      JOIN workers w ON a.worker_id = w.id
      LEFT JOIN departments d ON w.department_id = d.id
      WHERE ${whereClause}
      ORDER BY a.date DESC, w.first_name
    `, params);

    const data = attendance.data.map(a => ({
      'Date': new Date(a.date).toLocaleDateString(),
      'First Name': a.first_name,
      'Last Name': a.last_name,
      'Email': a.email,
      'Department': a.department_name || '',
      'Status': a.status,
      'Notes': a.notes || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=attendance.xlsx');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Export salaries to Excel
router.get('/salaries/excel', verifyToken, async (req, res) => {
  try {
    const { month, year, department_id } = req.query;

    let whereClause = '1=1';
    const params = [];

    if (month && year) {
      whereClause += ' AND MONTH(s.month) = ? AND YEAR(s.month) = ?';
      params.push(parseInt(month), parseInt(year));
    }

    if (department_id) {
      whereClause += ' AND w.department_id = ?';
      params.push(department_id);
    }

    const salaries = await executeQuery(`
      SELECT s.*, w.first_name, w.last_name, w.email, w.position, d.name as department_name
      FROM salaries s
      JOIN workers w ON s.worker_id = w.id
      LEFT JOIN departments d ON w.department_id = d.id
      WHERE ${whereClause}
      ORDER BY s.month DESC, w.first_name
    `, params);

    const data = salaries.data.map(s => ({
      'Month': s.month,
      'First Name': s.first_name,
      'Last Name': s.last_name,
      'Email': s.email,
      'Position': s.position || '',
      'Department': s.department_name || '',
      'Base Salary': s.base_salary || 0,
      'Bonus': s.bonus || 0,
      'Allowances': s.allowances || 0,
      'Deductions': s.deductions || 0,
      'Net Salary': s.net_salary || 0
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Salaries');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=salaries.xlsx');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Generate PDF report
router.get('/report/pdf', verifyToken, async (req, res) => {
  try {
    const { type = 'summary', startDate, endDate } = req.query;

    const doc = new PDFDocument({ margin: 50 });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=report.pdf');
    
    doc.pipe(res);

    // Header
    doc.fontSize(20).text('Worker Management System Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Report Type: ${type}`, { align: 'center' });
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });
    doc.moveDown(2);

    // Worker summary
    const workerStats = await getSingleRow(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(salary) as total_salary,
        AVG(salary) as avg_salary
      FROM workers
    `);

    doc.fontSize(14).text('Worker Summary', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11).text(`Total Workers: ${workerStats.data?.total || 0}`);
    doc.text(`Active Workers: ${workerStats.data?.active || 0}`);
    doc.text(`Total Monthly Payroll: $${(workerStats.data?.total_salary || 0).toLocaleString()}`);
    doc.text(`Average Salary: $${(workerStats.data?.avg_salary || 0).toLocaleString()}`);
    doc.moveDown(2);

    // Department summary
    const departments = await executeQuery(`
      SELECT d.name, COUNT(w.id) as worker_count, SUM(w.salary) as total_salary
      FROM departments d
      LEFT JOIN workers w ON d.id = w.department_id AND w.status = 'active'
      GROUP BY d.id
      ORDER BY worker_count DESC
    `);

    doc.fontSize(14).text('Department Summary', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);
    departments.data.forEach(dept => {
      doc.text(`${dept.name}: ${dept.worker_count} workers, $${(dept.total_salary || 0).toLocaleString()}`);
    });
    doc.moveDown(2);

    // Attendance summary
    const attendanceStats = await getSingleRow(`
      SELECT 
        SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present,
        SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent,
        SUM(CASE WHEN status = 'leave' THEN 1 ELSE 0 END) as leave
      FROM attendance
      WHERE date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
    `);

    doc.fontSize(14).text('Attendance Summary (Last 30 Days)', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11).text(`Present: ${attendanceStats.data?.present || 0}`);
    doc.text(`Absent: ${attendanceStats.data?.absent || 0}`);
    doc.text(`On Leave: ${attendanceStats.data?.leave || 0}`);
    
    // Footer
    doc.moveDown(3);
    doc.fontSize(9).text('Generated by Worker Management System', { align: 'center' });

    doc.end();
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Export leave requests to Excel
router.get('/leave/excel', verifyToken, async (req, res) => {
  try {
    const { status, startDate, endDate, year } = req.query;

    let whereClause = '1=1';
    const params = [];

    if (status) {
      whereClause += ' AND lr.status = ?';
      params.push(status);
    }

    if (year) {
      whereClause += ' AND YEAR(lr.start_date) = ?';
      params.push(parseInt(year));
    }

    const requests = await executeQuery(`
      SELECT lr.*, w.first_name, w.last_name, w.email, d.name as department_name
      FROM leave_requests lr
      JOIN workers w ON lr.worker_id = w.id
      LEFT JOIN departments d ON w.department_id = d.id
      WHERE ${whereClause}
      ORDER BY lr.created_at DESC
    `, params);

    const data = requests.data.map(lr => ({
      'Employee': `${lr.first_name} ${lr.last_name}`,
      'Email': lr.email,
      'Department': lr.department_name || '',
      'Leave Type': lr.leave_type,
      'Start Date': new Date(lr.start_date).toLocaleDateString(),
      'End Date': new Date(lr.end_date).toLocaleDateString(),
      'Days': lr.days,
      'Reason': lr.reason || '',
      'Status': lr.status,
      'Applied On': new Date(lr.created_at).toLocaleDateString()
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Leave Requests');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=leave_requests.xlsx');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Export performance reviews to Excel
router.get('/performance/excel', verifyToken, async (req, res) => {
  try {
    const { year, department_id } = req.query;

    let whereClause = '1=1';
    const params = [];

    if (year) {
      whereClause += ' AND YEAR(pr.review_date) = ?';
      params.push(parseInt(year));
    }

    if (department_id) {
      whereClause += ' AND w.department_id = ?';
      params.push(department_id);
    }

    const reviews = await executeQuery(`
      SELECT pr.*, w.first_name, w.last_name, w.email, w.position, d.name as department_name
      FROM performance_reviews pr
      JOIN workers w ON pr.worker_id = w.id
      LEFT JOIN departments d ON w.department_id = d.id
      WHERE ${whereClause} AND pr.status = 'completed'
      ORDER BY pr.review_date DESC
    `, params);

    const data = reviews.data.map(pr => ({
      'Employee': `${pr.first_name} ${pr.last_name}`,
      'Email': pr.email,
      'Position': pr.position || '',
      'Department': pr.department_name || '',
      'Review Period': pr.review_period,
      'Review Date': new Date(pr.review_date).toLocaleDateString(),
      'Overall Rating': pr.overall_rating,
      'Goals Achievement': pr.goals_achievement,
      'Attendance': pr.attendance_rating,
      'Teamwork': pr.teamwork_rating,
      'Communication': pr.communication_rating,
      'Technical Skills': pr.technical_skills_rating,
      'Strengths': pr.strengths || '',
      'Areas for Improvement': pr.areas_for_improvement || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Performance Reviews');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=performance_reviews.xlsx');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

module.exports = router;
