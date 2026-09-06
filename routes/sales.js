const express = require('express');
const router = express.Router();
const { verifyAuth, verifyRole } = require('../middleware/auth');

// Generate Invoice Number
const generateInvoiceNumber = async (connection) => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const [result] = await connection.query(
    'SELECT COUNT(*) as count FROM sales WHERE DATE(sale_date) = CURDATE()'
  );
  const count = result[0].count + 1;
  return `INV-${date}-${String(count).padStart(4, '0')}`;
};

// Get All Sales
router.get('/', verifyAuth, async (req, res) => {
  try {
    const { status, from_date, to_date } = req.query;
    const db = req.app.locals.db;
    const connection = await db.getConnection();

    let query = `
      SELECT s.*, c.name as customer_name, u.username as user_name
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN users u ON s.user_id = u.id
    `;
    const params = [];

    if (status) {
      query += ' WHERE s.status = ?';
      params.push(status);
    }

    if (from_date && to_date) {
      query += params.length > 0 ? ' AND' : ' WHERE';
      query += ' s.sale_date BETWEEN ? AND ?';
      params.push(from_date, to_date);
    }

    query += ' ORDER BY s.sale_date DESC';

    const [sales] = await connection.query(query, params);
    connection.release();

    res.json({
      success: true,
      data: sales
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sales',
      error: error.message
    });
  }
});

// Create Sale
router.post('/', verifyAuth, verifyRole(['cashier', 'manager', 'admin']), async (req, res) => {
  try {
    const { customer_id, items, tax_amount, discount_amount, payment_method } = req.body;
    const db = req.app.locals.db;
    const connection = await db.getConnection();

    // Start transaction
    await connection.query('START TRANSACTION');

    try {
      const invoiceNumber = await generateInvoiceNumber(connection);
      
      // Calculate total
      let subtotal = 0;
      for (let item of items) {
        subtotal += item.quantity * item.unit_price * (1 - (item.discount_percent || 0) / 100);
      }
      
      const total_amount = subtotal + (tax_amount || 0) - (discount_amount || 0);

      // Insert sale
      const [saleResult] = await connection.query(
        `INSERT INTO sales (invoice_number, customer_id, user_id, subtotal, tax_amount, discount_amount, total_amount, payment_method)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [invoiceNumber, customer_id || null, req.user.userId, subtotal, tax_amount || 0, discount_amount || 0, total_amount, payment_method]
      );

      const saleId = saleResult.insertId;

      // Insert sale items and update stock
      for (let item of items) {
        await connection.query(
          `INSERT INTO sales_items (sale_id, product_id, quantity, unit_price, discount_percent, subtotal)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [saleId, item.product_id, item.quantity, item.unit_price, item.discount_percent || 0, 
           item.quantity * item.unit_price * (1 - (item.discount_percent || 0) / 100)]
        );

        // Update product stock
        await connection.query(
          'UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?',
          [item.quantity, item.product_id]
        );

        // Log stock transaction
        await connection.query(
          `INSERT INTO stock_logs (product_id, transaction_type, quantity, reference_type, reference_id, created_by)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [item.product_id, 'out', item.quantity, 'sale', saleId, req.user.userId]
        );
      }

      await connection.query('COMMIT');
      connection.release();

      res.json({
        success: true,
        message: 'Sale created successfully',
        data: {
          id: saleId,
          invoice_number: invoiceNumber,
          total_amount
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
      message: 'Failed to create sale',
      error: error.message
    });
  }
});

// Get Sale Details
router.get('/:id', verifyAuth, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const connection = await db.getConnection();

    const [sales] = await connection.query(
      'SELECT * FROM sales WHERE id = ?',
      [req.params.id]
    );

    if (sales.length === 0) {
      connection.release();
      return res.status(404).json({
        success: false,
        message: 'Sale not found'
      });
    }

    const [items] = await connection.query(
      `SELECT si.*, p.name, p.sku FROM sales_items si
       LEFT JOIN products p ON si.product_id = p.id WHERE si.sale_id = ?`,
      [req.params.id]
    );

    connection.release();

    res.json({
      success: true,
      data: {
        ...sales[0],
        items
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sale',
      error: error.message
    });
  }
});

module.exports = router;
