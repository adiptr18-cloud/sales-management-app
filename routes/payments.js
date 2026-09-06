const express = require('express');
const router = express.Router();
const { verifyAuth } = require('../middleware/auth');

// Record Payment
router.post('/', verifyAuth, async (req, res) => {
  try {
    const { sale_id, amount, payment_method, reference_number, notes } = req.body;
    const db = req.app.locals.db;
    const connection = await db.getConnection();

    await connection.query('START TRANSACTION');

    try {
      // Insert payment
      await connection.query(
        `INSERT INTO payments (sale_id, amount, payment_method, reference_number, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [sale_id, amount, payment_method, reference_number, notes, req.user.userId]
      );

      // Get sale details
      const [sales] = await connection.query(
        'SELECT total_amount FROM sales WHERE id = ?',
        [sale_id]
      );

      const sale = sales[0];
      
      // Get total paid
      const [payments] = await connection.query(
        'SELECT SUM(amount) as total_paid FROM payments WHERE sale_id = ?',
        [sale_id]
      );

      const totalPaid = payments[0].total_paid || 0;

      // Update payment status
      let paymentStatus = 'unpaid';
      if (totalPaid >= sale.total_amount) {
        paymentStatus = 'paid';
      } else if (totalPaid > 0) {
        paymentStatus = 'partial';
      }

      await connection.query(
        'UPDATE sales SET payment_status = ? WHERE id = ?',
        [paymentStatus, sale_id]
      );

      await connection.query('COMMIT');
      connection.release();

      res.json({
        success: true,
        message: 'Payment recorded successfully',
        payment_status: paymentStatus
      });
    } catch (error) {
      await connection.query('ROLLBACK');
      connection.release();
      throw error;
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to record payment',
      error: error.message
    });
  }
});

// Get Sale Payments
router.get('/sale/:sale_id', verifyAuth, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const connection = await db.getConnection();

    const [payments] = await connection.query(
      'SELECT * FROM payments WHERE sale_id = ? ORDER BY payment_date DESC',
      [req.params.sale_id]
    );

    connection.release();

    res.json({
      success: true,
      data: payments
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payments',
      error: error.message
    });
  }
});

module.exports = router;
