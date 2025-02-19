const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const { db, initializeDatabase } = require('./database');
const fs = require('fs');
const os = require('os');

const app = express();
app.use(express.json());

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true, mode: 0o755 });
}

// Add this after creating the uploads directory
console.log('Uploads directory:', uploadsDir);
console.log('Directory exists:', fs.existsSync(uploadsDir));
console.log('Directory is writable:', fs.accessSync(uploadsDir, fs.constants.W_OK));

// Serve static files from uploads directory - IMPORTANT: This must come before other routes
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Log all requests to help debug
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

// Configure multer with better error handling
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function(req, file, cb) {
        // Create a unique filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `product-${uniqueSuffix}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        // Accept only image files
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'));
        }
    },
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

// Authentication Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Access denied' });

    jwt.verify(token, 'your_jwt_secret', (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
};

// Auth Routes
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
                    { 
                        id: user.id, 
                        isAdmin: Boolean(user.isAdmin)  // Convert to boolean
                    },
                    'your_jwt_secret',
                    { expiresIn: '24h' }
                );

                res.json({
                    token,
                    user: {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        isAdmin: Boolean(user.isAdmin)  // Convert to boolean
                    }
                });
            }
        );
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Product Routes
app.get('/api/products', authenticateToken, (req, res) => {
    db.query(`
        SELECT p.*, c.name as categoryName 
        FROM products_app p 
        LEFT JOIN categories_app c ON p.category_id = c.id
        ORDER BY p.created_at DESC
    `, (err, results) => {
        if (err) {
            console.error('Error fetching products:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        // Add full URL to image paths and log for debugging
        const productsWithFullUrls = results.map(product => {
            const fullUrl = product.imageUrl ? `https://uniworldvisionapp.onrender.com${product.imageUrl}` : null;
            console.log(`Product ${product.id}: ${product.imageUrl} -> ${fullUrl}`);
            return {
                ...product,
                imageUrl: fullUrl
            };
        });
        
        res.json(productsWithFullUrls);
    });
});

app.post('/api/products', authenticateToken, upload.single('image'), (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required' });

    try {
        const { name, categoryId, description, price } = req.body;
        const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
        const id = require('crypto').randomUUID();

        console.log('Received product data:', {
            name,
            categoryId,
            description,
            price,
            imageUrl,
            file: req.file
        });

        // Verify the file exists
        if (req.file) {
            const fullPath = path.join(uploadsDir, req.file.filename);
            if (!fs.existsSync(fullPath)) {
                console.error('File not saved:', fullPath);
                return res.status(500).json({ error: 'File upload failed' });
            }
            console.log('File saved successfully:', fullPath);
        }

        db.query(
            'INSERT INTO products_app (id, name, category_id, description, price, imageUrl) VALUES (?, ?, ?, ?, ?, ?)',
            [id, name, categoryId, description, price, imageUrl],
            (err) => {
                if (err) {
                    console.error('Error adding product:', err);
                    return res.status(500).json({ error: 'Database error' });
                }

                // Fetch the created product with category name
                db.query(`
                    SELECT p.*, c.name as categoryName 
                    FROM products_app p 
                    LEFT JOIN categories_app c ON p.category_id = c.id
                    WHERE p.id = ?
                `, [id], (err, results) => {
                    if (err) {
                        console.error('Error fetching created product:', err);
                        return res.status(500).json({ error: 'Database error' });
                    }

                    const product = results[0];
                    if (product.imageUrl) {
                        product.imageUrl = `https://uniworldvisionapp.onrender.com${product.imageUrl}`;
                    }

                    res.json({
                        message: 'Product added successfully',
                        product
                    });
                });
            }
        );
    } catch (error) {
        console.error('Error in product creation:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update product
app.put('/api/products/:id', authenticateToken, upload.single('image'), (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required' });

    const { id } = req.params;
    const { name, categoryId, description, price } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    let query = 'UPDATE products_app SET name = ?, category_id = ?, description = ?, price = ?';
    let params = [name, categoryId, description, price];

    if (imageUrl) {
        query += ', imageUrl = ?';
        params.push(imageUrl);
    }

    query += ' WHERE id = ?';
    params.push(id);

    db.query(query, params, (err) => {
        if (err) {
            console.error('Error updating product:', err);
            return res.status(500).json({ error: 'Server error' });
        }
        res.json({ message: 'Product updated successfully' });
    });
});

// Delete product
app.delete('/api/products/:id', authenticateToken, (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required' });

    const { id } = req.params;

    db.query('DELETE FROM products_app WHERE id = ?', [id], (err) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        res.json({ message: 'Product deleted successfully' });
    });
});

// Get all non-admin users (admin only)
app.get('/api/users', authenticateToken, (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
    }

    db.query(
        'SELECT id, name, email, mobile, gender FROM users_app WHERE isAdmin = false',
        (err, results) => {
            if (err) {
                console.error('Error fetching users:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            res.json(results);
        }
    );
});

// Category Routes
app.get('/api/categories', authenticateToken, (req, res) => {
    db.query('SELECT * FROM categories_app ORDER BY name', (err, results) => {
        if (err) {
            console.error('Error fetching categories:', err);
            return res.status(500).json({ error: 'Database error: ' + err.message });
        }
        res.json(results);
    });
});

app.post('/api/categories', authenticateToken, (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required' });

    const { name, description } = req.body;
    
    // Validate input
    if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: 'Category name is required' });
    }

    const id = require('crypto').randomUUID();

    db.query(
        'INSERT INTO categories_app (id, name, description) VALUES (?, ?, ?)',
        [id, name.trim(), description?.trim()],
        (err) => {
            if (err) {
                console.error('Error adding category:', err);
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(400).json({ error: 'A category with this name already exists' });
                }
                return res.status(500).json({ error: 'Database error: ' + err.message });
            }
            res.json({ 
                message: 'Category added successfully',
                categoryId: id 
            });
        }
    );
});

app.put('/api/categories/:id', authenticateToken, (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required' });

    const { id } = req.params;
    const { name, description } = req.body;

    db.query(
        'UPDATE categories_app SET name = ?, description = ? WHERE id = ?',
        [name, description, id],
        (err) => {
            if (err) {
                console.error('Error updating category:', err);
                return res.status(500).json({ error: 'Server error' });
            }
            res.json({ message: 'Category updated successfully' });
        }
    );
});

app.delete('/api/categories/:id', authenticateToken, (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required' });

    const { id } = req.params;

    // First check if category is in use
    db.query('SELECT COUNT(*) as count FROM products_app WHERE category_id = ?', [id], (err, results) => {
        if (err) {
            console.error('Error checking category usage:', err);
            return res.status(500).json({ error: 'Server error' });
        }

        if (results[0].count > 0) {
            return res.status(400).json({ error: 'Cannot delete category that is in use' });
        }

        // If not in use, delete the category
        db.query('DELETE FROM categories_app WHERE id = ?', [id], (err) => {
            if (err) {
                console.error('Error deleting category:', err);
                return res.status(500).json({ error: 'Server error' });
            }
            res.json({ message: 'Category deleted successfully' });
        });
    });
});

// Start server
const PORT = 3000;


// Initialize database
//initializeDatabase().then(() => {
    // Start server only after database is initialized
 //   app.listen(PORT, () => {
  //      console.log(`Server running on port ${PORT}`);
  //  });
//});



// Initialize database
initializeDatabase().then(() => {
    // Start server only after database is initialized
    app.listen(3000, () => {
    const interfaces = os.networkInterfaces();
    let serverIP = '';
    
    for (let key in interfaces) {
        for (let detail of interfaces[key]) {
            if (detail.family === 'IPv4' && !detail.internal) {
                serverIP = detail.address;
            }
        }
    }

    console.log(`✅ Server started on http://${serverIP}:3000`);
})});
