const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const { executeQuery, getSingleRow } = require('../config/database');
const { verifyToken, authorize } = require('../middleware/auth');
const { logActivity } = require('../middleware/activity');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/documents';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|doc|docx|jpg|jpeg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only PDF, DOC, DOCX, and image files are allowed'));
  }
});

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

// Get documents for a worker
router.get('/worker/:workerId', verifyToken, async (req, res) => {
  try {
    const { workerId } = req.params;
    const { type, verified } = req.query;

    let whereClause = 'd.worker_id = ?';
    const params = [workerId];

    if (type) {
      whereClause += ' AND d.document_type = ?';
      params.push(type);
    }

    if (verified !== undefined) {
      whereClause += ' AND d.is_verified = ?';
      params.push(verified === 'true');
    }

    const documents = await executeQuery(`
      SELECT d.*, u.username as uploaded_by_name
      FROM documents d
      LEFT JOIN users u ON d.uploaded_by = u.id
      WHERE ${whereClause}
      ORDER BY d.created_at DESC
    `, params);

    res.json({
      success: true,
      data: documents.data
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Get single document
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const document = await getSingleRow(`
      SELECT d.*, w.first_name, w.last_name, u.username as uploaded_by_name
      FROM documents d
      JOIN workers w ON d.worker_id = w.id
      LEFT JOIN users u ON d.uploaded_by = u.id
      WHERE d.id = ?
    `, [id]);

    if (!document.data) {
      return res.status(404).json({ 
        success: false, 
        message: 'Document not found' 
      });
    }

    res.json({
      success: true,
      data: document.data
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Upload document
router.post('/', [
  verifyToken,
  authorize('admin', 'hr'),
  body('worker_id').isInt().withMessage('Valid worker ID required'),
  body('document_type').isIn(['id', 'certificate', 'contract', 'resume', 'other']).withMessage('Invalid document type'),
  body('title').trim().notEmpty().withMessage('Title is required')
], validate, upload.single('file'), async (req, res) => {
  try {
    const { worker_id, document_type, title, expiry_date } = req.body;

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

    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'No file uploaded' 
      });
    }

    const result = await executeQuery(`
      INSERT INTO documents (worker_id, document_type, title, file_path, file_name, file_size, mime_type, expiry_date, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      worker_id, document_type, title, req.file.path, req.file.originalname, 
      req.file.size, req.file.mimetype, expiry_date, req.user.id
    ]);

    if (result.success) {
      await logActivity(req.user.id, 'document_upload', `Uploaded ${document_type} document for ${worker.data.first_name} ${worker.data.last_name}`);
      
      res.status(201).json({
        success: true,
        message: 'Document uploaded successfully',
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

// Verify document
router.put('/:id/verify', [
  verifyToken,
  authorize('admin', 'hr')
], async (req, res) => {
  try {
    const { id } = req.params;
    const { verified = true } = req.body;

    const result = await executeQuery(
      'UPDATE documents SET is_verified = ? WHERE id = ?',
      [verified, id]
    );

    if (result.success) {
      await logActivity(req.user.id, 'document_verify', `Document ${id} verification: ${verified}`);
      
      res.json({
        success: true,
        message: `Document ${verified ? 'verified' : 'unverified'} successfully`
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

// Update document metadata
router.put('/:id', [
  verifyToken,
  authorize('admin', 'hr'),
  body('title').optional().trim().notEmpty(),
  body('expiry_date').optional().isISO8601()
], validate, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, expiry_date } = req.body;

    const result = await executeQuery(
      'UPDATE documents SET title = COALESCE(?, title), expiry_date = COALESCE(?, expiry_date) WHERE id = ?',
      [title, expiry_date, id]
    );

    if (result.success) {
      res.json({
        success: true,
        message: 'Document updated successfully'
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

// Delete document
router.delete('/:id', verifyToken, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    // Get document info
    const doc = await getSingleRow(
      'SELECT file_path FROM documents WHERE id = ?',
      [id]
    );

    if (doc.data && doc.data.file_path) {
      // Delete file from disk
      if (fs.existsSync(doc.data.file_path)) {
        fs.unlinkSync(doc.data.file_path);
      }
    }

    const result = await executeQuery('DELETE FROM documents WHERE id = ?', [id]);

    if (result.success) {
      await logActivity(req.user.id, 'document_delete', `Deleted document ID: ${id}`);
      
      res.json({
        success: true,
        message: 'Document deleted successfully'
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

// Get expiring documents
router.get('/expiring/soon', verifyToken, authorize('admin', 'hr'), async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const documents = await executeQuery(`
      SELECT d.*, w.first_name, w.last_name, w.email
      FROM documents d
      JOIN workers w ON d.worker_id = w.id
      WHERE d.expiry_date IS NOT NULL 
      AND d.expiry_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
      AND d.expiry_date >= CURDATE()
      ORDER BY d.expiry_date
    `, [parseInt(days)]);

    res.json({
      success: true,
      data: documents.data
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Download document
router.get('/:id/download', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const doc = await getSingleRow(
      'SELECT * FROM documents WHERE id = ?',
      [id]
    );

    if (!doc.data) {
      return res.status(404).json({ 
        success: false, 
        message: 'Document not found' 
      });
    }

    if (!fs.existsSync(doc.data.file_path)) {
      return res.status(404).json({ 
        success: false, 
        message: 'File not found on server' 
      });
    }

    res.download(doc.data.file_path, doc.data.file_name);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

module.exports = router;
