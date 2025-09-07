const express = require('express');
const Joi = require('joi');
const pool = require('../config/database-sqlite');
const { authenticateToken, requireStudent } = require('../middleware/auth');

const router = express.Router();

// Validation schema
const feedbackSchema = Joi.object({
  rating: Joi.number().integer().min(1).max(5).required(),
  comment: Joi.string().max(500).optional()
});

// Submit feedback for an event
router.post('/events/:id', authenticateToken, requireStudent, async (req, res) => {
  try {
    const { id } = req.params;
    const { error, value } = feedbackSchema.validate(req.body);
    
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.details[0].message
      });
    }

    const { rating, comment } = value;

    // Check if event exists and user attended it
    const eventQuery = `
      SELECT e.*, a.id as attendance_id
      FROM events e
      LEFT JOIN attendance a ON e.id = a.event_id AND a.user_id = $1
      WHERE e.id = $2 AND e.college_id = $3 AND e.status = 'completed'
    `;

    const eventResult = await pool.query(eventQuery, [req.user.id, id, req.user.college_id]);

    if (eventResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Event not found or not completed'
      });
    }

    const event = eventResult.rows[0];

    // Check if user attended the event
    if (!event.attendance_id) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'You must have attended this event to submit feedback'
      });
    }

    // Check if feedback already exists
    const existingFeedback = await pool.query(
      'SELECT id FROM feedback WHERE event_id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (existingFeedback.rows.length > 0) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'Feedback already submitted for this event'
      });
    }

    // Submit feedback
    const feedbackQuery = `
      INSERT INTO feedback (event_id, user_id, rating, comment)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    const result = await pool.query(feedbackQuery, [id, req.user.id, rating, comment]);

    res.status(201).json({
      message: 'Feedback submitted successfully',
      feedback: result.rows[0]
    });

  } catch (error) {
    console.error('Submit feedback error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to submit feedback'
    });
  }
});

// Get feedback for an event
router.get('/events/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const offset = (page - 1) * limit;

    // Check if event exists and belongs to college
    const eventQuery = `
      SELECT id, title FROM events 
      WHERE id = $1 AND college_id = $2
    `;

    const eventResult = await pool.query(eventQuery, [id, req.user.college_id]);

    if (eventResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Event not found'
      });
    }

    // Get feedback
    const feedbackQuery = `
      SELECT 
        f.*,
        u.first_name,
        u.last_name,
        u.student_id
      FROM feedback f
      JOIN users u ON f.user_id = u.id
      WHERE f.event_id = $1
      ORDER BY f.submitted_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await pool.query(feedbackQuery, [id, limit, offset]);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM feedback f
      WHERE f.event_id = $1
    `;
    const countResult = await pool.query(countQuery, [id]);
    const total = parseInt(countResult.rows[0].total);

    // Get average rating
    const avgRatingQuery = `
      SELECT 
        ROUND(AVG(rating), 2) as average_rating,
        COUNT(*) as total_feedback
      FROM feedback f
      WHERE f.event_id = $1
    `;
    const avgResult = await pool.query(avgRatingQuery, [id]);

    res.json({
      event: eventResult.rows[0],
      feedback: result.rows,
      summary: avgResult.rows[0],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get feedback error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch feedback'
    });
  }
});

// Get feedback summary for an event
router.get('/events/:id/summary', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user has permission (admin or student who attended)
    if (req.user.role !== 'admin') {
      // Check if student attended the event
      const attendanceCheck = await pool.query(
        'SELECT id FROM attendance WHERE event_id = $1 AND user_id = $2',
        [id, req.user.id]
      );

      if (attendanceCheck.rows.length === 0) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You must have attended this event to view feedback summary'
        });
      }
    }

    const query = `
      SELECT 
        e.title,
        e.event_date,
        COUNT(f.id) as total_feedback,
        ROUND(AVG(f.rating), 2) as average_rating,
        COUNT(CASE WHEN f.rating = 5 THEN 1 END) as five_star_count,
        COUNT(CASE WHEN f.rating = 4 THEN 1 END) as four_star_count,
        COUNT(CASE WHEN f.rating = 3 THEN 1 END) as three_star_count,
        COUNT(CASE WHEN f.rating = 2 THEN 1 END) as two_star_count,
        COUNT(CASE WHEN f.rating = 1 THEN 1 END) as one_star_count
      FROM events e
      LEFT JOIN feedback f ON e.id = f.event_id
      WHERE e.id = $1 AND e.college_id = $2
      GROUP BY e.id, e.title, e.event_date
    `;

    const result = await pool.query(query, [id, req.user.college_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Event not found'
      });
    }

    const summary = result.rows[0];

    // Calculate rating distribution percentages
    const total = parseInt(summary.total_feedback) || 0;
    const distribution = {
      five_star: total > 0 ? Math.round((summary.five_star_count / total) * 100) : 0,
      four_star: total > 0 ? Math.round((summary.four_star_count / total) * 100) : 0,
      three_star: total > 0 ? Math.round((summary.three_star_count / total) * 100) : 0,
      two_star: total > 0 ? Math.round((summary.two_star_count / total) * 100) : 0,
      one_star: total > 0 ? Math.round((summary.one_star_count / total) * 100) : 0
    };

    res.json({
      summary: {
        ...summary,
        rating_distribution: distribution
      }
    });

  } catch (error) {
    console.error('Get feedback summary error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch feedback summary'
    });
  }
});

// Update feedback (if user wants to modify their feedback)
router.put('/events/:id', authenticateToken, requireStudent, async (req, res) => {
  try {
    const { id } = req.params;
    const { error, value } = feedbackSchema.validate(req.body);
    
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.details[0].message
      });
    }

    const { rating, comment } = value;

    // Check if feedback exists and belongs to user
    const existingFeedback = await pool.query(
      'SELECT id FROM feedback WHERE event_id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (existingFeedback.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Feedback not found'
      });
    }

    // Update feedback
    const updateQuery = `
      UPDATE feedback 
      SET rating = $1, comment = $2, submitted_at = CURRENT_TIMESTAMP
      WHERE event_id = $3 AND user_id = $4
      RETURNING *
    `;

    const result = await pool.query(updateQuery, [rating, comment, id, req.user.id]);

    res.json({
      message: 'Feedback updated successfully',
      feedback: result.rows[0]
    });

  } catch (error) {
    console.error('Update feedback error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update feedback'
    });
  }
});

// Delete feedback
router.delete('/events/:id', authenticateToken, requireStudent, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if feedback exists and belongs to user
    const existingFeedback = await pool.query(
      'SELECT id FROM feedback WHERE event_id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (existingFeedback.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Feedback not found'
      });
    }

    // Delete feedback
    const deleteQuery = `
      DELETE FROM feedback 
      WHERE event_id = $1 AND user_id = $2
      RETURNING id
    `;

    const result = await pool.query(deleteQuery, [id, req.user.id]);

    res.json({
      message: 'Feedback deleted successfully'
    });

  } catch (error) {
    console.error('Delete feedback error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete feedback'
    });
  }
});

module.exports = router;
