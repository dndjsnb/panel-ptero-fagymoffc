const express = require('express');
const ZakkiStore = require('zakkistore-sdk');
const plans = require('../plans'); // <-- Ini yang tadi ilang
const { createUser, createServer } = require('../ptero-api'); // <-- Ptero API lu

const app = express();
app.use(express.json());

// Konfigurasi ZakkiStore
const zakki = new ZakkiStore({
    baseUrl: 'https://qris.zakki.store',
    token: process.env.ZAKKI_TOKEN,
    iduser: process.env.ZAKKI_IDUSER,
    email: process.env.ZAKKI_EMAIL,
    pin: process.env.ZAKKI_PIN,
    autoWithdraw: true
});

// 1. Endpoint Generate QRIS (Buat di checkout.html)
app.post('/api/generate-qris', async (req, res) => {
    const { amount } = req.body;
    try {
        const response = await zakki.topup(parseInt(amount));
        if (response.data && response.data.qr_image) {
            return res.json({ 
                success: true, 
                qr_url: response.data.qr_image,
                topup_id: response.data.idtopup 
            });
        }
        throw new Error("Gagal ambil QRIS dari ZakkiStore");
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Endpoint Webhook (Dipanggil setelah user klik "Saya Sudah Bayar")
app.post('/api/webhook', async (req, res) => {
    const { plan_key, email_pembeli, username } = req.body;
    
    // Ambil data spek dari plans.js
    const plan = plans[plan_key];
    if (!plan) return res.status(400).json({ error: 'Paket tidak ditemukan di database' });

    try {
        console.log(`[!] Memproses pembuatan server: ${plan.name}`);
        
        // Eksekusi Pterodactyl API
        const userId = await createUser(email_pembeli, username);
        const server = await createServer(userId, plan);

        return res.status(200).json({ 
            success: true, 
            message: 'Server Pterodactyl sukses dibuat!',
            server_id: server.identifier 
        });
    } catch (err) {
        console.error("Error Ptero:", err);
        return res.status(500).json({ error: 'Gagal ngehit API Pterodactyl' });
    }
});

module.exports = app;
