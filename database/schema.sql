-- Worker Management System Database Schema
-- MySQL

-- Create database
CREATE DATABASE IF NOT EXISTS worker_management;
USE worker_management;

-- Users table for authentication
CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'hr', 'worker') NOT NULL DEFAULT 'worker',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Departments table
CREATE TABLE IF NOT EXISTS departments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Workers table
CREATE TABLE IF NOT EXISTS workers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(20),
    address TEXT,
    department_id INT,
    position VARCHAR(100),
    salary DECIMAL(10, 2) DEFAULT 0,
    date_hired DATE,
    status ENUM('active', 'inactive') DEFAULT 'active',
    profile_image VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
);

-- Attendance table
CREATE TABLE IF NOT EXISTS attendance (
    id INT PRIMARY KEY AUTO_INCREMENT,
    worker_id INT NOT NULL,
    date DATE NOT NULL,
    status ENUM('present', 'absent', 'leave') DEFAULT 'present',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
    UNIQUE KEY unique_attendance (worker_id, date)
);

-- Salaries table
CREATE TABLE IF NOT EXISTS salaries (
    id INT PRIMARY KEY AUTO_INCREMENT,
    worker_id INT NOT NULL,
    month VARCHAR(7) NOT NULL,
    base_salary DECIMAL(10, 2) NOT NULL,
    deductions DECIMAL(10, 2) DEFAULT 0,
    net_salary DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
    UNIQUE KEY unique_salary (worker_id, month)
);

