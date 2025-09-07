# 🧪 Manual Testing Guide - Campus Event Management Platform

## Prerequisites
1. **Start the Backend Server**:
   ```bash
   cd backend
   node server.js
   ```
   You should see: `🚀 Server running on port 3000`

2. **Verify Server is Running**:
   Open browser and go to: http://localhost:3000/health
   Should show: `{"status":"OK","timestamp":"...","uptime":...}`

## 🔐 Testing Authentication

### 1. Test Admin Login
**URL**: `POST http://localhost:3000/api/auth/login`
**Body**:
```json
{
  "email": "admin@techuniv.edu",
  "password": "admin123"
}
```
**Expected**: Returns JWT token and admin user details

### 2. Test Student Login
**URL**: `POST http://localhost:3000/api/auth/login`
**Body**:
```json
{
  "email": "student1@techuniv.edu",
  "password": "student123"
}
```
**Expected**: Returns JWT token and student user details

### 3. Test Profile Endpoints
**URL**: `GET http://localhost:3000/api/auth/profile`
**Headers**: `Authorization: Bearer <your-token>`
**Expected**: Returns user profile information

## 📅 Testing Event Management

### 1. Get All Events (Admin)
**URL**: `GET http://localhost:3000/api/events`
**Headers**: `Authorization: Bearer <admin-token>`
**Expected**: Returns list of events with pagination

### 2. Get Events (Student)
**URL**: `GET http://localhost:3000/api/student/events`
**Headers**: `Authorization: Bearer <student-token>`
**Expected**: Returns available events for students

### 3. Create New Event (Admin)
**URL**: `POST http://localhost:3000/api/events`
**Headers**: `Authorization: Bearer <admin-token>`
**Body**:
```json
{
  "title": "Test Event",
  "description": "Testing event creation",
  "eventDate": "2024-12-15",
  "startTime": "10:00",
  "endTime": "12:00",
  "location": "Test Lab",
  "capacity": 25,
  "categoryId": 1
}
```
**Expected**: Returns created event details

### 4. Get Single Event
**URL**: `GET http://localhost:3000/api/events/1`
**Headers**: `Authorization: Bearer <admin-token>`
**Expected**: Returns specific event details

## 👨‍🎓 Testing Student Operations

### 1. Register for Event
**URL**: `POST http://localhost:3000/api/student/events/1/register`
**Headers**: `Authorization: Bearer <student-token>`
**Body**: `{}`
**Expected**: Returns registration confirmation

### 2. Get Student Registrations
**URL**: `GET http://localhost:3000/api/student/registrations`
**Headers**: `Authorization: Bearer <student-token>`
**Expected**: Returns student's registered events

### 3. Cancel Registration
**URL**: `DELETE http://localhost:3000/api/student/events/1/register`
**Headers**: `Authorization: Bearer <student-token>`
**Expected**: Returns cancellation confirmation

## ✅ Testing Attendance System

### 1. Check-in for Event
**URL**: `POST http://localhost:3000/api/attendance/events/1/checkin`
**Headers**: `Authorization: Bearer <student-token>`
**Body**: `{}`
**Expected**: Returns attendance record

### 2. Check-out from Event
**URL**: `POST http://localhost:3000/api/attendance/events/1/checkout`
**Headers**: `Authorization: Bearer <student-token>`
**Body**: `{}`
**Expected**: Returns updated attendance record

### 3. Get Attendance List (Admin)
**URL**: `GET http://localhost:3000/api/attendance/events/1`
**Headers**: `Authorization: Bearer <admin-token>`
**Expected**: Returns list of attendees

### 4. Get Attendance Summary
**URL**: `GET http://localhost:3000/api/attendance/events/1/summary`
**Headers**: `Authorization: Bearer <admin-token>`
**Expected**: Returns attendance statistics

## ⭐ Testing Feedback System

### 1. Submit Feedback
**URL**: `POST http://localhost:3000/api/feedback/events/1`
**Headers**: `Authorization: Bearer <student-token>`
**Body**:
```json
{
  "rating": 5,
  "comment": "Excellent event! Very informative."
}
```
**Expected**: Returns feedback confirmation

### 2. Get Event Feedback
**URL**: `GET http://localhost:3000/api/feedback/events/1`
**Headers**: `Authorization: Bearer <admin-token>`
**Expected**: Returns feedback list and summary

### 3. Get Feedback Summary
**URL**: `GET http://localhost:3000/api/feedback/events/1/summary`
**Headers**: `Authorization: Bearer <admin-token>`
**Expected**: Returns feedback statistics

## 📊 Testing Reporting System

