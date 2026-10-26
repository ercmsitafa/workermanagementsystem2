const express = require('express');
const { body, validationResult } = require('express-validator');
const { executeQuery, getSingleRow } = require('../config/database');
const { verifyToken, authorize } = require('../middleware/auth');

const router = express.Router();
const TYPES = ['string', 'number', 'boolean', 'json'];

function parseValue(value, type = 'string') {
  if (type === 'number') {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error('Setting value must be a valid number');
    return number;
  }
  if (type === 'boolean') return String(value) === 'true';
  if (type === 'json') {
    try { return JSON.parse(value || '{}'); }
    catch { throw new Error('Setting value contains invalid JSON'); }
  }
  return value == null ? '' : String(value);
}

function serializeValue(value, type) {
  if (type === 'json') return JSON.stringify(value);
  if (type === 'boolean') return String(value === true || value === 'true');
  return String(value);
}

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  next();
}

router.get('/', verifyToken, async (req, res) => {
  try {
    const result = await executeQuery('SELECT key, value, type FROM settings ORDER BY key');
    const data = {};
    for (const setting of result.data) data[setting.key] = parseValue(setting.value, setting.type);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:key', verifyToken, async (req, res) => {
  try {
    const result = await getSingleRow('SELECT key, value, type FROM settings WHERE key = ?', [req.params.key]);
    if (!result.data) return res.status(404).json({ success: false, message: 'Setting not found' });
    res.json({ success: true, data: { key: result.data.key, value: parseValue(result.data.value, result.data.type), type: result.data.type || 'string' } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/', [
  verifyToken,
  authorize('admin'),
  body('key').isString().trim().notEmpty().withMessage('Key is required'),
  body('value').exists().withMessage('Value is required'),
  body('type').optional().isIn(TYPES).withMessage('Unsupported setting type')
], validate, async (req, res) => {
  try {
    const key = req.body.key.trim();
    const type = req.body.type || 'string';
    const value = serializeValue(req.body.value, type);
    // Validate typed values before persisting them.
    parseValue(value, type);
    const existing = await getSingleRow('SELECT id FROM settings WHERE key = ?', [key]);
    if (existing.data) {
      await executeQuery('UPDATE settings SET value = ?, type = ? WHERE key = ?', [value, type, key]);
    } else {
      await executeQuery('INSERT INTO settings (key, value, type) VALUES (?, ?, ?)', [key, value, type]);
    }
    res.json({ success: true, message: 'Setting saved', data: { key, value: parseValue(value, type), type } });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.delete('/:key', verifyToken, authorize('admin'), async (req, res) => {
  try {
    const result = await executeQuery('DELETE FROM settings WHERE key = ?', [req.params.key]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Setting not found' });
    res.json({ success: true, message: 'Setting deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/init', verifyToken, authorize('admin'), async (req, res) => {
  try {
    const defaults = [
      ['company_name', 'Worker Management System', 'string'],
      ['working_hours', '8', 'number'],
      ['weekend_work', 'false', 'boolean'],
      ['leave_annual_default', '15', 'number'],
      ['leave_sick_default', '10', 'number'],
      ['currency', 'RWF', 'string'],
      ['date_format', 'YYYY-MM-DD', 'string'],
      ['attendance_auto_mark', 'true', 'boolean'],
      ['require_approval_leave', 'true', 'boolean'],
      ['max_leave_balance', '30', 'number'],
      ['maintenance_mode', 'false', 'boolean'],
      ['allow_worker_self_registration', 'false', 'boolean']
    ];
    for (const [key, value, type] of defaults) {
      const existing = await getSingleRow('SELECT id FROM settings WHERE key = ?', [key]);
      if (!existing.data) await executeQuery('INSERT INTO settings (key, value, type) VALUES (?, ?, ?)', [value, type, key]);
    }
    res.json({ success: true, message: 'Default settings initialized without overwriting existing values' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
