-- Create the database if it doesn't exist
CREATE DATABASE IF NOT EXISTS manjeet;
USE manjeet;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(100) NOT NULL,
    mobile VARCHAR(15) NOT NULL,
    gender VARCHAR(10) NOT NULL,
    isAdmin BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Products table
CREATE TABLE IF NOT EXISTS products (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    imageUrl VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Update the categories table with better constraints
DROP TABLE IF EXISTS categories;
CREATE TABLE categories (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,  -- Added UNIQUE constraint
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_category_name (name)  -- Added index for faster lookups
);

-- Add foreign key constraint to products table
ALTER TABLE products
    DROP COLUMN category,  -- Remove old category column
    ADD COLUMN category_id VARCHAR(36),
    ADD CONSTRAINT fk_product_category 
    FOREIGN KEY (category_id) 
    REFERENCES categories(id)
    ON DELETE RESTRICT;  -- Prevent deletion of categories in use

-- Create an admin user (password will be "admin123")
INSERT INTO users (id, name, email, password, mobile, gender, isAdmin)
VALUES (
    'admin-uuid-1',
    'Admin User',
    'admin@uniworldvision.com',
    '$2b$10$YourHashedPasswordHere',  -- You'll need to generate this with bcrypt
    '1234567890',
    'Male',
    true
); 