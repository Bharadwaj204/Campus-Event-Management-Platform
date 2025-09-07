const express = require('express');
const Joi = require('joi');
const pool = require('../config/database-sqlite');
const { authenticateToken, requireAdmin, requireAnyRole } = require('../middleware/auth');

const router = express.Router();

// Validation schemas
const eventSchema = Joi.object({
  title: Joi.string().min(3).max(255).required(),
  description: Joi.string().max(1000).optional(),
  eventDate: Joi.date().min('now').required(),
  startTime: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
  endTime: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
  location: Joi.string().max(255).optional(),
  capacity: Joi.number().integer().min(1).optional(),
  registrationDeadline: Joi.date().min('now').optional(),
  categoryId: Joi.number().integer().positive().required()
});

// Get all events for a college (with filters)
router.get('/', authenticateToken, requireAnyRole, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      categoryId, 
      search,
      sortBy = 'event_date',
      sortOrder = 'ASC'
    } = req.query;

    const offset = (page - 1) * limit;
    let whereClause = 'WHERE e.college_id = $1';
    const queryParams = [req.user.college_id];
    let paramCount = 1;

    // Add filters
    if (status) {
      paramCount++;
      whereClause += ` AND e.status = $${paramCount}`;
      queryParams.push(status);
    }

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
        u.first_name as created_by_name,
        COUNT(r.id) as registration_count,
        COUNT(a.id) as attendance_count
      FROM events e
      LEFT JOIN event_categories ec ON e.category_id = ec.id
      LEFT JOIN users u ON e.created_by = u.id
      LEFT JOIN registrations r ON e.id = r.event_id AND r.status = 'registered'
      LEFT JOIN attendance a ON e.id = a.event_id
      ${whereClause}
      GROUP BY e.id, ec.name, u.first_name
      ORDER BY e.${sortColumn} ${sortDirection}
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    queryParams.push(parseInt(limit), offset);

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
    console.error('Get events error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch events'
    });
  }
});

// Get single event
router.get('/:id', authenticateToken, requireAnyRole, async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT 
        e.*,
        ec.name as category_name,
        u.first_name as created_by_name,
        COUNT(r.id) as registration_count,
        COUNT(a.id) as attendance_count
      FROM events e
      LEFT JOIN event_categories ec ON e.category_id = ec.id
      LEFT JOIN users u ON e.created_by = u.id
      LEFT JOIN registrations r ON e.id = r.event_id AND r.status = 'registered'
      LEFT JOIN attendance a ON e.id = a.event_id
      WHERE e.id = $1 AND e.college_id = $2
      GROUP BY e.id, ec.name, u.first_name
    `;

    const result = await pool.query(query, [id, req.user.college_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Event not found'
      });
    }

    res.json({ event: result.rows[0] });

  } catch (error) {
    console.error('Get event error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch event'
    });
  }
});

// Create new event (Admin only)
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { error, value } = eventSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.details[0].message
      });
    }

    const {
      title,
      description,
      eventDate,
      startTime,
      endTime,
      location,
      capacity,
      registrationDeadline,
      categoryId
    } = value;

    // Verify category exists
    const category = await pool.query(
      'SELECT id FROM event_categories WHERE id = $1',
      [categoryId]
    );

    if (category.rows.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid category ID'
      });
    }

    // Validate time logic
    if (startTime >= endTime) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Start time must be before end time'
      });
    }

    const query = `
      INSERT INTO events (
        college_id, category_id, title, description, event_date, 
        start_time, end_time, location, capacity, registration_deadline, 
        created_by, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'draft')
      RETURNING *
    `;

    const result = await pool.query(query, [
      req.user.college_id,
      categoryId,
      title,
      description,
      eventDate,
      startTime,
      endTime,
      location,
      capacity,
      registrationDeadline,
      req.user.id
    ]);

    res.status(201).json({
      message: 'Event created successfully',
      event: result.rows[0]
    });

  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create event'
    });
  }
});

// Update event (Admin only)
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { error, value } = eventSchema.validate(req.body);
    
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.details[0].message
      });
    }

    // Check if event exists and belongs to college
    const existingEvent = await pool.query(
      'SELECT id, status FROM events WHERE id = $1 AND college_id = $2',
      [id, req.user.college_id]
    );

    if (existingEvent.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Event not found'
      });
    }

    // Don't allow updating completed events
    if (existingEvent.rows[0].status === 'completed') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Cannot update completed events'
      });
    }

    const {
      title,
      description,
      eventDate,
      startTime,
      endTime,
      location,
      capacity,
      registrationDeadline,
      categoryId
    } = value;

    const query = `
      UPDATE events SET
        category_id = $1,
        title = $2,
        description = $3,
        event_date = $4,
        start_time = $5,
        end_time = $6,
        location = $7,
        capacity = $8,
        registration_deadline = $9,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $10 AND college_id = $11
      RETURNING *
    `;

    const result = await pool.query(query, [
      categoryId,
      title,
      description,
      eventDate,
      startTime,
      endTime,
      location,
      capacity,
      registrationDeadline,
      id,
      req.user.college_id
    ]);

    res.json({
      message: 'Event updated successfully',
      event: result.rows[0]
    });

  } catch (error) {
    console.error('Update event error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update event'
    });
  }
});

// Update event status (Admin only)
router.patch('/:id/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['draft', 'published', 'cancelled', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid status. Must be one of: ' + validStatuses.join(', ')
      });
    }

    const query = `
      UPDATE events 
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND college_id = $3
      RETURNING *
    `;

    const result = await pool.query(query, [status, id, req.user.college_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Event not found'
      });
    }

    res.json({
      message: 'Event status updated successfully',
      event: result.rows[0]
    });

  } catch (error) {
    console.error('Update event status error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update event status'
    });
  }
});

// Delete event (Admin only)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if event has registrations
    const registrations = await pool.query(
      'SELECT COUNT(*) as count FROM registrations WHERE event_id = $1',
      [id]
    );

    if (parseInt(registrations.rows[0].count) > 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Cannot delete event with existing registrations'
      });
    }

    const query = 'DELETE FROM events WHERE id = $1 AND college_id = $2 RETURNING id';
    const result = await pool.query(query, [id, req.user.college_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Event not found'
      });
    }

    res.json({
      message: 'Event deleted successfully'
    });

  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete event'
    });
  }
});

// Get event registrations (Admin only)
router.get('/:id/registrations', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20, status = 'registered' } = req.query;

    const offset = (page - 1) * limit;

    const query = `
      SELECT 
        r.*,
        u.first_name,
        u.last_name,
        u.email,
        u.student_id
      FROM registrations r
      JOIN users u ON r.user_id = u.id
      WHERE r.event_id = $1 AND r.status = $2
      ORDER BY r.registration_date DESC
      LIMIT $3 OFFSET $4
    `;

    const result = await pool.query(query, [id, status, limit, offset]);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM registrations r
      WHERE r.event_id = $1 AND r.status = $2
    `;
    const countResult = await pool.query(countQuery, [id, status]);
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
    console.error('Get event registrations error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch registrations'
    });
  }
});

module.exports = router;
