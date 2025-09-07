# Campus Event Management Platform - Design Document

## 1. System Overview

### Purpose
A comprehensive event management platform for colleges with separate admin portal (web) and student app (mobile) interfaces, featuring robust event reporting capabilities.

### Scale Assumptions
- **50 colleges** using the system
- **500 students** per college
- **20 events** per semester per college
- **Total scale**: ~25,000 students, ~1,000 events per semester

## 2. Data to Track

### Core Data Entities
1. **Colleges**: Institution information
2. **Users**: Students and admins with role-based access
3. **Events**: Event details, capacity, timing
4. **Registrations**: Student event registrations
5. **Attendance**: Check-in records for events
6. **Feedback**: Student ratings and comments
7. **Event Categories**: Workshop, Fest, Seminar, Hackathon, etc.

### Data Relationships
- One-to-Many: College → Users, College → Events
- Many-to-Many: Students ↔ Events (via Registrations)
- One-to-Many: Event → Registrations, Event → Attendance, Event → Feedback

## 3. Database Schema

### Entity-Relationship Diagram
```
[College] 1----* [User]
    |              |
    |              |
    1              |
    |              |
[Event] 1----* [Registration] *----1 [User]
    |              |
    |              |
    1              |
    |              |
[Attendance] *----1 [User]
    |
    1
    |
[Feedback] *----1 [User]
```

### Table Definitions

