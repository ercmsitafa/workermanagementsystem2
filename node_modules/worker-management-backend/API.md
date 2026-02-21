# Worker Management System API Documentation

## Base URL
```
http://localhost:3000/api
```

## Authentication
Most endpoints require JWT authentication. Include the token in the request header:
```
Authorization: Bearer <your_jwt_token>
```

## Roles
- `admin` - Full access to all features
- `hr` - Access to worker management, departments, attendance, leave, performance
- `worker` - Limited access to own data

---

## Endpoints

### 1. Authentication

#### POST /api/auth/login
Login with username and password
```json
{
  "username": "admin",
  "password": "admin123"
}
```

#### POST /api/auth/register
Register new user
```json
{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "password123",
  "role": "worker"
}
```

#### GET /api/auth/me
Get current user info

#### POST /api/auth/change-password
Change password
```json
{
  "currentPassword": "oldpass",
  "newPassword": "newpass"
}
```

---

### 2. Workers

#### GET /api/workers
Get all workers with filtering and pagination
- Query params: `page`, `limit`, `search`, `department_id`, `status`, `position`, `sortBy`, `sortOrder`

#### GET /api/workers/:id
Get single worker with attendance and salary history

#### POST /api/workers
Create new worker (admin/hr)
```json
{
  "first_name": "John",
  "last_name": "Doe",
  "email": "john@company.com",
  "phone": "555-1234",
  "department_id": 1,
  "position": "Developer",
  "salary": 50000,
  "date_hired": "2024-01-01",
  "status": "active"
}
```

#### PUT /api/workers/:id
Update worker

#### DELETE /api/workers/:id
Delete worker (admin only)

#### POST /api/workers/bulk-import
Bulk import workers
```json
{
  "workers": [...]
}
```

---

### 3. Departments

#### GET /api/departments
Get all departments with worker counts

#### GET /api/departments/:id
Get department with workers

#### POST /api/departments
Create department

#### PUT /api/departments/:id
Update department

#### DELETE /api/departments/:id
Delete department

#### GET /api/departments/:id/stats
Get department statistics

---

### 4. Attendance

#### GET /api/attendance
Get attendance records
- Query params: `page`, `limit`, `worker_id`, `department_id`, `status`, `startDate`, `endDate`

#### GET /api/attendance/today
Get today's attendance

#### POST /api/attendance
Record attendance
```json
{
  "worker_id": 1,
  "date": "2024-01-15",
  "status": "present"
}
```

#### POST /api/attendance/bulk
Bulk record attendance
```json
{
  "date": "2024-01-15",
  "records": [{"worker_id": 1, "status": "present"}]
}
```

#### POST /api/attendance/auto-mark
Auto-mark all active workers

#### GET /api/attendance/worker/:workerId
Get worker attendance history

---

### 5. Salary

#### GET /api/salary
Get salary records
- Query params: `page`, `limit`, `worker_id`, `department_id`, `month`, `year`

#### POST /api/salary
Create salary record

#### PUT /api/salary/:id
Update salary record

#### POST /api/salary/generate-monthly
Generate salaries for all workers
```json
{
  "month": "2024-01",
  "deductions": 0
}
```

#### GET /api/salary/worker/:workerId
Get worker salary history

---

### 6. Dashboard

#### GET /api/dashboard
Get main dashboard data with stats

#### GET /api/dashboard/analytics
Get analytics data
- Query params: `period` (number of days)

#### GET /api/dashboard/reports
Get reports summary
- Query params: `startDate`, `endDate`, `department_id`

#### GET /api/dashboard/quick-stats
Get quick stats

---

### 7. Leave Management

#### GET /api/leave
Get leave requests

#### GET /api/leave/balance/:workerId
Get leave balance

#### POST /api/leave
Submit leave request
```json
{
  "worker_id": 1,
  "leave_type": "annual",
  "start_date": "2024-02-01",
  "end_date": "2024-02-05",
  "reason": "Family vacation"
}
```

#### PUT /api/leave/:id/status
Approve/reject leave (admin/hr)
```json
{
  "status": "approved",
  "comments": "Approved"
}
```

#### PUT /api/leave/:id/cancel
Cancel leave request

#### PUT /api/leave/balance/:workerId
Update leave balance

---

### 8. Performance Reviews

#### GET /api/performance
Get performance reviews

#### GET /api/performance/:id
Get single review

#### GET /api/performance/worker/:workerId
Get worker reviews

#### POST /api/performance
Create performance review
```json
{
  "worker_id": 1,
  "review_period": "Q1 2024",
  "overall_rating": 4.5,
  "goals_achievement": 4.0,
  "attendance_rating": 5.0,
  "teamwork_rating": 4.5,
  "communication_rating": 4.0,
  "technical_skills_rating": 4.5,
  "strengths": "Good team player",
  "areas_for_improvement": "Time management",
  "comments": "Great performance"
}
```

#### PUT /api/performance/:id
Update review

#### DELETE /api/performance/:id
Delete review

#### GET /api/performance/analytics/summary
Get performance analytics

---

### 9. Activity Logs

#### GET /api/activity
Get activity logs

#### GET /api/activity/summary
Get activity summary

#### DELETE /api/activity/cleanup
Cleanup old logs

---

### 10. Export

#### GET /api/export/workers/excel
Export workers to Excel

#### GET /api/export/attendance/excel
Export attendance to Excel

#### GET /api/export/salaries/excel
Export salaries to Excel

#### GET /api/export/leave/excel
Export leave requests to Excel

#### GET /api/export/performance/excel
Export performance reviews to Excel

#### GET /api/export/report/pdf
Generate PDF report

---

### 11. Notifications

#### GET /api/notifications
Get user notifications
- Query params: `page`, `limit`, `unread_only`

#### POST /api/notifications
Create notification (admin)

#### POST /api/notifications/broadcast
Broadcast to all users

#### PUT /api/notifications/:id/read
Mark as read

#### PUT /api/notifications/read-all
Mark all as read

#### DELETE /api/notifications/:id
Delete notification

---

## Response Format

### Success
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation successful"
}
```

### Error
```json
{
  "success": false,
  "message": "Error message",
  "errors": [ ... ] // validation errors
}
```

### Pagination
```json
{
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "pages": 10
  }
}
```
