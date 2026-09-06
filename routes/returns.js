const express = require('express');
const router = express.Router();
const { verifyAuth, verifyRole } = require('../middleware/auth');

// Create Return
router.post('/', verifyAuth, async (req, res) => {
  try {
    const { sale_id, items, reason, notes } = req.body;
    const db = req.app.locals.db;
    const connection = await db.getConnection();

    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const [result] = await connection.query(
      'SELECT COUNT(*) as count FROM returns WHERE DATE(return_date) = CURDATE()'
    );
    const count = result[0].count + 1;
    const returnNumber = `RET-${date}-${String(count).padStart(4, '0')}`;

    // Calculate total
    let totalAmount = 0;
    for (let item of items) {
      totalAmount += item.quantity * item.unit_price;
    }

    await connection.query('START TRANSACTION');

    try {
      const [returnResult] = await connection.query(
        `INSERT INTO returns (return_number, sale_id, reason, total_amount, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [returnNumber, sale_id, reason, totalAmount, notes, req.user.userId]
      );

      const returnId = returnResult.insertId;

      // Insert return items
      for (let item of items) {
        await connection.query(
          `INSERT INTO return_items (return_id, product_id, quantity, unit_price, subtotal)
           VALUES (?, ?, ?, ?, ?)`,
          [returnId, item.product_id, item.quantity, item.unit_price, item.quantity * item.unit_price]
        );

        // Update stock
        await connection.query(
          'UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?',
          [item.quantity, item.product_id]
        );
      }

      await connection.query('COMMIT');
      connection.release();

      res.json({
        success: true,
        message: 'Return created successfully',
        data: {
          id: returnId,
          return_number: returnNumber
        }
      });
    } catch (error) {
      await connection.query('ROLLBACK');
      connection.release();
      throw error;
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create return',
      error: error.message
    });
  }
});

// Get Returns
router.get('/', verifyAuth, async (req, res) => {
  try {
    const { status } = req.query;
    const db = req.app.locals.db;
    const connection = await db.getConnection();

    let query = 'SELECT * FROM returns';
    const params = [];

    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY return_date DESC';

    const [returns] = await connection.query(query, params);
    connection.release();

    res.json({
      success: true,
      data: returns
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch returns',
      error: error.message
    });
  }
});

// Approve Return
router.put('/:id/approve', verifyAuth, verifyRole(['manager', 'admin']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const connection = await db.getConnection();

    await connection.query(
      'UPDATE returns SET status = ? WHERE id = ?',
      ['approved', req.params.id]
    );

    connection.release();

    res.json({
      success: true,
      message: 'Return approved successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to approve return',
      error: error.message
    });
  }
});

module.exports = router;
