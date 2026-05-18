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
// 1. SIGNUP ROUTE
// ==========================================
app.post('/api/signup', async (req, res) => {
    try {
        const { name, email, phone, business, password } = req.body;
        const existingUser = await mongoose.connection.collection('sellers').findOne({ email });
        if (existingUser) return res.status(400).json({ success: false, message: 'Email pehle se register hai!' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const apiKey = 'sk_live_' + Math.random().toString(36).substring(2, 15) + Date.now();

        const newSeller = {
            name, email, phone, business, password: hashedPassword, apiKey,
            wallet: 0, freeTrialUsed: 0, freeTrialLimit: 10, totalOrders: 0, createdAt: new Date()
        };

        await mongoose.connection.collection('sellers').insertOne(newSeller);
        res.status(201).json({ success: true, message: 'Account ban gaya!' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error!' });
    }
});

// ==========================================
// 2. LOGIN ROUTE
// ==========================================
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const seller = await mongoose.connection.collection('sellers').findOne({ email });
        if (!seller) return res.status(400).json({ message: 'Email ya Password galat hai!' });

        const isMatch = await bcrypt.compare(password, seller.password);
        if (!isMatch) return res.status(400).json({ message: 'Email ya Password galat hai!' });

        const token = jwt.sign({ id: seller._id }, process.env.JWT_SECRET || 'orderconfirm_secret_123', { expiresIn: '30d' });

        res.status(200).json({ 
            message: 'Login Successful!', token,
            seller: { name: seller.name, email: seller.email, apiKey: seller.apiKey }
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error!' });
    }
});

// ==========================================
// 3. DASHBOARD DATA ROUTE
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
            name: seller.name, wallet: seller.wallet, totalOrders: seller.totalOrders,
            freeTrialUsed: seller.freeTrialUsed, freeTrialLimit: seller.freeTrialLimit, apiKey: seller.apiKey
        });
    } catch (err) {
        res.status(500).json({ message: 'Token expire ho gaya' });
    }
});

// ==========================================
// 4. NEW ORDER ROUTE (WITH INTERACTIVE BUTTONS 🚀)
// ==========================================
app.post('/api/new-order', async (req, res) => {
    try {
        const { apiKey, customerName, customerPhone, orderId, amount } = req.body;
        if (!apiKey) return res.status(400).json({ success: false, message: 'API Key missing!' });

        const seller = await mongoose.connection.collection('sellers').findOne({ apiKey });
        if (!seller) return res.status(401).json({ success: false, message: 'Galat API Key!' });

        // Balance Check & Deduct
        let updateQuery = {};
        if (seller.freeTrialUsed < seller.freeTrialLimit) {
            updateQuery = { $inc: { freeTrialUsed: 1, totalOrders: 1 } };
        } else if (seller.wallet >= 5) {
            updateQuery = { $inc: { wallet: -5, totalOrders: 1 } };
        } else {
            return res.status(402).json({ success: false, message: 'Recharge karo bhai! Balance zero hai.' });
        }

        await mongoose.connection.collection('sellers').updateOne({ _id: seller._id }, updateQuery);

        const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN; 
        const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

        // WHATSAPP BUTTON MESSAGE BHEJNA
        if (WHATSAPP_TOKEN && PHONE_NUMBER_ID) {
            try {
                await fetch(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        messaging_product: "whatsapp",
                        to: customerPhone,
                        type: "interactive",
                        interactive: {
                            type: "button",
                            body: {
                                text: `📦 *New Order Received!*\n\nHi ${customerName},\nAapka order #${orderId} (₹${amount}) humare paas aa gaya hai.\n\nKripya apna order aur address confirm karein:`
                            },
                            action: {
                                buttons: [
                                    {
                                        type: "reply",
                                        reply: {
                                            id: `CONFIRM_${orderId}`,
                                            title: "✅ Confirm Order"
                                        }
                                    },
                                    {
                                        type: "reply",
                                        reply: {
                                            id: `CANCEL_${orderId}`,
                                            title: "❌ Cancel Order"
                                        }
                                    }
                                ]
                            }
                        }
                    })
                });
                console.log("WhatsApp Button message gya:", customerPhone);
            } catch (waError) {
                console.log("WhatsApp API error:", waError);
            }
        }

        res.status(200).json({ success: true, message: `Order ${orderId} successful! Balance update & WhatsApp Buttons triggered.` });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// ==========================================
// 5. META WHATSAPP WEBHOOK (REPLY SUNNE KE LIYE)
// ==========================================
app.get('/webhook', (req, res) => {
    const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || "deepesh_webhook_123";
    let mode = req.query["hub.mode"];
    let token = req.query["hub.verify_token"];
    let challenge = req.query["hub.challenge"];

    if (mode && token) {
        if (mode === "subscribe" && token === VERIFY_TOKEN) {
            console.log("BOMB! 💣 Meta Webhook Verified!");
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    }
});

app.post('/webhook', (req, res) => {
    let body = req.body;

    if (body.object) {
        if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages && body.entry[0].changes[0].value.messages[0]) {
            let from = body.entry[0].changes[0].value.messages[0].from; 
            let msg_body = body.entry[0].changes[0].value.messages[0];

            if (msg_body.type === "interactive") {
                let button_reply = msg_body.interactive.button_reply.id; 
                console.log(`\n🔥 JABARDAST! Customer ${from} ne button dabaya: ${button_reply}`);
            } else {
                console.log(`Customer ${from} ne text bheja:`, msg_body.text?.body);
            }
        }
        res.sendStatus(200);
    } else {
        res.sendStatus(404);
    }
});

// ==========================================
// SERVER START
// ==========================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server Port ${PORT} par daud raha hai! 🚀`));