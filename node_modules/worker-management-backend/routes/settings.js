const express = require('express');
const { body, validationResult } = require('express-validator');
const { executeQuery, getSingleRow } = require('../config/database');
const { verifyToken, authorize } = require('../middleware/auth');

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

// Get all settings
router.get('/', verifyToken, async (req, res) => {
  try {
    const settings = await executeQuery('SELECT * FROM settings ORDER BY setting_key');
    
    // Convert to key-value object
    const settingsObj = {};
    settings.data.forEach(s => {
      let value = s.setting_value;
      if (s.setting_type === 'number') value = parseFloat(value);
      else if (s.setting_type === 'boolean') value = value === 'true';
      else if (s.setting_type === 'json') value = JSON.parse(value || '{}');
      settingsObj[s.setting_key] = value;
    });

    res.json({ success: true, data: settingsObj });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get single setting
router.get('/:key', verifyToken, async (req, res) => {
  try {
    const { key } = req.params;
    const setting = await getSingleRow('SELECT * FROM settings WHERE setting_key = ?', [key]);

    if (!setting.data) {
      return res.status(404).json({ success: false, message: 'Setting not found' });
    }

    let value = setting.data.setting_value;
    if (setting.data.setting_type === 'number') value = parseFloat(value);
    else if (setting.data.setting_type === 'boolean') value = value === 'true';
    else if (setting.data.setting_type === 'json') value = JSON.parse(value || '{}');

    res.json({ success: true, data: { key, value, type: setting.data.setting_type, description: setting.data.description } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Set/update setting
router.put('/', [
  verifyToken,
  authorize('admin'),
  body('key').trim().notEmpty().withMessage('Key required'),
  body('value').notEmpty().withMessage('Value required'),
  body('type').optional().isIn(['string', 'number', 'boolean', 'json'])
], validate, async (req, res) => {
  try {
    const { key, value, type = 'string', description } = req.body;

    let stringValue = String(value);
    if (type === 'number') stringValue = String(value);
    else if (type === 'boolean') stringValue = String(value);
    else if (type === 'json') stringValue = JSON.stringify(value);

    // Check if exists
    const existing = await getSingleRow('SELECT id FROM settings WHERE setting_key = ?', [key]);

    if (existing.data) {
      await executeQuery(
        'UPDATE settings SET setting_value = ?, setting_type = ?, description = COALESCE(?, description) WHERE setting_key = ?',
        [stringValue, type, description, key]
      );
    } else {
      await executeQuery(
        'INSERT INTO settings (setting_key, setting_value, setting_type, description) VALUES (?, ?, ?, ?)',
        [key, stringValue, type, description]
      );
    }

    res.json({ success: true, message: 'Setting saved' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete setting
router.delete('/:key', verifyToken, authorize('admin'), async (req, res) => {
  try {
    const { key } = req.params;
    const result = await executeQuery('DELETE FROM settings WHERE setting_key = ?', [key]);
    if (result.success) {
      res.json({ success: true, message: 'Setting deleted' });
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Initialize default settings
router.post('/init', verifyToken, authorize('admin'), async (req, res) => {
  try {
    const defaultSettings = [
      { key: 'company_name', value: 'Worker Management System', type: 'string', description: 'Company name' },
      { key: 'working_hours', value: 8, type: 'number', description: 'Daily working hours' },
      { key: 'weekend_work', value: false, type: 'boolean', description: 'Allow weekend work' },
      { key: 'leave_annual_default', value: 15, type: 'number', description: 'Default annual leave days' },
      { key: 'leave_sick_default', value: 10, type: 'number', description: 'Default sick leave days' },
      { key: 'currency', value: 'USD', type: 'string', description: 'Currency code' },
      { key: 'date_format', value: 'YYYY-MM-DD', type: 'string', description: 'Date format' },
      { key: 'attendance_auto_mark', value: true, type: 'boolean', description: 'Auto-mark attendance' },
      { key: 'require_approval_leave', value: true, type: 'boolean', description: 'Require approval for leave' },
      { key: 'max_leave_balance', value: 30, type: 'number', description: 'Maximum leave balance' }
    ];

    for (const setting of defaultSettings) {
      const existing = await getSingleRow('SELECT id FROM settings WHERE setting_key = ?', [setting.key]);
      if (!existing.data) {
        let stringValue = String(setting.value);
        if (setting.type === 'json') stringValue = JSON.stringify(setting.value);
        
        await executeQuery(
          'INSERT INTO settings (setting_key, setting_value, setting_type, description) VALUES (?, ?, ?, ?)',
          [setting.key, stringValue, setting.type, setting.description]
        );
      }
    }

    res.json({ success: true, message: 'Default settings initialized' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
