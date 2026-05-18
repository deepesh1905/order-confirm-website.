const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname)));

const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'orderconfirm_secret_key';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || '1106763835856433';
const PORT = process.env.PORT || 3000;

mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB Connected!'))
    .catch(err => console.log('❌ MongoDB Error:', err));

const sellerSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    phone: String,
    business: String,
    password: String,
    apiKey: String,
    wallet: { type: Number, default: 0 },
    freeTrialUsed: { type: Number, default: 0 },
    freeTrialLimit: { type: Number, default: 10 },
    totalOrders: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

const Seller = mongoose.model('Seller', sellerSchema);

const orderSchema = new mongoose.Schema({
    sellerId: String,
    orderId: String,
    customerPhone: String,
    customerName: String,
    address: String,
    amount: String,
    status: { type: String, default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});

const Order = mongoose.model('Order', orderSchema);

function generateApiKey() {
    return 'sk_live_' + Math.random().toString(36).substr(2, 20) + Date.now();
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/api/signup', async (req, res) => {
    try {
        const { name, email, phone, business, password } = req.body;
        const existing = await Seller.findOne({ email });
        if (existing) return res.json({ success: false, message: 'Email pehle se registered hai!' });
        const hashedPassword = await bcrypt.hash(password, 10);
        const apiKey = generateApiKey();
        const seller = new Seller({ name, email, phone, business, password: hashedPassword, apiKey });
        await seller.save();
        const token = jwt.sign({ id: seller._id }, JWT_SECRET);
        res.json({ success: true, token, apiKey });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const seller = await Seller.findOne({ email });
        if (!seller) return res.json({ success: false, message: 'Email nahi mila!' });
        const isMatch = await bcrypt.compare(password, seller.password);
        if (!isMatch) return res.json({ success: false, message: 'Password galat hai!' });
        const token = jwt.sign({ id: seller._id }, JWT_SECRET);
        res.json({ success: true, token });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

app.get('/api/dashboard', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const seller = await Seller.findById(decoded.id);
        const orders = await Order.find({ sellerId: seller._id }).sort({ createdAt: -1 }).limit(10);
        res.json({
            success: true,
            seller: { name: seller.name, business: seller.business, wallet: seller.wallet, apiKey: seller.apiKey, freeTrialUsed: seller.freeTrialUsed, freeTrialLimit: seller.freeTrialLimit },
            orders
        });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

app.post('/new-order', async (req, res) => {
    try {
        const { customerPhone, customerName, address, orderId, amount, apiKey } = req.body;
        const seller = await Seller.findOne({ apiKey });
        if (!seller) return res.json({ success: false, message: 'Invalid API Key!' });
        if (seller.freeTrialUsed < seller.freeTrialLimit) {
            seller.freeTrialUsed += 1;
        } else if (seller.wallet >= 5) {
            seller.wallet -= 5;
        } else {
            return res.json({ success: false, message: 'Wallet mein paisa nahi!' });
        }
        seller.totalOrders += 1;
        await seller.save();
        const order = new Order({ sellerId: seller._id, orderId, customerPhone, customerName, address, amount });
        await order.save();
        const message = `Namaste ${customerName}! 🛍️\n\nAapka order place hua hai!\n\n📦 Order ID: ${orderId}\n💰 Amount: ₹${amount}\n📍 Address: ${address}\n\nKya ye address sahi hai?\n1 - Haan ✅\n2 - Nahi ❌`;
        await fetch(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ messaging_product: "whatsapp", to: customerPhone, text: { body: message } })
        });
        res.json({ success: true, message: 'Order confirmation bhej diya!' });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

app.get('/webhook', (req, res) => {
    res.status(200).send(req.query["hub.challenge"]);
});

app.post('/webhook', async (req, res) => {
    try {
        const body = req.body;
        if (body.object === 'whatsapp_business_account') {
            if (body.entry?.[0]?.changes?.[0]?.value?.messages) {
                const msg = body.entry[0].changes[0].value.messages[0];
                const from = msg.from;
                const text = msg.text?.body?.trim();
                const order = await Order.findOne({ customerPhone: from, status: 'pending' });
                if (order) {
                    if (text === '1') {
                        order.status = 'confirmed';
                        await order.save();
                        await fetch(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ messaging_product: "whatsapp", to: from, text: { body: `✅ Order confirm ho gaya!\nOrder ID: ${order.orderId}\nJaldi deliver hoga! 🚚` } })
                        });
                    } else if (text === '2') {
                        order.status = 'rejected';
                        await order.save();
                        await fetch(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ messaging_product: "whatsapp", to: from, text: { body: `❌ Order cancel kar diya. Dobara order karne ke liye batao! 😊` } })
                        });
                    }
                }
            }
        }
        res.sendStatus(200);
    } catch (err) {
        res.sendStatus(200);
    }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));