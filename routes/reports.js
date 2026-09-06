const express = require('express');
const router = express.Router();
const { verifyAuth, verifyRole } = require('../middleware/auth');

// Sales Report
router.get('/sales', verifyAuth, verifyRole(['manager', 'admin']), async (req, res) => {
  try {
    const { from_date, to_date } = req.query;
    const db = req.app.locals.db;
    const connection = await db.getConnection();

    let query = `
      SELECT 
        DATE(sale_date) as date,
        COUNT(*) as total_transactions,
        SUM(total_amount) as total_sales,
        SUM(tax_amount) as total_tax,
        SUM(discount_amount) as total_discount,
        COUNT(CASE WHEN payment_status = 'paid' THEN 1 END) as paid_count,
        SUM(CASE WHEN payment_status = 'paid' THEN total_amount ELSE 0 END) as paid_amount
      FROM sales
      WHERE 1=1
    `;
    const params = [];

    if (from_date && to_date) {
      query += ' AND sale_date BETWEEN ? AND ?';
      params.push(from_date, to_date);
    }

    query += ' GROUP BY DATE(sale_date) ORDER BY date DESC';

    const [report] = await connection.query(query, params);
    connection.release();

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to generate sales report',
      error: error.message
    });
  }
});

// Product Sales Report
router.get('/products', verifyAuth, async (req, res) => {
  try {
    const { from_date, to_date } = req.query;
    const db = req.app.locals.db;
    const connection = await db.getConnection();

    let query = `
      SELECT 
        p.id,
        p.name,
        p.sku,
        SUM(si.quantity) as total_quantity,
        SUM(si.subtotal) as total_revenue,
        AVG(si.unit_price) as avg_price
      FROM products p
      LEFT JOIN sales_items si ON p.id = si.product_id
      LEFT JOIN sales s ON si.sale_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (from_date && to_date) {
      query += ' AND s.sale_date BETWEEN ? AND ?';
      params.push(from_date, to_date);
    }

    query += ' GROUP BY p.id, p.name, p.sku ORDER BY total_revenue DESC';

    const [report] = await connection.query(query, params);
    connection.release();

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to generate product report',
      error: error.message
    });
  }
});

// Customer Report
router.get('/customers', verifyAuth, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const connection = await db.getConnection();

    const query = `
      SELECT 
        c.id,
        c.name,
        c.customer_type,
        COUNT(s.id) as total_transactions,
        SUM(s.total_amount) as total_spent,
        MAX(s.sale_date) as last_purchase
      FROM customers c
      LEFT JOIN sales s ON c.id = s.customer_id
      GROUP BY c.id, c.name, c.customer_type
      ORDER BY total_spent DESC
    `;

    const [report] = await connection.query(query);
    connection.release();

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to generate customer report',
      error: error.message
    });
  }
});

// Stock Report
router.get('/stock', verifyAuth, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const connection = await db.getConnection();

    const query = `
      SELECT 
        p.id,
        p.sku,
        p.name,
        c.name as category,
        p.stock_quantity,
        p.min_stock,
        p.purchase_price,
        p.selling_price,
        (p.stock_quantity * p.purchase_price) as stock_value,
        CASE 
          WHEN p.stock_quantity <= p.min_stock THEN 'Low'
          WHEN p.stock_quantity <= p.min_stock * 1.5 THEN 'Medium'
          ELSE 'High'
        END as stock_status
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.is_active = TRUE
      ORDER BY stock_value DESC
    `;

    const [report] = await connection.query(query);
    connection.release();

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to generate stock report',
      error: error.message
    });
  }
});

module.exports = router;
