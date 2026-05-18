const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// Security aur data read karne ke liye
app.use(cors());
app.use(express.json());

// Ek chhota sa test route
app.get('/', (req, res) => {
    res.send("RTO Ninja Backend is Running! 🚀");
});

// 👇 YAHAN DHYAN DIJIYE 👇
// (' ') ke andar daaliye
const mongoURI = 'mongodb://Deepesh0005:Deepesh19@ac-tqzysyl-shard-00-00.mgmlyjw.mongodb.net:27017,ac-tqzysyl-shard-00-01.mgmlyjw.mongodb.net:27017,ac-tqzysyl-shard-00-02.mgmlyjw.mongodb.net:27017/?ssl=true&replicaSet=atlas-sqdouo-shard-0&authSource=admin&appName=Cluster0'; 

mongoose.connect(mongoURI)
.then(() => console.log("MongoDB Connected! 🗄️"))
.catch(err => console.log("Database mein gadbad hai bhai: ", err)); 

// Server ko Start karna
const PORT = 5000;
app.listen(PORT, () => {
    console.log(`Bhai, Server Port ${PORT} par daud raha hai! 🔥`);
});