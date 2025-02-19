const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
require('dotenv').config(); // Load environment variables

const { db, initializeDatabase } = require('./database');

const app = express();
app.use(express.json());

// ✅ Enable CORS for frontend communication
app.use(cors());

// ✅ Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true, mode: 0o755 });
}

// ✅ Serve static files (for uploaded images)
app.use('/uploads', express.static(uploadsDir));

// ✅ Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `product-${uniqueSuffix}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'));
        }
    },
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// ✅ Authentication Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Access denied' });

    jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret', (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
};

// ✅ API Endpoints

// 🔹 Register User
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, mobile, gender } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const id = require('crypto').randomUUID();

        db.query(
            'INSERT INTO users_app (id, name, email, password, mobile, gender) VALUES (?, ?, ?, ?, ?, ?)',
            [id, name, email, hashedPassword, mobile, gender],
            (err) => {
                if (err) {
                    console.error(err);
                    return res.status(400).json({ error: 'Registration failed' });
                }
                res.json({ message: 'Registration successful' });
            }
        );
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// 🔹 Login User
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        db.query(
            'SELECT * FROM users_app WHERE email = ?',
            [email],
            async (err, results) => {
                if (err) return res.status(500).json({ error: 'Server error' });
                if (results.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

                const user = results[0];
                const validPassword = await bcrypt.compare(password, user.password);
                if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });

                const token = jwt.sign(
                    { id: user.id, isAdmin: Boolean(user.isAdmin) },
                    process.env.JWT_SECRET || 'your_jwt_secret',
                    { expiresIn: '24h' }
                );

                res.json({
                    token,
                    user: {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        isAdmin: Boolean(user.isAdmin)
                    }
                });
            }
        );
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// 🔹 Get Products
app.get('/api/products', authenticateToken, (req, res) => {
    db.query(`
        SELECT p.*, c.name as categoryName 
        FROM products_app p 
        LEFT JOIN categories_app c ON p.category_id = c.id
        ORDER BY p.created_at DESC
    `, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });

        // ✅ Use correct image URL
        const baseUrl = process.env.SERVER_URL || 'https://yourdomain.onrender.com';
        const productsWithFullUrls = results.map(product => ({
            ...product,
            imageUrl: product.imageUrl ? `${baseUrl}${product.imageUrl}` : null
        }));

        res.json(productsWithFullUrls);
    });
});

// 🔹 Add Product (Admin Only)
app.post('/api/products', authenticateToken, upload.single('image'), (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required' });

    const { name, categoryId, description, price } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
    const id = require('crypto').randomUUID();

    db.query(
        'INSERT INTO products_app (id, name, category_id, description, price, imageUrl) VALUES (?, ?, ?, ?, ?, ?)',
        [id, name, categoryId, description, price, imageUrl],
        (err) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json({ message: 'Product added successfully' });
        }
    );
});

// 🔹 Delete Product (Admin Only)
app.delete('/api/products/:id', authenticateToken, (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required' });

    const { id } = req.params;

    db.query('DELETE FROM products_app WHERE id = ?', [id], (err) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        res.json({ message: 'Product deleted successfully' });
    });
});

// ✅ Start Server on Render
const PORT = process.env.PORT || 3000;

initializeDatabase().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ Server running on port ${PORT}`);
    });
});
