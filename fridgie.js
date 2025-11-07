// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
app.use(helmet());
app.use(cors({
  origin: '*' // change to your frontend origin in production
}));
app.use(express.json());

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// helpers
const jwtSecret = process.env.JWT_SECRET || 'dev_secret';
const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '7d';
const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);

function generateToken(user) {
  // keep minimal info in token
  return jwt.sign({ userId: user.id, email: user.email }, jwtSecret, { expiresIn: jwtExpiresIn });
}

async function getUserByEmail(email) {
  const res = await pool.query('SELECT id, name, email, password_hash FROM users WHERE email=$1', [email]);
  return res.rows[0];
}

async function getUserById(id) {
  const res = await pool.query('SELECT id, name, email FROM users WHERE id=$1', [id]);
  return res.rows[0];
}

// Auth middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'Missing authorization header' });
  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Malformed authorization header' });

  jwt.verify(token, jwtSecret, (err, payload) => {
    if (err) return res.status(401).json({ error: 'Invalid or expired token' });
    req.user = { id: payload.userId, email: payload.email };
    next();
  });
}

// Routes

// Health
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Register
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'name, email, password required' });

    const existing = await getUserByEmail(email);
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, saltRounds);
    const insert = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1,$2,$3) RETURNING id, name, email, created_at',
      [name, email, hash]
    );
    const user = insert.rows[0];
    const token = generateToken(user);
    res.json({ user: { id: user.id, name: user.name, email: user.email }, token });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });

    const user = await getUserByEmail(email);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid email or password' });

    const token = generateToken(user);
    res.json({ user: { id: user.id, email: user.email }, token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Get current user
app.get('/api/me', authenticateToken, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

/*
 Items API
 - GET /api/items           : get all items for current user
 - POST /api/items          : create new item
 - PUT /api/items/:id       : update item (only owner)
 - DELETE /api/items/:id    : delete
*/

app.get('/api/items', authenticateToken, async (req, res) => {
  try {
    const q = await pool.query('SELECT * FROM items WHERE user_id=$1 ORDER BY created_at DESC', [req.user.id]);
    res.json({ items: q.rows });
  } catch (err) {
    console.error('GET items error', err);
    res.status(500).json({ error: 'Server error fetching items' });
  }
});

app.post('/api/items', authenticateToken, async (req, res) => {
  try {
    const { type, name, qty, days, expiry_date, barcode } = req.body;
    if (!type || !name) return res.status(400).json({ error: 'type and name required' });
    // optional: validate type
    const validTypes = ['leftover','packaged','veggie','fruit'];
    if (!validTypes.includes(type)) return res.status(400).json({ error: 'invalid type' });

    const insert = await pool.query(
      `INSERT INTO items (user_id, type, name, qty, days, expiry_date, barcode)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.id, type, name, qty || null, days || null, expiry_date || null, barcode || null]
    );
    res.json({ item: insert.rows[0] });
  } catch (err) {
    console.error('POST items error', err);
    res.status(500).json({ error: 'Server error creating item' });
  }
});

app.put('/api/items/:id', authenticateToken, async (req, res) => {
  try {
    const id = req.params.id;
    // check ownership
    const existing = await pool.query('SELECT * FROM items WHERE id=$1 AND user_id=$2', [id, req.user.id]);
    if (existing.rowCount === 0) return res.status(404).json({ error: 'Item not found' });
    const fields = ['type','name','qty','days','expiry_date','barcode'];
    const updates = [];
    const values = [];
    let idx = 1;
    fields.forEach(f => {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = $${idx}`);
        values.push(req.body[f]);
        idx++;
      }
    });
    if (updates.length === 0) return res.status(400).json({ error: 'No updatable fields provided' });
    values.push(id, req.user.id); // for WHERE
    const sql = `UPDATE items SET ${updates.join(', ')} WHERE id=$${idx} AND user_id=$${idx+1} RETURNING *`;
    const q = await pool.query(sql, values);
    res.json({ item: q.rows[0] });
  } catch (err) {
    console.error('PUT item err', err);
    res.status(500).json({ error: 'Server error updating item' });
  }
});

app.delete('/api/items/:id', authenticateToken, async (req, res) => {
  try {
    const id = req.params.id;
    const q = await pool.query('DELETE FROM items WHERE id=$1 AND user_id=$2 RETURNING *', [id, req.user.id]);
    if (q.rowCount === 0) return res.status(404).json({ error: 'Item not found' });
    res.json({ deleted: q.rows[0] });
  } catch (err) {
    console.error('DELETE item err', err);
    res.status(500).json({ error: 'Server error deleting item' });
  }
});

// simple endpoint to lookup barcode in mock db (optional)
const mockBarcodeDB = {
  "8901234567890": { name: "butter", shelf_life_days: 60 },
  "8909876543210": { name: "cheddar cheese", shelf_life_days: 40 },
  "0123456789012": { name: "milk pack", shelf_life_days: 7 },
  "1112223334445": { name: "instant noodles", shelf_life_days: 365 }
};
app.get('/api/barcode/:code', authenticateToken, (req, res) => {
  const code = req.params.code;
  const info = mockBarcodeDB[code];
  if (!info) return res.status(404).json({ error: 'Not found' });
  res.json({ product: info });
});

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));