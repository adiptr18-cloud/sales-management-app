const express = require('express');
const router = express.Router();
const { generateToken, hashPassword, comparePassword, verifyAuth } = require('../middleware/auth');

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const db = req.app.locals.db;
    const connection = await db.getConnection();

    const [users] = await connection.query(
      'SELECT id, username, password, role, is_active FROM users WHERE username = ?',
      [username]
    );

    if (users.length === 0) {
      connection.release();
      return res.status(401).json({
        success: false,
        message: 'Username or password incorrect'
      });
    }

    const user = users[0];

    if (!user.is_active) {
      connection.release();
      return res.status(401).json({
        success: false,
        message: 'Account is not active'
      });
    }

    const passwordMatch = await comparePassword(password, user.password);

    if (!passwordMatch) {
      connection.release();
      return res.status(401).json({
        success: false,
        message: 'Username or password incorrect'
      });
    }

    const token = generateToken(user.id, user.role);

    // Log activity
    await connection.query(
      'INSERT INTO activity_logs (user_id, action, module) VALUES (?, ?, ?)',
      [user.id, 'Login', 'Auth']
    );

    connection.release();

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
});

// Register (Admin Only)
router.post('/register', verifyAuth, async (req, res) => {
  try {
    const { username, email, password, full_name, phone, role } = req.body;
    const db = req.app.locals.db;
    const connection = await db.getConnection();

    // Check if user exists
    const [existing] = await connection.query(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email]
    );

    if (existing.length > 0) {
      connection.release();
      return res.status(400).json({
        success: false,
        message: 'Username or email already exists'
      });
    }

    const hashedPassword = await hashPassword(password);

    await connection.query(
      'INSERT INTO users (username, email, password, full_name, phone, role) VALUES (?, ?, ?, ?, ?, ?)',
      [username, email, hashedPassword, full_name, phone, role || 'cashier']
    );

    connection.release();

    res.json({
      success: true,
      message: 'User registered successfully'
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
});

// Logout
router.post('/logout', verifyAuth, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const connection = await db.getConnection();

    await connection.query(
      'INSERT INTO activity_logs (user_id, action, module) VALUES (?, ?, ?)',
      [req.user.userId, 'Logout', 'Auth']
    );

    connection.release();

    res.json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed',
      error: error.message
    });
  }
});

module.exports = router;
