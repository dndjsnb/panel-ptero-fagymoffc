const express = require('express');
const plans = require('../plans'); // Path mundur satu folder
const { createUser, createServer } = require('../ptero-api');

const app = express();
app.use(express.json());

app.post('/api/webhook', async (req, res) => {
    const { status, email, username, plan_key } = req.body;

    if (status !== 'PAID') {
        return res.status(400).json({ error: 'Belum dibayar' });
    }

    const plan = plans[plan_key];
    if (!plan) return res.status(400).json({ error: 'Paket tidak ditemukan' });

    try {
        const userId = await createUser(email, username);
        const server = await createServer(userId, plan);

        return res.status(200).json({ 
            success: true,
            message: 'Server berhasil dibuat otomatis!', 
            server_id: server.identifier 
        });
    } catch (err) {
        return res.status(500).json({ error: 'Gagal ngehit API Pterodactyl' });
    }
});

// VERCEL SERVERLESS EXPORT
module.exports = app;
          