### 1. Event Popularity Report
**URL**: `GET http://localhost:3000/api/reports/event-popularity`
**Headers**: `Authorization: Bearer <admin-token>`
**Expected**: Returns events sorted by registration count

### 2. Student Participation Report
**URL**: `GET http://localhost:3000/api/reports/student-participation`
**Headers**: `Authorization: Bearer <admin-token>`
**Expected**: Returns students with attendance counts

### 3. Top Active Students
**URL**: `GET http://localhost:3000/api/reports/top-active-students`
**Headers**: `Authorization: Bearer <admin-token>`
**Expected**: Returns top 3 most active students

### 4. Attendance Summary
**URL**: `GET http://localhost:3000/api/reports/attendance-summary`
**Headers**: `Authorization: Bearer <admin-token>`
**Expected**: Returns overall attendance statistics

### 5. Feedback Summary
**URL**: `GET http://localhost:3000/api/reports/feedback-summary`
**Headers**: `Authorization: Bearer <admin-token>`
**Expected**: Returns feedback statistics

### 6. Flexible Reports
**URL**: `GET http://localhost:3000/api/reports/flexible?eventType=Workshop`
**Headers**: `Authorization: Bearer <admin-token>`
**Expected**: Returns filtered events

## 🎨 Testing UI Interfaces

### 1. Admin Portal
1. Open `frontend/admin-portal.html` in browser
2. Test navigation between tabs
3. Try creating a new event
4. View event management features
5. Check reports section
6. Test settings

### 2. Student App
1. Open `mobile/student-app.html` in browser
2. Test event browsing
3. Try registering for events
4. Check "My Events" section
5. Test attendance tracking
6. Try submitting feedback

## 🚨 Testing Error Handling

### 1. Invalid Login
**URL**: `POST http://localhost:3000/api/auth/login`
**Body**:
```json
{
  "email": "invalid@test.com",
  "password": "wrongpassword"
}
```
**Expected**: Returns 401 Unauthorized

### 2. Unauthorized Access
**URL**: `GET http://localhost:3000/api/events`
**Headers**: `Authorization: Bearer invalid-token`
**Expected**: Returns 401 Unauthorized

### 3. Invalid Event Registration
**URL**: `POST http://localhost:3000/api/student/events/999/register`
**Headers**: `Authorization: Bearer <student-token>`
**Expected**: Returns 404 Not Found

## 📱 Testing Tools

### Option 1: Browser Testing
1. Open browser developer tools (F12)
2. Go to Console tab
3. Use fetch() to make API calls:
```javascript
// Test health check
fetch('http://localhost:3000/health')
  .then(response => response.json())
  .then(data => console.log(data));

// Test login
fetch('http://localhost:3000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'admin@techuniv.edu',
    password: 'admin123'
  })
})
.then(response => response.json())
.then(data => console.log(data));
```

### Option 2: Postman/Insomnia
1. Import the API endpoints
2. Set up authentication headers
3. Test all endpoints systematically

### Option 3: curl Commands
```bash
# Health check
curl http://localhost:3000/health

# Admin login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@techuniv.edu","password":"admin123"}'

# Get events (replace TOKEN with actual token)
curl -X GET http://localhost:3000/api/events \
  -H "Authorization: Bearer TOKEN"
```

## ✅ Expected Test Results

### All Tests Should Pass:
- ✅ Health check returns server status
- ✅ Authentication works for both admin and student
- ✅ Event CRUD operations work
- ✅ Student registration system works
- ✅ Attendance tracking works
- ✅ Feedback system works
- ✅ All reports generate successfully
- ✅ Error handling works properly
- ✅ UI interfaces are functional

## 🎯 Test Completion Checklist

- [ ] Backend server running on port 3000
- [ ] Health check endpoint working
- [ ] Admin authentication working
- [ ] Student authentication working
- [ ] Event management working
- [ ] Student operations working
- [ ] Attendance system working
- [ ] Feedback system working
- [ ] All reports generating
- [ ] Admin portal UI working
- [ ] Student app UI working
- [ ] Error handling working

## 🚀 Success Criteria

The Campus Event Management Platform is fully functional when:
1. All API endpoints respond correctly
2. Authentication and authorization work
3. All CRUD operations work
4. Reports generate with real data
5. UI interfaces are responsive and functional
6. Error handling is proper
7. Database operations are successful

**Total Features to Test: 25+ API endpoints + 2 UI interfaces**

---

**Note**: This testing guide covers all the features implemented in the Campus Event Management Platform. Each test should be performed to ensure the system is working correctly before submission.
