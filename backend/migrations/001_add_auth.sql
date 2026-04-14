-- Database migration SQL for adding authentication tables and seeding admin account
-- Run this manually against your database

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR PRIMARY KEY,
    username VARCHAR UNIQUE NOT NULL,
    email VARCHAR UNIQUE NOT NULL,
    hashed_password VARCHAR NOT NULL,
    full_name VARCHAR,
    role VARCHAR DEFAULT 'user',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_role CHECK (role IN ('admin', 'user'))
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Add ownerId column to contracts table
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS "ownerId" VARCHAR REFERENCES users(id);

-- Seed admin account
-- Username: admin
-- Password: admin123 (CHANGE THIS IN PRODUCTION!)
-- Hashed password below is bcrypt hash of 'admin123'
INSERT INTO users (id, username, email, hashed_password, full_name, role, is_active)
VALUES (
    'admin-seed-001',
    'admin',
    'admin@contract-review.com',
    '$2b$12$yk0m4P5OePhe01.1AoaYsOPbXDFtjC2ZQV7MD2oMMaIcgRuTUnj6K',
    'System Administrator',
    'admin',
    TRUE
)
ON CONFLICT (username) DO NOTHING;
