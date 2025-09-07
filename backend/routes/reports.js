const express = require('express');
const pool = require('../config/database-sqlite');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Event Popularity Report - Sorted by number of registrations
router.get('/event-popularity', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      categoryId, 
      startDate, 
      endDate,
      sortOrder = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;
    let whereClause = 'WHERE e.college_id = $1';
    const queryParams = [req.user.college_id];
    let paramCount = 1;

    // Add filters
    if (categoryId) {
      paramCount++;
      whereClause += ` AND e.category_id = $${paramCount}`;
      queryParams.push(categoryId);
    }

    if (startDate) {
      paramCount++;
      whereClause += ` AND e.event_date >= $${paramCount}`;
      queryParams.push(startDate);
    }

    if (endDate) {
      paramCount++;
      whereClause += ` AND e.event_date <= $${paramCount}`;
      queryParams.push(endDate);
    }

    const validSortOrders = ['ASC', 'DESC'];
    const sortDirection = validSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';

    const query = `
      SELECT 
        e.id,
        e.title,
        e.event_date,
        e.start_time,
        e.end_time,
        e.location,
        e.capacity,
        e.status,
        ec.name as category_name,
        COUNT(r.id) as registration_count,
        COUNT(a.id) as attendance_count,
        ROUND(
          CASE 
            WHEN COUNT(r.id) > 0 THEN (COUNT(a.id)::float / COUNT(r.id)) * 100 
            ELSE 0 
          END, 2
        ) as attendance_percentage,
        ROUND(AVG(f.rating), 2) as average_rating,
        COUNT(f.id) as feedback_count
      FROM events e
      LEFT JOIN event_categories ec ON e.category_id = ec.id
      LEFT JOIN registrations r ON e.id = r.event_id AND r.status = 'registered'
      LEFT JOIN attendance a ON e.id = a.event_id
      LEFT JOIN feedback f ON e.id = f.event_id
      ${whereClause}
      GROUP BY e.id, ec.name
      ORDER BY registration_count ${sortDirection}
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    queryParams.push(parseInt(limit), offset);

    const result = await pool.query(query, queryParams);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM events e
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, queryParams.slice(0, -2));
    const total = parseInt(countResult.rows[0].total);

    res.json({
      report: 'Event Popularity Report',
      events: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Event popularity report error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to generate event popularity report'
    });
  }
});

// Student Participation Report - How many events a student attended
router.get('/student-participation', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      sortOrder = 'DESC',
      minEvents = 0
    } = req.query;

    const offset = (page - 1) * limit;

    const validSortOrders = ['ASC', 'DESC'];
    const sortDirection = validSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';

    const query = `
      SELECT 
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.student_id,
        COUNT(DISTINCT r.event_id) as total_registrations,
        COUNT(DISTINCT a.event_id) as total_attendance,
        COUNT(DISTINCT f.event_id) as total_feedback,
        ROUND(
          CASE 
            WHEN COUNT(DISTINCT r.event_id) > 0 THEN (COUNT(DISTINCT a.event_id)::float / COUNT(DISTINCT r.event_id)) * 100 
            ELSE 0 
          END, 2
        ) as attendance_percentage,
        ROUND(AVG(f.rating), 2) as average_feedback_rating
      FROM users u
      LEFT JOIN registrations r ON u.id = r.user_id AND r.status = 'registered'
      LEFT JOIN attendance a ON u.id = a.user_id
      LEFT JOIN feedback f ON u.id = f.user_id
      WHERE u.college_id = $1 AND u.role = 'student'
      GROUP BY u.id, u.first_name, u.last_name, u.email, u.student_id
      HAVING COUNT(DISTINCT a.event_id) >= $2
      ORDER BY total_attendance ${sortDirection}
      LIMIT $3 OFFSET $4
    `;

    const result = await pool.query(query, [req.user.college_id, parseInt(minEvents), limit, offset]);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM (
        SELECT u.id
        FROM users u
        LEFT JOIN attendance a ON u.id = a.user_id
        WHERE u.college_id = $1 AND u.role = 'student'
        GROUP BY u.id
        HAVING COUNT(DISTINCT a.event_id) >= $2
      ) as student_counts
    `;
    const countResult = await pool.query(countQuery, [req.user.college_id, parseInt(minEvents)]);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      report: 'Student Participation Report',
      students: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Student participation report error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to generate student participation report'
    });
  }
});

