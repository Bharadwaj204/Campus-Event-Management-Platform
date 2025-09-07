const pool = require('../config/database');
const bcrypt = require('bcryptjs');

async function seedDatabase() {
  try {
    console.log('🌱 Starting database seeding...');

    // Seed event categories
    const categories = [
      { name: 'Workshop', description: 'Hands-on learning sessions' },
      { name: 'Fest', description: 'Cultural and technical festivals' },
      { name: 'Seminar', description: 'Educational presentations and discussions' },
      { name: 'Hackathon', description: 'Coding competitions and challenges' },
      { name: 'Tech Talk', description: 'Technology presentations and discussions' },
      { name: 'Conference', description: 'Professional conferences and meetings' },
      { name: 'Sports', description: 'Sports events and competitions' },
      { name: 'Cultural', description: 'Cultural events and performances' }
    ];

    console.log('📚 Seeding event categories...');
    for (const category of categories) {
      await pool.query(
        'INSERT INTO event_categories (name, description) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [category.name, category.description]
      );
    }

    // Seed colleges
    console.log('🏫 Seeding colleges...');
    const colleges = [
      { name: 'Tech University', domain: 'techuniv.edu', address: '123 Tech Street, Tech City', contact_email: 'admin@techuniv.edu' },
      { name: 'Innovation College', domain: 'innovationcollege.edu', address: '456 Innovation Ave, Innovation City', contact_email: 'admin@innovationcollege.edu' },
      { name: 'Digital Institute', domain: 'digitalinstitute.edu', address: '789 Digital Blvd, Digital City', contact_email: 'admin@digitalinstitute.edu' }
    ];

    const collegeIds = [];
    for (const college of colleges) {
      const result = await pool.query(
        'INSERT INTO colleges (name, domain, address, contact_email) VALUES ($1, $2, $3, $4) ON CONFLICT (domain) DO NOTHING RETURNING id',
        [college.name, college.domain, college.address, college.contact_email]
      );
      if (result.rows.length > 0) {
        collegeIds.push(result.rows[0].id);
      }
    }

    // Get college IDs if they already exist
    if (collegeIds.length === 0) {
      const existingColleges = await pool.query('SELECT id FROM colleges ORDER BY id LIMIT 3');
      collegeIds.push(...existingColleges.rows.map(row => row.id));
    }

    // Seed admin users
    console.log('👨‍💼 Seeding admin users...');
    const adminPassword = await bcrypt.hash('admin123', 12);
    const adminUsers = [
      { college_id: collegeIds[0], email: 'admin@techuniv.edu', first_name: 'John', last_name: 'Admin', role: 'admin' },
      { college_id: collegeIds[1], email: 'admin@innovationcollege.edu', first_name: 'Jane', last_name: 'Admin', role: 'admin' },
      { college_id: collegeIds[2], email: 'admin@digitalinstitute.edu', first_name: 'Bob', last_name: 'Admin', role: 'admin' }
    ];

    const adminIds = [];
    for (const admin of adminUsers) {
      const result = await pool.query(
        'INSERT INTO users (college_id, email, password_hash, first_name, last_name, role) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (email) DO NOTHING RETURNING id',
        [admin.college_id, admin.email, adminPassword, admin.first_name, admin.last_name, admin.role]
      );
      if (result.rows.length > 0) {
        adminIds.push(result.rows[0].id);
      }
    }

    // Get admin IDs if they already exist
    if (adminIds.length === 0) {
      const existingAdmins = await pool.query('SELECT id FROM users WHERE role = $1 ORDER BY id LIMIT 3', ['admin']);
      adminIds.push(...existingAdmins.rows.map(row => row.id));
    }

    // Seed student users
    console.log('👨‍🎓 Seeding student users...');
    const studentPassword = await bcrypt.hash('student123', 12);
    const students = [];
    
    for (let collegeIndex = 0; collegeIndex < collegeIds.length; collegeIndex++) {
      for (let i = 1; i <= 10; i++) {
        students.push({
          college_id: collegeIds[collegeIndex],
          email: `student${i}@${colleges[collegeIndex].domain}`,
          first_name: `Student${i}`,
          last_name: `Lastname${i}`,
          student_id: `STU${String(i).padStart(3, '0')}`,
          role: 'student'
        });
      }
    }

    const studentIds = [];
    for (const student of students) {
      const result = await pool.query(
        'INSERT INTO users (college_id, email, password_hash, first_name, last_name, student_id, role) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (email) DO NOTHING RETURNING id',
        [student.college_id, student.email, studentPassword, student.first_name, student.last_name, student.student_id, student.role]
      );
      if (result.rows.length > 0) {
        studentIds.push(result.rows[0].id);
      }
    }

    // Get student IDs if they already exist
    if (studentIds.length === 0) {
      const existingStudents = await pool.query('SELECT id FROM users WHERE role = $1 ORDER BY id LIMIT 30', ['student']);
      studentIds.push(...existingStudents.rows.map(row => row.id));
    }

    // Get category IDs
    const categoryResult = await pool.query('SELECT id, name FROM event_categories ORDER BY id');
    const categoriesMap = {};
    categoryResult.rows.forEach(cat => {
      categoriesMap[cat.name] = cat.id;
    });

    // Seed events
    console.log('📅 Seeding events...');
    const events = [
      {
        college_id: collegeIds[0],
        category_id: categoriesMap['Workshop'],
        title: 'Web Development Workshop',
        description: 'Learn modern web development with React and Node.js',
        event_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        start_time: '09:00',
        end_time: '17:00',
        location: 'Computer Lab 1',
        capacity: 30,
        registration_deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
        created_by: adminIds[0],
        status: 'published'
      },
      {
        college_id: collegeIds[0],
        category_id: categoriesMap['Hackathon'],
        title: '24-Hour Coding Challenge',
        description: 'Build innovative solutions in 24 hours',
        event_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
        start_time: '10:00',
        end_time: '10:00',
        location: 'Main Auditorium',
        capacity: 50,
        registration_deadline: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000), // 12 days from now
        created_by: adminIds[0],
        status: 'published'
      },
      {
        college_id: collegeIds[1],
        category_id: categoriesMap['Tech Talk'],
        title: 'AI and Machine Learning Trends',
        description: 'Explore the latest trends in AI and ML',
        event_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
        start_time: '14:00',
        end_time: '16:00',
        location: 'Conference Room A',
        capacity: 100,
        registration_deadline: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // 1 day from now
        created_by: adminIds[1],
        status: 'published'
      },
      {
        college_id: collegeIds[2],
        category_id: categoriesMap['Fest'],
        title: 'Tech Fest 2024',
        description: 'Annual technology festival with competitions and exhibitions',
        event_date: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000), // 21 days from now
        start_time: '09:00',
        end_time: '18:00',
        location: 'Campus Grounds',
        capacity: 200,
        registration_deadline: new Date(Date.now() + 18 * 24 * 60 * 60 * 1000), // 18 days from now
        created_by: adminIds[2],
        status: 'published'
      }
    ];

    const eventIds = [];
    for (const event of events) {
      const result = await pool.query(
        `INSERT INTO events (college_id, category_id, title, description, event_date, start_time, end_time, location, capacity, registration_deadline, created_by, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [event.college_id, event.category_id, event.title, event.description, event.event_date, event.start_time, event.end_time, event.location, event.capacity, event.registration_deadline, event.created_by, event.status]
      );
      eventIds.push(result.rows[0].id);
    }

    // Seed some registrations
    console.log('📝 Seeding registrations...');
    for (let i = 0; i < Math.min(15, studentIds.length); i++) {
      const eventId = eventIds[i % eventIds.length];
      const studentId = studentIds[i];
      
      await pool.query(
        'INSERT INTO registrations (event_id, user_id, status) VALUES ($1, $2, $3) ON CONFLICT (event_id, user_id) DO NOTHING',
        [eventId, studentId, 'registered']
      );
    }

    // Seed some attendance (for past events)
    console.log('✅ Seeding attendance...');
    const pastEvent = {
      college_id: collegeIds[0],
      category_id: categoriesMap['Seminar'],
      title: 'Completed Seminar',
      description: 'A seminar that already happened',
      event_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
      start_time: '10:00',
      end_time: '12:00',
      location: 'Room 101',
      capacity: 25,
      created_by: adminIds[0],
      status: 'completed'
    };

    const pastEventResult = await pool.query(
      `INSERT INTO events (college_id, category_id, title, description, event_date, start_time, end_time, location, capacity, created_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [pastEvent.college_id, pastEvent.category_id, pastEvent.title, pastEvent.description, pastEvent.event_date, pastEvent.start_time, pastEvent.end_time, pastEvent.location, pastEvent.capacity, pastEvent.created_by, pastEvent.status]
    );

    const pastEventId = pastEventResult.rows[0].id;

    // Register some students for the past event
    for (let i = 0; i < 5; i++) {
      await pool.query(
        'INSERT INTO registrations (event_id, user_id, status) VALUES ($1, $2, $3) ON CONFLICT (event_id, user_id) DO NOTHING',
        [pastEventId, studentIds[i], 'registered']
      );

      // Mark attendance
      await pool.query(
        'INSERT INTO attendance (event_id, user_id, check_in_time, status) VALUES ($1, $2, $3, $4) ON CONFLICT (event_id, user_id) DO NOTHING',
        [pastEventId, studentIds[i], new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000), 'present'] // 2 hours after event start
      );

      // Add some feedback
      const ratings = [4, 5, 3, 4, 5];
      const comments = [
        'Great seminar!',
        'Very informative session',
        'Good content but could be better organized',
        'Excellent presentation',
        'Learned a lot from this event'
      ];

      await pool.query(
        'INSERT INTO feedback (event_id, user_id, rating, comment) VALUES ($1, $2, $3, $4) ON CONFLICT (event_id, user_id) DO NOTHING',
        [pastEventId, studentIds[i], ratings[i], comments[i]]
      );
    }

    console.log('✅ Database seeding completed successfully!');
    console.log('\n📊 Sample Data Summary:');
    console.log(`- Colleges: ${collegeIds.length}`);
    console.log(`- Admin Users: ${adminIds.length}`);
    console.log(`- Student Users: ${studentIds.length}`);
    console.log(`- Events: ${eventIds.length + 1} (including 1 completed event)`);
    console.log(`- Registrations: ${Math.min(15, studentIds.length) + 5}`);
    console.log(`- Attendance Records: 5`);
    console.log(`- Feedback Records: 5`);
    
    console.log('\n🔑 Test Credentials:');
    console.log('Admin: admin@techuniv.edu / admin123');
    console.log('Student: student1@techuniv.edu / student123');
    
  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run seeding if this file is executed directly
if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;
