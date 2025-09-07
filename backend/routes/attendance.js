const express = require('express');
const pool = require('../config/database-sqlite');
const { authenticateToken, requireAnyRole } = require('../middleware/auth');

const router = express.Router();

// Check in for an event
router.post('/events/:id/checkin', authenticateToken, requireAnyRole, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if event exists and is on the correct date
    const eventQuery = `
      SELECT e.*, r.id as registration_id
      FROM events e
      LEFT JOIN registrations r ON e.id = r.event_id AND r.user_id = $1 AND r.status = 'registered'
      WHERE e.id = $2 AND e.college_id = $3 AND e.status = 'published'
    `;

    const eventResult = await pool.query(eventQuery, [req.user.id, id, req.user.college_id]);

    if (eventResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Event not found or not available for check-in'
      });
    }

    const event = eventResult.rows[0];

    // Check if user is registered for the event
    if (!event.registration_id) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'You must be registered for this event to check in'
      });
    }

    // Check if event is on the correct date
    const today = new Date().toISOString().split('T')[0];
    if (event.event_date.toISOString().split('T')[0] !== today) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Check-in is only available on the event date'
      });
    }

    // Check if already checked in
    const existingAttendance = await pool.query(
      'SELECT id FROM attendance WHERE event_id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (existingAttendance.rows.length > 0) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'Already checked in for this event'
      });
    }

    // Record attendance
    const attendanceQuery = `
      INSERT INTO attendance (event_id, user_id, check_in_time, status)
      VALUES ($1, $2, CURRENT_TIMESTAMP, 'present')
      RETURNING *
    `;

    const result = await pool.query(attendanceQuery, [id, req.user.id]);

    res.status(201).json({
      message: 'Successfully checked in for event',
      attendance: result.rows[0]
    });

  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to check in for event'
    });
  }
});

// Check out from an event
router.post('/events/:id/checkout', authenticateToken, requireAnyRole, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if attendance record exists
    const attendanceQuery = `
      SELECT a.*, e.title
      FROM attendance a
      JOIN events e ON a.event_id = e.id
      WHERE a.event_id = $1 AND a.user_id = $2 AND a.check_out_time IS NULL
    `;

    const attendanceResult = await pool.query(attendanceQuery, [id, req.user.id]);

    if (attendanceResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'No active attendance record found for this event'
      });
    }

    // Update checkout time
    const checkoutQuery = `
      UPDATE attendance 
      SET check_out_time = CURRENT_TIMESTAMP
      WHERE event_id = $1 AND user_id = $2
      RETURNING *
    `;

    const result = await pool.query(checkoutQuery, [id, req.user.id]);

    res.json({
      message: 'Successfully checked out from event',
      attendance: result.rows[0]
    });

  } catch (error) {
    console.error('Check-out error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to check out from event'
    });
  }
});

// Get attendance list for an event (Admin only)
router.get('/events/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const offset = (page - 1) * limit;

    // Check if user has permission to view attendance
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only admins can view attendance lists'
      });
    }

    const query = `
      SELECT 
        a.*,
        u.first_name,
        u.last_name,
        u.email,
        u.student_id
      FROM attendance a
      JOIN users u ON a.user_id = u.id
      WHERE a.event_id = $1
      ORDER BY a.check_in_time DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await pool.query(query, [id, limit, offset]);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM attendance a
      WHERE a.event_id = $1
    `;
    const countResult = await pool.query(countQuery, [id]);
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
    console.error('Get attendance list error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch attendance list'
    });
  }
});

// Get attendance summary for an event
router.get('/events/:id/summary', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user has permission
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only admins can view attendance summaries'
      });
    }

    const query = `
      SELECT 
        e.title,
        e.event_date,
        e.capacity,
        COUNT(r.id) as total_registrations,
        COUNT(a.id) as total_attendance,
        ROUND(
          CASE 
            WHEN COUNT(r.id) > 0 THEN (COUNT(a.id)::float / COUNT(r.id)) * 100 
            ELSE 0 
          END, 2
        ) as attendance_percentage
      FROM events e
      LEFT JOIN registrations r ON e.id = r.event_id AND r.status = 'registered'
      LEFT JOIN attendance a ON e.id = a.event_id
      WHERE e.id = $1 AND e.college_id = $2
      GROUP BY e.id, e.title, e.event_date, e.capacity
    `;

    const result = await pool.query(query, [id, req.user.college_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Event not found'
      });
    }

    res.json({
      summary: result.rows[0]
    });

  } catch (error) {
    console.error('Get attendance summary error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch attendance summary'
    });
  }
});

module.exports = router;