// Top 3 Most Active Students (Bonus feature)
router.get('/top-active-students', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { limit = 3 } = req.query;

    const query = `
      SELECT 
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.student_id,
        COUNT(DISTINCT r.event_id) as total_registrations,
        COUNT(DISTINCT a.event_id) as total_attendance,
        COUNT(DISTINCT f.event_id) as total_feedback,
        ROUND(
          CASE 
            WHEN COUNT(DISTINCT r.event_id) > 0 THEN (COUNT(DISTINCT a.event_id)::float / COUNT(DISTINCT r.event_id)) * 100 
            ELSE 0 
          END, 2
        ) as attendance_percentage,
        ROUND(AVG(f.rating), 2) as average_feedback_rating
      FROM users u
      LEFT JOIN registrations r ON u.id = r.user_id AND r.status = 'registered'
      LEFT JOIN attendance a ON u.id = a.user_id
      LEFT JOIN feedback f ON u.id = f.user_id
      WHERE u.college_id = $1 AND u.role = 'student'
      GROUP BY u.id, u.first_name, u.last_name, u.email, u.student_id
      ORDER BY total_attendance DESC, total_registrations DESC
      LIMIT $2
    `;

    const result = await pool.query(query, [req.user.college_id, parseInt(limit)]);

    res.json({
      report: 'Top Active Students',
      students: result.rows,
      limit: parseInt(limit)
    });

  } catch (error) {
    console.error('Top active students report error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to generate top active students report'
    });
  }
});

// Attendance Summary Report
router.get('/attendance-summary', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { 
      startDate, 
      endDate,
      categoryId
    } = req.query;

    let whereClause = 'WHERE e.college_id = $1';
    const queryParams = [req.user.college_id];
    let paramCount = 1;

    if (startDate) {
      paramCount++;
      whereClause += ` AND e.event_date >= $${paramCount}`;
      queryParams.push(startDate);
    }

    if (endDate) {
      paramCount++;
      whereClause += ` AND e.event_date <= $${paramCount}`;
      queryParams.push(endDate);
    }

    if (categoryId) {
      paramCount++;
      whereClause += ` AND e.category_id = $${paramCount}`;
      queryParams.push(categoryId);
    }

    const query = `
      SELECT 
        COUNT(DISTINCT e.id) as total_events,
        COUNT(DISTINCT r.user_id) as total_registrations,
        COUNT(DISTINCT a.user_id) as total_attendance,
        ROUND(
          CASE 
            WHEN COUNT(DISTINCT r.user_id) > 0 THEN (COUNT(DISTINCT a.user_id)::float / COUNT(DISTINCT r.user_id)) * 100 
            ELSE 0 
          END, 2
        ) as overall_attendance_percentage,
        ROUND(AVG(f.rating), 2) as average_feedback_rating,
        COUNT(f.id) as total_feedback
      FROM events e
      LEFT JOIN registrations r ON e.id = r.event_id AND r.status = 'registered'
      LEFT JOIN attendance a ON e.id = a.event_id
      LEFT JOIN feedback f ON e.id = f.event_id
      ${whereClause}
    `;

    const result = await pool.query(query, queryParams);

    res.json({
      report: 'Attendance Summary Report',
      summary: result.rows[0]
    });

  } catch (error) {
    console.error('Attendance summary report error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to generate attendance summary report'
    });
  }
});

// Feedback Summary Report
router.get('/feedback-summary', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { 
      startDate, 
      endDate,
      categoryId
    } = req.query;

    let whereClause = 'WHERE e.college_id = $1';
    const queryParams = [req.user.college_id];
    let paramCount = 1;

    if (startDate) {
      paramCount++;
      whereClause += ` AND e.event_date >= $${paramCount}`;
      queryParams.push(startDate);
    }

    if (endDate) {
      paramCount++;
      whereClause += ` AND e.event_date <= $${paramCount}`;
      queryParams.push(endDate);
    }

    if (categoryId) {
      paramCount++;
      whereClause += ` AND e.category_id = $${paramCount}`;
      queryParams.push(categoryId);
    }

    const query = `
      SELECT 
        COUNT(DISTINCT f.event_id) as events_with_feedback,
        COUNT(f.id) as total_feedback,
        ROUND(AVG(f.rating), 2) as average_rating,
        COUNT(CASE WHEN f.rating = 5 THEN 1 END) as five_star_count,
        COUNT(CASE WHEN f.rating = 4 THEN 1 END) as four_star_count,
        COUNT(CASE WHEN f.rating = 3 THEN 1 END) as three_star_count,
        COUNT(CASE WHEN f.rating = 2 THEN 1 END) as two_star_count,
        COUNT(CASE WHEN f.rating = 1 THEN 1 END) as one_star_count
      FROM events e
      LEFT JOIN feedback f ON e.id = f.event_id
      ${whereClause}
    `;

    const result = await pool.query(query, queryParams);

    const summary = result.rows[0];
    const total = parseInt(summary.total_feedback) || 0;

    // Calculate rating distribution percentages
    const distribution = {
      five_star: total > 0 ? Math.round((summary.five_star_count / total) * 100) : 0,
      four_star: total > 0 ? Math.round((summary.four_star_count / total) * 100) : 0,
      three_star: total > 0 ? Math.round((summary.three_star_count / total) * 100) : 0,
      two_star: total > 0 ? Math.round((summary.two_star_count / total) * 100) : 0,
      one_star: total > 0 ? Math.round((summary.one_star_count / total) * 100) : 0
    };

    res.json({
      report: 'Feedback Summary Report',
      summary: {
        ...summary,
        rating_distribution: distribution
      }
    });

  } catch (error) {
    console.error('Feedback summary report error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to generate feedback summary report'
    });
  }
});

