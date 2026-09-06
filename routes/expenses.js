const express = require('express');
const router = express.Router();
const { verifyAuth, verifyRole } = require('../middleware/auth');

// Create Expense
router.post('/', verifyAuth, verifyRole(['manager', 'admin']), async (req, res) => {
  try {
    const { category, amount, expense_date, description, payment_method } = req.body;
    const db = req.app.locals.db;
    const connection = await db.getConnection();

    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const [result] = await connection.query(
      'SELECT COUNT(*) as count FROM expenses WHERE DATE(expense_date) = CURDATE()'
    );
    const count = result[0].count + 1;
    const expenseNumber = `EXP-${date}-${String(count).padStart(4, '0')}`;

    const [insertResult] = await connection.query(
      `INSERT INTO expenses (expense_number, category, amount, expense_date, description, payment_method, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [expenseNumber, category, amount, expense_date, description, payment_method, req.user.userId]
    );

    connection.release();

    res.json({
      success: true,
      message: 'Expense recorded successfully',
      data: {
        id: insertResult.insertId,
        expense_number: expenseNumber
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create expense',
      error: error.message
    });
  }
});

// Get Expenses
router.get('/', verifyAuth, async (req, res) => {
  try {
    const { from_date, to_date, category } = req.query;
    const db = req.app.locals.db;
    const connection = await db.getConnection();

    let query = 'SELECT * FROM expenses';
    const params = [];

    if (from_date && to_date) {
      query += ' WHERE expense_date BETWEEN ? AND ?';
      params.push(from_date, to_date);
    }

    if (category) {
      query += params.length > 0 ? ' AND' : ' WHERE';
      query += ' category = ?';
      params.push(category);
    }

    query += ' ORDER BY expense_date DESC';

    const [expenses] = await connection.query(query, params);
    connection.release();

    res.json({
      success: true,
      data: expenses
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch expenses',
      error: error.message
    });
  }
});

module.exports = router;
