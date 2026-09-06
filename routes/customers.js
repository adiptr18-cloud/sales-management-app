const express = require('express');
const router = express.Router();
const { verifyAuth } = require('../middleware/auth');

// Get All Customers
router.get('/', verifyAuth, async (req, res) => {
  try {
    const { search, type } = req.query;
    const db = req.app.locals.db;
    const connection = await db.getConnection();

    let query = 'SELECT * FROM customers WHERE is_active = TRUE';
    const params = [];

    if (search) {
      query += ' AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (type) {
      query += ' AND customer_type = ?';
      params.push(type);
    }

    query += ' ORDER BY name';

    const [customers] = await connection.query(query, params);
    connection.release();

    res.json({
      success: true,
      data: customers
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customers',
      error: error.message
    });
  }
});

// Create Customer
router.post('/', verifyAuth, async (req, res) => {
  try {
    const { name, email, phone, address, city, postal_code, customer_type, credit_limit } = req.body;
    const db = req.app.locals.db;
    const connection = await db.getConnection();

    const [result] = await connection.query(
      `INSERT INTO customers (name, email, phone, address, city, postal_code, customer_type, credit_limit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, email, phone, address, city, postal_code, customer_type || 'retail', credit_limit || 0]
    );

    connection.release();

    res.json({
      success: true,
      message: 'Customer created successfully',
      id: result.insertId
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create customer',
      error: error.message
    });
  }
});

// Update Customer
router.put('/:id', verifyAuth, async (req, res) => {
  try {
    const { name, email, phone, address, city, postal_code, customer_type, credit_limit } = req.body;
    const db = req.app.locals.db;
    const connection = await db.getConnection();

    await connection.query(
      `UPDATE customers SET name = ?, email = ?, phone = ?, address = ?, city = ?, 
       postal_code = ?, customer_type = ?, credit_limit = ? WHERE id = ?`,
      [name, email, phone, address, city, postal_code, customer_type, credit_limit, req.params.id]
    );

    connection.release();

    res.json({
      success: true,
      message: 'Customer updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update customer',
      error: error.message
    });
  }
});

module.exports = router;
