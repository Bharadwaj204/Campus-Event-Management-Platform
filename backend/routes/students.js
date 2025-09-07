const express = require('express');
const pool = require('../config/database-sqlite');
const { authenticateToken, requireStudent } = require('../middleware/auth');

const router = express.Router();

// Get available events for students
router.get('/events', authenticateToken, requireStudent, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      categoryId, 
      search,
      sortBy = 'event_date',
      sortOrder = 'ASC'
    } = req.query;

    const offset = (page - 1) * limit;
    let whereClause = `
      WHERE e.college_id = $1 
      AND e.status = 'published' 
      AND (e.registration_deadline IS NULL OR e.registration_deadline > NOW())
    `;
    const queryParams = [req.user.college_id];
    let paramCount = 1;

    // Add filters
    if (categoryId) {
      paramCount++;
      whereClause += ` AND e.category_id = $${paramCount}`;
      queryParams.push(categoryId);
    }

    if (search) {
      paramCount++;
      whereClause += ` AND (e.title ILIKE $${paramCount} OR e.description ILIKE $${paramCount})`;
      queryParams.push(`%${search}%`);
    }

    // Validate sort parameters
    const validSortColumns = ['event_date', 'title', 'created_at', 'capacity'];
    const validSortOrders = ['ASC', 'DESC'];
    
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'event_date';
    const sortDirection = validSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'ASC';

    const query = `
      SELECT 
        e.*,
        ec.name as category_name,
        COUNT(r.id) as registration_count,
        CASE WHEN my_reg.id IS NOT NULL THEN true ELSE false END as is_registered
      FROM events e
      LEFT JOIN event_categories ec ON e.category_id = ec.id
      LEFT JOIN registrations r ON e.id = r.event_id AND r.status = 'registered'
      LEFT JOIN registrations my_reg ON e.id = my_reg.event_id AND my_reg.user_id = $1 AND my_reg.status = 'registered'
      ${whereClause}
      GROUP BY e.id, ec.name, my_reg.id
      ORDER BY e.${sortColumn} ${sortDirection}
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    queryParams.push(req.user.id, parseInt(limit), offset);

    const result = await pool.query(query, queryParams);

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM events e
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, queryParams.slice(0, -2));
    const total = parseInt(countResult.rows[0].total);

    res.json({
      events: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get student events error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch events'
    });
  }
});

// Get single event details for students
router.get('/events/:id', authenticateToken, requireStudent, async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT 
        e.*,
        ec.name as category_name,
        COUNT(r.id) as registration_count,
        CASE WHEN my_reg.id IS NOT NULL THEN true ELSE false END as is_registered
      FROM events e
      LEFT JOIN event_categories ec ON e.category_id = ec.id
      LEFT JOIN registrations r ON e.id = r.event_id AND r.status = 'registered'
      LEFT JOIN registrations my_reg ON e.id = my_reg.event_id AND my_reg.user_id = $1 AND my_reg.status = 'registered'
      WHERE e.id = $2 AND e.college_id = $3
      GROUP BY e.id, ec.name, my_reg.id
    `;

    const result = await pool.query(query, [req.user.id, id, req.user.college_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Event not found'
      });
    }

    res.json({ event: result.rows[0] });

  } catch (error) {
    console.error('Get student event error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch event'
    });
  }
});