// Flexible Reports - Filter by event type (Bonus feature)
router.get('/flexible', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { 
      eventType,
      startDate,
      endDate,
      minRegistrations = 0,
      minAttendance = 0,
      minRating = 0,
      sortBy = 'registration_count',
      sortOrder = 'DESC'
    } = req.query;

    let whereClause = 'WHERE e.college_id = $1';
    const queryParams = [req.user.college_id];
    let paramCount = 1;

    // Add filters
    if (eventType) {
      paramCount++;
      whereClause += ` AND ec.name ILIKE $${paramCount}`;
      queryParams.push(`%${eventType}%`);
    }

    if (startDate) {
      paramCount++;
      whereClause += ` AND e.event_date >= $${paramCount}`;
      queryParams.push(startDate);
    }

    if (endDate) {
      paramCount++;
      whereClause += ` AND e.event_date <= $${paramCount}`;
      queryParams.push(endDate);
    }

    // Validate sort parameters
    const validSortColumns = ['registration_count', 'attendance_count', 'average_rating', 'event_date'];
    const validSortOrders = ['ASC', 'DESC'];
    
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'registration_count';
    const sortDirection = validSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';

    const query = `
      SELECT 
        e.id,
        e.title,
        e.event_date,
        e.start_time,
        e.end_time,
        e.location,
        e.capacity,
        e.status,
        ec.name as category_name,
        COUNT(r.id) as registration_count,
        COUNT(a.id) as attendance_count,
        ROUND(
          CASE 
            WHEN COUNT(r.id) > 0 THEN (COUNT(a.id)::float / COUNT(r.id)) * 100 
            ELSE 0 
          END, 2
        ) as attendance_percentage,
        ROUND(AVG(f.rating), 2) as average_rating,
        COUNT(f.id) as feedback_count
      FROM events e
      LEFT JOIN event_categories ec ON e.category_id = ec.id
      LEFT JOIN registrations r ON e.id = r.event_id AND r.status = 'registered'
      LEFT JOIN attendance a ON e.id = a.event_id
      LEFT JOIN feedback f ON e.id = f.event_id
      ${whereClause}
      GROUP BY e.id, ec.name
      HAVING 
        COUNT(r.id) >= $${paramCount + 1} AND 
        COUNT(a.id) >= $${paramCount + 2} AND
        (AVG(f.rating) IS NULL OR AVG(f.rating) >= $${paramCount + 3})
      ORDER BY ${sortColumn} ${sortDirection}
    `;

    queryParams.push(parseInt(minRegistrations), parseInt(minAttendance), parseFloat(minRating));

    const result = await pool.query(query, queryParams);

    res.json({
      report: 'Flexible Event Report',
      filters: {
        eventType,
        startDate,
        endDate,
        minRegistrations,
        minAttendance,
        minRating,
        sortBy,
        sortOrder
      },
      events: result.rows,
      total: result.rows.length
    });

  } catch (error) {
    console.error('Flexible report error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to generate flexible report'
    });
  }
});

// Get available event categories for filtering
router.get('/categories', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const query = `
      SELECT DISTINCT ec.id, ec.name, COUNT(e.id) as event_count
      FROM event_categories ec
      LEFT JOIN events e ON ec.id = e.category_id AND e.college_id = $1
      GROUP BY ec.id, ec.name
      ORDER BY ec.name
    `;

    const result = await pool.query(query, [req.user.college_id]);

    res.json({
      categories: result.rows
    });

  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch categories'
    });
  }
});

module.exports = router;
