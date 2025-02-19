const mysql = require('mysql2');
const bcrypt = require('bcrypt');

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
});

async function initializeDatabase() {
    try {
        // Create users table
        await db.promise().query(`
            CREATE TABLE IF NOT EXISTS users_app (
                id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(100) NOT NULL,
                mobile VARCHAR(15) NOT NULL,
                gender VARCHAR(10) NOT NULL,
                isAdmin BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // Create products table
        await db.promise().query(`
            CREATE TABLE IF NOT EXISTS products_app (
                id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                category VARCHAR(50) NOT NULL,
                description TEXT,
                price DECIMAL(10,2) NOT NULL,
                imageUrl VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // Check if admin user exists
        const [admins] = await db.promise().query(
            'SELECT * FROM users_app WHERE email = ?',
            ['admin@uniworldvision.com']
        );

        // Create admin user if it doesn't exist
        if (admins.length === 0) {
            const hashedPassword = await bcrypt.hash('admin123', 10);
            await db.promise().query(
                'INSERT INTO users_app (id, name, email, password, mobile, gender, isAdmin) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [
                    'admin-uuid-1',
                    'Admin User',
                    'admin@uniworldvision.com',
                    hashedPassword,
                    '1234567890',
                    'Male',
                    true
                ]
            );
            console.log('Admin user created');
        }

        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Error initializing database:', error);
    }
}

module.exports = { db, initializeDatabase }; 