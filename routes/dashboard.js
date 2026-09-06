const express = require('express');
const router = express.Router();
const { verifyAuth } = require('../middleware/auth');

// Get Dashboard Summary
router.get('/summary', verifyAuth, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const connection = await db.getConnection();

    const [todaySales] = await connection.query(
      `SELECT 
        COUNT(*) as total_transactions,
        SUM(total_amount) as total_sales,
        SUM(CASE WHEN payment_status = 'paid' THEN total_amount ELSE 0 END) as cash_received
      FROM sales WHERE DATE(sale_date) = CURDATE()`
    );

    const [todayExpenses] = await connection.query(
      `SELECT SUM(amount) as total_expenses FROM expenses WHERE DATE(expense_date) = CURDATE()`
    );

    const [lowStock] = await connection.query(
      `SELECT COUNT(*) as count FROM products WHERE stock_quantity <= min_stock AND is_active = TRUE`
    );

    const [totalProducts] = await connection.query(
      `SELECT COUNT(*) as count FROM products WHERE is_active = TRUE`
    );

    const [totalCustomers] = await connection.query(
      `SELECT COUNT(*) as count FROM customers WHERE is_active = TRUE`
    );

    connection.release();

    const summary = {
      today: {
        total_transactions: todaySales[0].total_transactions || 0,
        total_sales: todaySales[0].total_sales || 0,
        cash_received: todaySales[0].cash_received || 0,
        total_expenses: todayExpenses[0].total_expenses || 0
      },
      inventory: {
        total_products: totalProducts[0].count || 0,
        low_stock_items: lowStock[0].count || 0
      },
      customers: {
        total_customers: totalCustomers[0].count || 0
      }
    };

    summary.today.net_cash = summary.today.cash_received - summary.today.total_expenses;

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard summary',
      error: error.message
    });
  }
});

// Get Monthly Chart Data
router.get('/monthly-chart', verifyAuth, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const connection = await db.getConnection();

    const query = `
      SELECT 
        DATE(sale_date) as date,
        SUM(total_amount) as sales,
        SUM(CASE WHEN payment_status = 'paid' THEN total_amount ELSE 0 END) as paid,
        COUNT(*) as transactions
      FROM sales
      WHERE sale_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      GROUP BY DATE(sale_date)
      ORDER BY date ASC
    `;

    const [data] = await connection.query(query);
    connection.release();

    res.json({
      success: true,
      data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chart data',
      error: error.message
    });
  }
});

// Get Top Products
router.get('/top-products', verifyAuth, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const connection = await db.getConnection();

    const query = `
      SELECT 
        p.id,
        p.name,
        SUM(si.quantity) as total_sold,
        SUM(si.subtotal) as total_revenue
      FROM products p
      LEFT JOIN sales_items si ON p.id = si.product_id
      LEFT JOIN sales s ON si.sale_id = s.id
      WHERE s.sale_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      GROUP BY p.id, p.name
      ORDER BY total_revenue DESC
      LIMIT 10
    `;

    const [products] = await connection.query(query);
    connection.release();

    res.json({
      success: true,
      data: products
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch top products',
      error: error.message
    });
  }
});

module.exports = router;
