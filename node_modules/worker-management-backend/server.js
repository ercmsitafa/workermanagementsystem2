require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('./config/database'); // Initialize SQLite database

// Import routes
const authRoutes = require('./routes/auth');
const workerRoutes = require('./routes/workers');
const departmentRoutes = require('./routes/departments');
const attendanceRoutes = require('./routes/attendance');
const salaryRoutes = require('./routes/salary');
const dashboardRoutes = require('./routes/dashboard');
const leaveRoutes = require('./routes/leave');
const performanceRoutes = require('./routes/performance');
const activityRoutes = require('./routes/activity');
const exportRoutes = require('./routes/export');
const notificationRoutes = require('./routes/notifications');
const documentRoutes = require('./routes/documents');
const shiftRoutes = require('./routes/shifts');
const trainingRoutes = require('./routes/training');
const benefitRoutes = require('./routes/benefits');
const settingsRoutes = require('./routes/settings');
const searchRoutes = require('./routes/search');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { success: false, message: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/workers', workerRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/salary', salaryRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/leave', leaveRoutes);
app.use('/api/performance', performanceRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/training', trainingRoutes);
app.use('/api/benefits', benefitRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/search', searchRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Worker Management API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server
const startServer = async () => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📚 API Documentation: http://localhost:${PORT}/api/health`);
  });
};

startServer();

module.exports = app;