#### colleges
```sql
CREATE TABLE colleges (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(100) UNIQUE NOT NULL,
    address TEXT,
    contact_email VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### users
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    college_id INTEGER REFERENCES colleges(id),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    student_id VARCHAR(50),
    role ENUM('admin', 'student') NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### event_categories
```sql
CREATE TABLE event_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT
);
```

#### events
```sql
CREATE TABLE events (
    id SERIAL PRIMARY KEY,
    college_id INTEGER REFERENCES colleges(id),
    category_id INTEGER REFERENCES event_categories(id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    event_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    location VARCHAR(255),
    capacity INTEGER,
    registration_deadline TIMESTAMP,
    status ENUM('draft', 'published', 'cancelled', 'completed') DEFAULT 'draft',
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### registrations
```sql
CREATE TABLE registrations (
    id SERIAL PRIMARY KEY,
    event_id INTEGER REFERENCES events(id),
    user_id INTEGER REFERENCES users(id),
    registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('registered', 'cancelled') DEFAULT 'registered',
    UNIQUE(event_id, user_id)
);
```

#### attendance
```sql
CREATE TABLE attendance (
    id SERIAL PRIMARY KEY,
    event_id INTEGER REFERENCES events(id),
    user_id INTEGER REFERENCES users(id),
    check_in_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    check_out_time TIMESTAMP,
    status ENUM('present', 'absent') DEFAULT 'present',
    UNIQUE(event_id, user_id)
);
```

#### feedback
```sql
CREATE TABLE feedback (
    id SERIAL PRIMARY KEY,
    event_id INTEGER REFERENCES events(id),
    user_id INTEGER REFERENCES users(id),
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id, user_id)
);
```

### Indexing Strategy
```sql
-- Performance indexes
CREATE INDEX idx_events_college_date ON events(college_id, event_date);
CREATE INDEX idx_registrations_event ON registrations(event_id);
CREATE INDEX idx_registrations_user ON registrations(user_id);
CREATE INDEX idx_attendance_event ON attendance(event_id);
CREATE INDEX idx_feedback_event ON feedback(event_id);
```

## 4. API Design

### Authentication Endpoints
```
POST /api/auth/login
POST /api/auth/register
POST /api/auth/refresh
POST /api/auth/logout
```

### Event Management (Admin)
```
GET    /api/events                    # List events for college
POST   /api/events                    # Create new event
GET    /api/events/:id                # Get event details
PUT    /api/events/:id                # Update event
DELETE /api/events/:id                # Cancel event
GET    /api/events/:id/registrations  # Get event registrations
```

### Student Operations
```
GET    /api/student/events            # Browse available events
POST   /api/student/events/:id/register    # Register for event
DELETE /api/student/events/:id/register    # Cancel registration
GET    /api/student/registrations           # My registrations
```

### Attendance Management
```
POST   /api/events/:id/checkin       # Mark attendance
POST   /api/events/:id/checkout      # Mark checkout
GET    /api/events/:id/attendance    # Get attendance list
```

### Feedback System
```
POST   /api/events/:id/feedback      # Submit feedback
GET    /api/events/:id/feedback      # Get event feedback
```

### Reporting Endpoints
```
GET    /api/reports/event-popularity     # Event popularity report
GET    /api/reports/student-participation # Student participation report
GET    /api/reports/attendance-summary   # Attendance summary
GET    /api/reports/feedback-summary     # Feedback summary
GET    /api/reports/top-active-students  # Top 3 active students
```

## 5. Workflows

### Event Registration Workflow
```
1. Student browses events → GET /api/student/events
2. Student selects event → GET /api/student/events/:id
3. Student registers → POST /api/student/events/:id/register
4. System validates capacity and deadline
5. Registration confirmed → 201 Created
```

### Attendance Workflow
```
1. Event day arrives
2. Student checks in → POST /api/events/:id/checkin
3. System records attendance
4. Event ends
5. Student checks out → POST /api/events/:id/checkout (optional)
```

### Feedback Workflow
```
1. Event completed
2. Student submits feedback → POST /api/events/:id/feedback
3. System validates rating (1-5)
4. Feedback stored
5. Reports updated
```

## 6. Assumptions & Edge Cases

### Assumptions
- Students can only register for events at their own college
- Event capacity is enforced at registration time
- Attendance can only be marked on event day
- Feedback is optional but encouraged
- Each college operates independently

### Edge Cases Handled
1. **Duplicate Registrations**: UNIQUE constraint on (event_id, user_id)
2. **Capacity Overflow**: Check capacity before registration
3. **Registration Deadline**: Validate against registration_deadline
4. **Event Cancellation**: Update status and notify registered students
5. **Missing Feedback**: Optional field, not required for reports
6. **Concurrent Registrations**: Database constraints prevent race conditions
7. **Invalid Ratings**: CHECK constraint ensures 1-5 range

### Error Handling
- 400 Bad Request: Invalid input data
- 401 Unauthorized: Invalid/missing authentication
- 403 Forbidden: Insufficient permissions
- 404 Not Found: Resource doesn't exist
- 409 Conflict: Duplicate registration, capacity exceeded
- 422 Unprocessable Entity: Validation errors
- 500 Internal Server Error: Server-side errors

## 7. Security Considerations

### Authentication & Authorization
- JWT-based authentication
- Role-based access control (admin/student)
- Password hashing with bcrypt
- Token expiration and refresh

### Data Protection
- College data isolation
- Input validation and sanitization
- SQL injection prevention
- Rate limiting on API endpoints

## 8. Performance Considerations

### Database Optimization
- Proper indexing strategy
- Query optimization
- Connection pooling
- Read replicas for reporting

### Caching Strategy
- Event list caching
- Report result caching
- Session management

## 9. Scalability Design

### Multi-tenancy
- College-based data partitioning
- Event ID uniqueness within college scope
- Separate admin access per college

### Future Enhancements
- Microservices architecture
- Event-driven notifications
- Real-time updates
- Mobile push notifications

## 10. Technical Implementation Details

### Database Configuration
```javascript
// SQLite Configuration (for prototype)
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./campus_events.db');

// PostgreSQL Configuration (for production)
const { Pool } = require('pg');
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});
```

### Authentication Flow
```javascript
// JWT Token Generation
const token = jwt.sign(
  { 
    userId: user.id, 
    collegeId: user.college_id, 
    role: user.role 
  },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES_IN }
);

// Middleware Authentication
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.sendStatus(401);
  
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};
```

### API Rate Limiting
```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

app.use('/api/', limiter);
```

### Database Indexing Strategy
```sql
-- Performance indexes for optimal query performance
CREATE INDEX idx_events_college_date ON events(college_id, event_date);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_registrations_event ON registrations(event_id);
CREATE INDEX idx_registrations_user ON registrations(user_id);
CREATE INDEX idx_attendance_event ON attendance(event_id);
CREATE INDEX idx_attendance_user ON attendance(user_id);
CREATE INDEX idx_feedback_event ON feedback(event_id);
CREATE INDEX idx_feedback_user ON feedback(user_id);
CREATE INDEX idx_users_college_role ON users(college_id, role);
```

### Error Handling Strategy
```javascript
// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      message: err.message
    });
  }
  
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or missing authentication token'
    });
  }
  
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' 
      ? 'Something went wrong' 
      : err.message
  });
});
```

### Input Validation with Joi
```javascript
const Joi = require('joi');

const eventSchema = Joi.object({
  title: Joi.string().min(3).max(255).required(),
  description: Joi.string().max(1000),
  eventDate: Joi.date().iso().required(),
  startTime: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
  endTime: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
  location: Joi.string().max(255),
  capacity: Joi.number().integer().min(1).max(1000),
  categoryId: Joi.number().integer().positive()
});
```

## 11. Deployment Architecture

### Development Environment
- **Database**: SQLite (file-based, no setup required)
- **Server**: Node.js with Express
- **Frontend**: Static HTML files
- **Port**: 3000

### Production Environment
- **Database**: PostgreSQL with connection pooling
- **Server**: Node.js with PM2 process manager
- **Frontend**: Nginx static file serving
- **Load Balancer**: Nginx reverse proxy
- **Monitoring**: PM2 monitoring + custom health checks

### Docker Configuration
```dockerfile
# Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### Environment Variables
```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=campus_events
DB_USER=postgres
DB_PASSWORD=your_password

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=24h

# Server Configuration
PORT=3000
NODE_ENV=production

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## 12. Testing Strategy

### Unit Testing
- Individual function testing
- Database query testing
- Validation testing

### Integration Testing
- API endpoint testing
- Authentication flow testing
- Database integration testing

### End-to-End Testing
- Complete user workflows
- Cross-browser compatibility
- Mobile responsiveness

### Test Coverage
- API endpoints: 100%
- Authentication: 100%
- Database operations: 100%
- Error handling: 100%

## 13. Security Implementation

### Authentication Security
- JWT tokens with expiration
- Password hashing with bcrypt
- Role-based access control
- Token refresh mechanism

### API Security
- Input validation and sanitization
- SQL injection prevention
- CORS configuration
- Rate limiting
- Helmet.js security headers

### Data Security
- College-based data isolation
- Encrypted password storage
- Secure token generation
- Input sanitization

## 14. Performance Optimization

### Database Optimization
- Proper indexing strategy
- Query optimization
- Connection pooling
- Prepared statements

### API Optimization
- Response compression
- Caching headers
- Pagination for large datasets
- Efficient data serialization

### Frontend Optimization
- Minified CSS and JavaScript
- Optimized images
- Lazy loading
- Responsive design

## 15. Monitoring and Logging

### Application Monitoring
- Health check endpoints
- Error tracking
- Performance metrics
- User activity logging

### Database Monitoring
- Query performance tracking
- Connection pool monitoring
- Database size monitoring
- Backup verification

### Logging Strategy
- Structured logging with Winston
- Error logging with stack traces
- Access logging with Morgan
- Security event logging