// Register for an event
router.post('/events/:id/register', authenticateToken, requireStudent, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if event exists and is available for registration
    const eventQuery = `
      SELECT e.*, COUNT(r.id) as current_registrations
      FROM events e
      LEFT JOIN registrations r ON e.id = r.event_id AND r.status = 'registered'
      WHERE e.id = $1 AND e.college_id = $2 AND e.status = 'published'
      GROUP BY e.id
    `;

    const eventResult = await pool.query(eventQuery, [id, req.user.college_id]);

    if (eventResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Event not found or not available for registration'
      });
    }

    const event = eventResult.rows[0];

    // Check registration deadline
    if (event.registration_deadline && new Date() > new Date(event.registration_deadline)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Registration deadline has passed'
      });
    }

    // Check capacity
    if (event.capacity && parseInt(event.current_registrations) >= event.capacity) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'Event is at full capacity'
      });
    }

    // Check if already registered
    const existingRegistration = await pool.query(
      'SELECT id FROM registrations WHERE event_id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (existingRegistration.rows.length > 0) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'Already registered for this event'
      });
    }

    // Register for event
    const registrationQuery = `
      INSERT INTO registrations (event_id, user_id, status)
      VALUES ($1, $2, 'registered')
      RETURNING *
    `;

    const result = await pool.query(registrationQuery, [id, req.user.id]);

    res.status(201).json({
      message: 'Successfully registered for event',
      registration: result.rows[0]
    });

  } catch (error) {
    console.error('Event registration error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to register for event'
    });
  }
});

// Cancel event registration
router.delete('/events/:id/register', authenticateToken, requireStudent, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if registration exists
    const existingRegistration = await pool.query(
      'SELECT id FROM registrations WHERE event_id = $1 AND user_id = $2 AND status = "registered"',
      [id, req.user.id]
    );

    if (existingRegistration.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Registration not found'
      });
    }

    // Cancel registration
    const cancelQuery = `
      UPDATE registrations 
      SET status = 'cancelled'
      WHERE event_id = $1 AND user_id = $2
      RETURNING *
    `;

    const result = await pool.query(cancelQuery, [id, req.user.id]);

    res.json({
      message: 'Registration cancelled successfully',
      registration: result.rows[0]
    });

  } catch (error) {
    console.error('Cancel registration error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to cancel registration'
    });
  }
});

// Get student's registrations
router.get('/registrations', authenticateToken, requireStudent, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status = 'registered',
      sortBy = 'registration_date',
      sortOrder = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;

    // Validate sort parameters
    const validSortColumns = ['registration_date', 'event_date', 'title'];
    const validSortOrders = ['ASC', 'DESC'];
    
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'registration_date';
    const sortDirection = validSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';

    const query = `
      SELECT 
        r.*,
        e.title,
        e.description,
        e.event_date,
        e.start_time,
        e.end_time,
        e.location,
        e.status as event_status,
        ec.name as category_name,
        CASE WHEN a.id IS NOT NULL THEN true ELSE false END as attended
      FROM registrations r
      JOIN events e ON r.event_id = e.id
      LEFT JOIN event_categories ec ON e.category_id = ec.id
      LEFT JOIN attendance a ON e.id = a.event_id AND a.user_id = r.user_id
      WHERE r.user_id = $1 AND r.status = $2
      ORDER BY e.${sortColumn} ${sortDirection}
      LIMIT $3 OFFSET $4
    `;

    const result = await pool.query(query, [req.user.id, status, limit, offset]);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM registrations r
      WHERE r.user_id = $1 AND r.status = $2
    `;
    const countResult = await pool.query(countQuery, [req.user.id, status]);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      registrations: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get student registrations error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch registrations'
    });
  }
});

// Get student's attendance history
router.get('/attendance', authenticateToken, requireStudent, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10,
      sortBy = 'check_in_time',
      sortOrder = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;

    const query = `
      SELECT 
        a.*,
        e.title,
        e.event_date,
        e.start_time,
        e.end_time,
        e.location,
        ec.name as category_name
      FROM attendance a
      JOIN events e ON a.event_id = e.id
      LEFT JOIN event_categories ec ON e.category_id = ec.id
      WHERE a.user_id = $1
      ORDER BY a.${sortBy} ${sortOrder}
      LIMIT $2 OFFSET $3
    `;

    const result = await pool.query(query, [req.user.id, limit, offset]);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM attendance a
      WHERE a.user_id = $1
    `;
    const countResult = await pool.query(countQuery, [req.user.id]);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      attendance: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get student attendance error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch attendance history'
    });
  }
});

module.exports = router;
