const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
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

        const existingUser = await mongoose.connection.collection('sellers').findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Email pehle se register hai!' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const apiKey = 'sk_live_' + Math.random().toString(36).substring(2, 15) + Date.now();

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

        const seller = await mongoose.connection.collection('sellers').findOne({ email });
        if (!seller) return res.status(400).json({ message: 'Email ya Password galat hai!' });

        const isMatch = await bcrypt.compare(password, seller.password);
        if (!isMatch) return res.status(400).json({ message: 'Email ya Password galat hai!' });

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

        const token = tokenHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'orderconfirm_secret_123');
        
        const seller = await mongoose.connection.collection('sellers').findOne({ _id: new mongoose.Types.ObjectId(decoded.id) });
        if (!seller) return res.status(404).json({ message: 'User nahi mila' });

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
// 4. NEW ORDER ROUTE (Shopify/Website se order aana)
// ==========================================
app.post('/api/new-order', async (req, res) => {
    try {
        const { apiKey, customerName, customerPhone, orderId, amount } = req.body;

        if (!apiKey) return res.status(400).json({ success: false, message: 'API Key missing!' });

        // 1. Seller ko uski Secret API key se dhoondho
        const seller = await mongoose.connection.collection('sellers').findOne({ apiKey });
        if (!seller) return res.status(401).json({ success: false, message: 'Galat API Key!' });

        // 2. Balance ya Free Trial check karo
        let updateQuery = {};
        if (seller.freeTrialUsed < seller.freeTrialLimit) {
            // Free trial bacha hai -> Trial use karo
            updateQuery = { $inc: { freeTrialUsed: 1, totalOrders: 1 } };
        } else if (seller.wallet >= 5) {
            // Trial khatam -> Wallet se ₹5 kato
            updateQuery = { $inc: { wallet: -5, totalOrders: 1 } };
        } else {
            // Paise nahi hain -> Order rok do
            return res.status(402).json({ success: false, message: 'Recharge karo bhai! Balance zero hai.' });
        }

        // 3. Database update karo (Paise/Trial kaat lo)
        await mongoose.connection.collection('sellers').updateOne(
            { _id: seller._id },
            updateQuery
        );

        // 4. (TODO: Agle step mein yahan WhatsApp message bhejne ka code aayega)

        res.status(200).json({ 
            success: true, 
            message: `Order ${orderId} successful! Balance/Trial update ho gaya.` 
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// ==========================================
// SERVER START
// ==========================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server Port ${PORT} par daud raha hai! 🚀`));