-- Leave requests table
CREATE TABLE IF NOT EXISTS leave_requests (
    id INT PRIMARY KEY AUTO_INCREMENT,
    worker_id INT NOT NULL,
    leave_type ENUM('annual', 'sick', 'personal', 'maternity', 'paternity', 'unpaid') NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    days DECIMAL(5, 1) NOT NULL,
    reason TEXT,
    status ENUM('pending', 'approved', 'rejected', 'cancelled') DEFAULT 'pending',
    approved_by INT,
    approved_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Leave balances table
CREATE TABLE IF NOT EXISTS leave_balances (
    id INT PRIMARY KEY AUTO_INCREMENT,
    worker_id INT NOT NULL,
    year INT NOT NULL,
    annual_leave DECIMAL(5, 1) DEFAULT 0,
    sick_leave DECIMAL(5, 1) DEFAULT 0,
    personal_leave DECIMAL(5, 1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
    UNIQUE KEY unique_balance (worker_id, year)
);

-- Performance reviews table
CREATE TABLE IF NOT EXISTS performance_reviews (
    id INT PRIMARY KEY AUTO_INCREMENT,
    worker_id INT NOT NULL,
    reviewer_id INT NOT NULL,
    review_period VARCHAR(20) NOT NULL,
    review_date DATE NOT NULL,
    overall_rating DECIMAL(3, 2) DEFAULT 0,
    goals_achievement DECIMAL(3, 2) DEFAULT 0,
    attendance_rating DECIMAL(3, 2) DEFAULT 0,
    teamwork_rating DECIMAL(3, 2) DEFAULT 0,
    communication_rating DECIMAL(3, 2) DEFAULT 0,
    technical_skills_rating DECIMAL(3, 2) DEFAULT 0,
    strengths TEXT,
    areas_for_improvement TEXT,
    comments TEXT,
    status ENUM('draft', 'completed') DEFAULT 'draft',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Activity logs table
CREATE TABLE IF NOT EXISTS activity_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    action VARCHAR(100) NOT NULL,
    details TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_action (action),
    INDEX idx_created_at (created_at)
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type ENUM('info', 'warning', 'success', 'error') DEFAULT 'info',
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_is_read (is_read)
);

-- Documents table for worker documents
CREATE TABLE IF NOT EXISTS documents (
    id INT PRIMARY KEY AUTO_INCREMENT,
    worker_id INT NOT NULL,
    document_type ENUM('id', 'certificate', 'contract', 'resume', 'other') NOT NULL,
    title VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size INT,
    mime_type VARCHAR(100),
    expiry_date DATE,
    is_verified BOOLEAN DEFAULT FALSE,
    uploaded_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Shifts table
CREATE TABLE IF NOT EXISTS shifts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    color VARCHAR(20),
    is_night_shift BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Shift schedules table
CREATE TABLE IF NOT EXISTS shift_schedules (
    id INT PRIMARY KEY AUTO_INCREMENT,
    worker_id INT NOT NULL,
    shift_id INT NOT NULL,
    date DATE NOT NULL,
    status ENUM('scheduled', 'completed', 'absent', 'cancelled') DEFAULT 'scheduled',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
    FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE,
    UNIQUE KEY unique_schedule (worker_id, date)
);

-- Training programs table
CREATE TABLE IF NOT EXISTS training_programs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    trainer VARCHAR(255),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    duration_hours INT,
    location VARCHAR(255),
    max_participants INT,
    status ENUM('upcoming', 'ongoing', 'completed', 'cancelled') DEFAULT 'upcoming',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Training enrollments table
CREATE TABLE IF NOT EXISTS training_enrollments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    program_id INT NOT NULL,
    worker_id INT NOT NULL,
    enrollment_date DATE NOT NULL,
    completion_date DATE,
    status ENUM('enrolled', 'completed', 'dropped', 'in_progress') DEFAULT 'enrolled',
    score DECIMAL(5, 2),
    certificate_issued BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (program_id) REFERENCES training_programs(id) ON DELETE CASCADE,
    FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
    UNIQUE KEY unique_enrollment (program_id, worker_id)
);

-- Benefits table
CREATE TABLE IF NOT EXISTS benefits (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    benefit_type ENUM('health', 'dental', 'vision', 'life', 'retirement', 'other') NOT NULL,
    coverage_amount DECIMAL(10, 2),
    employee_contribution DECIMAL(10, 2) DEFAULT 0,
    employer_contribution DECIMAL(10, 2) DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Worker benefits table
CREATE TABLE IF NOT EXISTS worker_benefits (
    id INT PRIMARY KEY AUTO_INCREMENT,
    worker_id INT NOT NULL,
    benefit_id INT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    status ENUM('active', 'pending', 'cancelled') DEFAULT 'active',
    monthly_cost DECIMAL(10, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
    FOREIGN KEY (benefit_id) REFERENCES benefits(id) ON DELETE CASCADE,
    UNIQUE KEY unique_worker_benefit (worker_id, benefit_id)
);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT,
    setting_type ENUM('string', 'number', 'boolean', 'json') DEFAULT 'string',
    description VARCHAR(255),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insert default admin user (password: admin123)
INSERT INTO users (username, email, password, role) VALUES 
('admin', 'admin@company.com', '$2a$10$YourHashedPasswordHere', 'admin');

-- Insert sample departments
INSERT INTO departments (name, description) VALUES 
('Engineering', 'Software Development and IT'),
('Human Resources', 'HR and Recruitment'),
('Finance', 'Finance and Accounting'),
('Marketing', 'Marketing and Sales'),
('Operations', 'Operations and Logistics');

-- Sample workers
INSERT INTO workers (first_name, last_name, email, phone, address, department_id, position, salary, date_hired, status) VALUES
('John', 'Smith', 'john.smith@company.com', '555-0101', '123 Main St, City', 1, 'Senior Developer', 75000.00, '2023-01-15', 'active'),
('Jane', 'Doe', 'jane.doe@company.com', '555-0102', '456 Oak Ave, City', 2, 'HR Manager', 65000.00, '2022-06-01', 'active'),
('Michael', 'Johnson', 'michael.j@company.com', '555-0103', '789 Pine Rd, City', 3, 'Financial Analyst', 55000.00, '2023-03-20', 'active'),
('Emily', 'Williams', 'emily.w@company.com', '555-0104', '321 Elm St, City', 4, 'Marketing Specialist', 48000.00, '2023-08-10', 'active'),
('David', 'Brown', 'david.b@company.com', '555-0105', '654 Maple Dr, City', 5, 'Operations Manager', 60000.00, '2022-11-05', 'active'),
('Sarah', 'Miller', 'sarah.m@company.com', '555-0106', '987 Cedar Ln, City', 1, 'Junior Developer', 50000.00, '2024-01-08', 'active'),
('James', 'Wilson', 'james.w@company.com', '555-0107', '147 Birch Ct, City', 3, 'Accountant', 52000.00, '2023-05-12', 'active'),
('Lisa', 'Taylor', 'lisa.t@company.com', '555-0108', '258 Willow Way, City', 4, 'Sales Executive', 45000.00, '2023-09-25', 'active'),
('Robert', 'Anderson', 'robert.a@company.com', '555-0109', '369 Spruce Ave, City', 5, 'Logistics Coordinator', 42000.00, '2024-02-14', 'active'),
('Jennifer', 'Thomas', 'jennifer.t@company.com', '555-0110', '741 Ash Blvd, City', 2, 'Recruiter', 40000.00, '2024-03-01', 'inactive');

-- Sample attendance records (last 30 days)
INSERT INTO attendance (worker_id, date, status) VALUES
(1, CURDATE() - INTERVAL 1 DAY, 'present'),
(1, CURDATE() - INTERVAL 2 DAY, 'present'),
(1, CURDATE() - INTERVAL 3 DAY, 'present'),
(1, CURDATE() - INTERVAL 4 DAY, 'present'),
(1, CURDATE() - INTERVAL 5 DAY, 'absent'),
(2, CURDATE() - INTERVAL 1 DAY, 'present'),
(2, CURDATE() - INTERVAL 2 DAY, 'present'),
(2, CURDATE() - INTERVAL 3 DAY, 'leave'),
(2, CURDATE() - INTERVAL 4 DAY, 'present'),
(2, CURDATE() - INTERVAL 5 DAY, 'present'),
(3, CURDATE() - INTERVAL 1 DAY, 'present'),
(3, CURDATE() - INTERVAL 2 DAY, 'present'),
(3, CURDATE() - INTERVAL 3 DAY, 'present'),
(3, CURDATE() - INTERVAL 4 DAY, 'present'),
(3, CURDATE() - INTERVAL 5 DAY, 'present'),
(4, CURDATE() - INTERVAL 1 DAY, 'present'),
(4, CURDATE() - INTERVAL 2 DAY, 'absent'),
(4, CURDATE() - INTERVAL 3 DAY, 'present'),
(4, CURDATE() - INTERVAL 4 DAY, 'present'),
(4, CURDATE() - INTERVAL 5 DAY, 'present'),
(5, CURDATE() - INTERVAL 1 DAY, 'present'),
(5, CURDATE() - INTERVAL 2 DAY, 'present'),
(5, CURDATE() - INTERVAL 3 DAY, 'present'),
(5, CURDATE() - INTERVAL 4 DAY, 'leave'),
(5, CURDATE() - INTERVAL 5 DAY, 'present'),
(6, CURDATE() - INTERVAL 1 DAY, 'present'),
(6, CURDATE() - INTERVAL 2 DAY, 'present'),
(6, CURDATE() - INTERVAL 3 DAY, 'present'),
(6, CURDATE() - INTERVAL 4 DAY, 'present'),
(6, CURDATE() - INTERVAL 5 DAY, 'present'),
(7, CURDATE() - INTERVAL 1 DAY, 'present'),
(7, CURDATE() - INTERVAL 2 DAY, 'present'),
(7, CURDATE() - INTERVAL 3 DAY, 'present'),
(7, CURDATE() - INTERVAL 4 DAY, 'present'),
(7, CURDATE() - INTERVAL 5 DAY, 'absent'),
(8, CURDATE() - INTERVAL 1 DAY, 'present'),
(8, CURDATE() - INTERVAL 2 DAY, 'present'),
(8, CURDATE() - INTERVAL 3 DAY, 'present'),
(8, CURDATE() - INTERVAL 4 DAY, 'present'),
(8, CURDATE() - INTERVAL 5 DAY, 'present'),
(9, CURDATE() - INTERVAL 1 DAY, 'present'),
(9, CURDATE() - INTERVAL 2 DAY, 'present'),
(9, CURDATE() - INTERVAL 3 DAY, 'present'),
(9, CURDATE() - INTERVAL 4 DAY, 'present'),
(9, CURDATE() - INTERVAL 5 DAY, 'present');

-- Sample salary records
INSERT INTO salaries (worker_id, month, base_salary, deductions, net_salary) VALUES
(1, '2026-01', 75000.00, 0, 75000.00),
(2, '2026-01', 65000.00, 0, 65000.00),
(3, '2026-01', 55000.00, 0, 55000.00),
(4, '2026-01', 48000.00, 0, 48000.00),
(5, '2026-01', 60000.00, 0, 60000.00),
(6, '2026-01', 50000.00, 0, 50000.00),
(7, '2026-01', 52000.00, 0, 52000.00),
(8, '2026-01', 45000.00, 0, 45000.00),
(9, '2026-01', 42000.00, 0, 42000.00),
(1, '2025-12', 75000.00, 0, 75000.00),
(2, '2025-12', 65000.00, 0, 65000.00),
(3, '2025-12', 55000.00, 0, 55000.00),
(4, '2025-12', 48000.00, 0, 48000.00),
(5, '2025-12', 60000.00, 0, 60000.00);
