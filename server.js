const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Bhai, MongoDB Connected! 🔥'))
    .catch(err => console.log('MongoDB connection error:', err));

// ==========================================
// 1. SIGNUP ROUTE (Naya Account Banana)
// ==========================================
app.post('/api/signup', async (req, res) => {
    try {
        const { name, email, phone, business, password } = req.body;

        // Check if user already exists
        const existingUser = await mongoose.connection.collection('sellers').findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Email pehle se register hai!' });
        }

        // Hash password (Security)
        const hashedPassword = await bcrypt.hash(password, 10);

        // Generate API Key
        const apiKey = 'sk_live_' + Math.random().toString(36).substring(2, 15) + Date.now();

        // Save to database
        const newSeller = {
            name,
            email,
            phone,
            business,
            password: hashedPassword,
            apiKey,
            wallet: 0,
            freeTrialUsed: 0,
            freeTrialLimit: 10,
            totalOrders: 0,
            createdAt: new Date()
        };

        await mongoose.connection.collection('sellers').insertOne(newSeller);

        res.status(201).json({ success: true, message: 'Account ban gaya!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error!' });
    }
});

// ==========================================
// 2. LOGIN ROUTE (Account mein aana)
// ==========================================
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check karna ki user database mein hai ya nahi
        const seller = await mongoose.connection.collection('sellers').findOne({ email });
        if (!seller) {
            return res.status(400).json({ message: 'Email ya Password galat hai!' });
        }

        // Password check karna
        const isMatch = await bcrypt.compare(password, seller.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Email ya Password galat hai!' });
        }

        // User ko ek VIP Token dena
        const token = jwt.sign(
            { id: seller._id }, 
            process.env.JWT_SECRET || 'orderconfirm_secret_123', 
            { expiresIn: '30d' }
        );

        res.status(200).json({ 
            message: 'Login Successful!', 
            token,
            seller: { name: seller.name, email: seller.email, apiKey: seller.apiKey }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server mein koi dikkat aa gayi hai!' });
    }
});

// ==========================================
// 3. DASHBOARD DATA ROUTE (Asli Data Lana)
// ==========================================
app.get('/api/me', async (req, res) => {
    try {
        const tokenHeader = req.headers.authorization;
        if (!tokenHeader) return res.status(401).json({ message: 'Token missing!' });

        // Token ko kholna
        const token = tokenHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'orderconfirm_secret_123');
        
        // Database se current user ka saara data nikalna
        const seller = await mongoose.connection.collection('sellers').findOne({ _id: new mongoose.Types.ObjectId(decoded.id) });
        
        if (!seller) return res.status(404).json({ message: 'User nahi mila' });

        // Dashboard ke liye asli data bhejna
        res.json({
            name: seller.name,
            wallet: seller.wallet,
            totalOrders: seller.totalOrders,
            freeTrialUsed: seller.freeTrialUsed,
            freeTrialLimit: seller.freeTrialLimit,
            apiKey: seller.apiKey
        });
    } catch (err) {
        res.status(500).json({ message: 'Token galat hai ya expire ho gaya' });
    }
});

// ==========================================
// SERVER START
// ==========================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server Port ${PORT} par daud raha hai! 🚀`));