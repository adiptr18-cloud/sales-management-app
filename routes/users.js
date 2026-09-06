const express = require('express');
const router = express.Router();
const { verifyAuth, verifyRole } = require('../middleware/auth');

// Get All Users (Admin Only)
router.get('/', verifyAuth, verifyRole(['admin']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const connection = await db.getConnection();

    const [users] = await connection.query(
      'SELECT id, username, email, full_name, phone, role, is_active, created_at FROM users'
    );

    connection.release();

    res.json({
      success: true,
      data: users
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message
    });
  }
});

// Get User by ID
router.get('/:id', verifyAuth, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const connection = await db.getConnection();

    const [users] = await connection.query(
      'SELECT id, username, email, full_name, phone, role, is_active, created_at FROM users WHERE id = ?',
      [req.params.id]
    );

    connection.release();

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: users[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user',
      error: error.message
    });
  }
});

// Update User Profile
router.put('/:id', verifyAuth, async (req, res) => {
  try {
    const { full_name, phone, email } = req.body;
    const db = req.app.locals.db;
    const connection = await db.getConnection();

    // Check if user has permission
    if (req.user.userId !== parseInt(req.params.id) && req.user.role !== 'admin') {
      connection.release();
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    await connection.query(
      'UPDATE users SET full_name = ?, phone = ?, email = ? WHERE id = ?',
      [full_name, phone, email, req.params.id]
    );

    connection.release();

    res.json({
      success: true,
      message: 'User updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update user',
      error: error.message
    });
  }
});

// Deactivate User (Admin Only)
router.put('/:id/deactivate', verifyAuth, verifyRole(['admin']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const connection = await db.getConnection();

    await connection.query(
      'UPDATE users SET is_active = FALSE WHERE id = ?',
      [req.params.id]
    );

    connection.release();

    res.json({
      success: true,
      message: 'User deactivated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to deactivate user',
      error: error.message
    });
  }
});

module.exports = router;
