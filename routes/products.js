const express = require('express');
const router = express.Router();
const { verifyAuth, verifyRole } = require('../middleware/auth');

// Get All Products
router.get('/', verifyAuth, async (req, res) => {
  try {
    const { category_id, search } = req.query;
    const db = req.app.locals.db;
    const connection = await db.getConnection();

    let query = `
      SELECT p.id, p.sku, p.name, p.description, p.category_id, c.name as category_name,
             p.purchase_price, p.selling_price, p.stock_quantity, p.min_stock, 
             p.unit, p.is_active, p.created_at
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.is_active = TRUE
    `;
    const params = [];

    if (category_id) {
      query += ' AND p.category_id = ?';
      params.push(category_id);
    }

    if (search) {
      query += ' AND (p.name LIKE ? OR p.sku LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY p.name';

    const [products] = await connection.query(query, params);
    connection.release();

    res.json({
      success: true,
      data: products
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products',
      error: error.message
    });
  }
});

// Get Product by ID
router.get('/:id', verifyAuth, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const connection = await db.getConnection();

    const [products] = await connection.query(
      `SELECT p.*, c.name as category_name FROM products p
       LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ?`,
      [req.params.id]
    );

    connection.release();

    if (products.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      data: products[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product',
      error: error.message
    });
  }
});

// Create Product
router.post('/', verifyAuth, verifyRole(['admin', 'manager']), async (req, res) => {
  try {
    const { sku, name, description, category_id, purchase_price, selling_price, unit, min_stock } = req.body;
    const db = req.app.locals.db;
    const connection = await db.getConnection();

    const [result] = await connection.query(
      `INSERT INTO products (sku, name, description, category_id, purchase_price, selling_price, unit, min_stock)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [sku, name, description, category_id, purchase_price, selling_price, unit || 'pcs', min_stock || 10]
    );

    connection.release();

    res.json({
      success: true,
      message: 'Product created successfully',
      id: result.insertId
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create product',
      error: error.message
    });
  }
});

// Update Product
router.put('/:id', verifyAuth, verifyRole(['admin', 'manager']), async (req, res) => {
  try {
    const { name, description, category_id, purchase_price, selling_price, unit, min_stock } = req.body;
    const db = req.app.locals.db;
    const connection = await db.getConnection();

    await connection.query(
      `UPDATE products SET name = ?, description = ?, category_id = ?, 
       purchase_price = ?, selling_price = ?, unit = ?, min_stock = ? WHERE id = ?`,
      [name, description, category_id, purchase_price, selling_price, unit, min_stock, req.params.id]
    );

    connection.release();

    res.json({
      success: true,
      message: 'Product updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update product',
      error: error.message
    });
  }
});

// Check Stock
router.get('/:id/stock', verifyAuth, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const connection = await db.getConnection();

    const [products] = await connection.query(
      'SELECT id, name, stock_quantity, min_stock FROM products WHERE id = ?',
      [req.params.id]
    );

    connection.release();

    if (products.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const product = products[0];
    res.json({
      success: true,
      data: {
        id: product.id,
        name: product.name,
        stock_quantity: product.stock_quantity,
        min_stock: product.min_stock,
        status: product.stock_quantity <= product.min_stock ? 'low' : 'good'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to check stock',
      error: error.message
    });
  }
});

module.exports = router;
