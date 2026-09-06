const express = require('express');
const router = express.Router();
const { verifyAuth, verifyRole } = require('../middleware/auth');

// Get All Purchase Orders
router.get('/', verifyAuth, async (req, res) => {
  try {
    const { status } = req.query;
    const db = req.app.locals.db;
    const connection = await db.getConnection();

    let query = 'SELECT * FROM purchase_orders';
    const params = [];

    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY po_date DESC';

    const [purchases] = await connection.query(query, params);
    connection.release();

    res.json({
      success: true,
      data: purchases
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch purchase orders',
      error: error.message
    });
  }
});

// Create Purchase Order
router.post('/', verifyAuth, verifyRole(['manager', 'admin']), async (req, res) => {
  try {
    const { items, expected_delivery_date, tax_amount } = req.body;
    const db = req.app.locals.db;
    const connection = await db.getConnection();

    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const [result] = await connection.query(
      'SELECT COUNT(*) as count FROM purchase_orders WHERE DATE(po_date) = CURDATE()'
    );
    const count = result[0].count + 1;
    const poNumber = `PO-${date}-${String(count).padStart(4, '0')}`;

    // Calculate total
    let subtotal = 0;
    for (let item of items) {
      subtotal += item.quantity * item.unit_price;
    }
    
    const total_amount = subtotal + (tax_amount || 0);

    const [poResult] = await connection.query(
      `INSERT INTO purchase_orders (po_number, user_id, expected_delivery_date, subtotal, tax_amount, total_amount)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [poNumber, req.user.userId, expected_delivery_date, subtotal, tax_amount || 0, total_amount]
    );

    const poId = poResult.insertId;

    // Insert items
    for (let item of items) {
      await connection.query(
        `INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_price, subtotal)
         VALUES (?, ?, ?, ?, ?)`,
        [poId, item.product_id, item.quantity, item.unit_price, item.quantity * item.unit_price]
      );
    }

    connection.release();

    res.json({
      success: true,
      message: 'Purchase order created successfully',
      data: {
        id: poId,
        po_number: poNumber
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create purchase order',
      error: error.message
    });
  }
});

// Receive Purchase Order
router.post('/:id/receive', verifyAuth, verifyRole(['warehouse', 'manager', 'admin']), async (req, res) => {
  try {
    const { received_items } = req.body;
    const db = req.app.locals.db;
    const connection = await db.getConnection();

    await connection.query('START TRANSACTION');

    try {
      // Update PO status
      await connection.query(
        'UPDATE purchase_orders SET status = ? WHERE id = ?',
        ['received', req.params.id]
      );

      // Update items received quantity and stock
      for (let item of received_items) {
        await connection.query(
          'UPDATE purchase_items SET received_quantity = ? WHERE id = ?',
          [item.quantity, item.purchase_item_id]
        );

        // Update stock
        await connection.query(
          'UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?',
          [item.quantity, item.product_id]
        );

        // Log stock
        await connection.query(
          `INSERT INTO stock_logs (product_id, transaction_type, quantity, reference_type, reference_id, created_by)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [item.product_id, 'in', item.quantity, 'purchase', req.params.id, req.user.userId]
        );
      }

      await connection.query('COMMIT');
      connection.release();

      res.json({
        success: true,
        message: 'Purchase order received successfully'
      });
    } catch (error) {
      await connection.query('ROLLBACK');
      connection.release();
      throw error;
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to receive purchase order',
      error: error.message
    });
  }
});

module.exports = router;
