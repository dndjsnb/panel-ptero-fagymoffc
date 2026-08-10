const express = require('express');
const ZakkiStore = require('zakkistore-sdk');
const plans = require('../plans');
const { createUser, createServer } = require('../ptero-api');

const app = express();
app.use(express.json());

// Inisialisasi ZakkiStore SDK menggunakan Environment Variables biar aman!
const zakki = new ZakkiStore({
    baseUrl: 'https://qris.zakki.store',
    token: process.env.ZAKKI_TOKEN,
    iduser: process.env.ZAKKI_IDUSER,
    email: process.env.ZAKKI_EMAIL,
    pin: process.env.ZAKKI_PIN,
    autoWithdraw: true
});

// Endpoint untuk Webhook / Notifikasi Sukses Bayar
app.post('/api/webhook', async (req, res) => {
    // Note: Pastikan nyesuain struktur req.body ini dengan dokumentasi Webhook ZakkiStore
    const { status, email_pembeli, username, plan_key } = req.body;

    // Cek apakah status pembayaran sukses
    // Ganti 'PAID' dengan status sukses dari ZakkiStore (misal: 'SUCCESS' atau 'SETTLED')
    if (status !== 'PAID') {
        return res.status(400).json({ error: 'Belum dibayar atau transaksi gagal' });
    }

    const plan = plans[plan_key];
    if (!plan) return res.status(400).json({ error: 'Paket tidak ditemukan' });

    try {
        console.log(`[!] Proses order masuk dari Webhook ZakkiStore | Paket: ${plan_key}`);
        
        // 1. Eksekusi bikin user di panel Pterodactyl
        const userId = await createUser(email_pembeli, username);
        console.log(`[+] User sukses dibuat! (ID: ${userId})`);

        // 2. Eksekusi bikin server di panel Pterodactyl
        const server = await createServer(userId, plan);
        console.log(`[+] Server sukses dibuat! (UUID: ${server.identifier})`);

        return res.status(200).json({ 
            success: true,
            message: 'Server berhasil dibuat otomatis!', 
            server_id: server.identifier 
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Gagal ngehit API Pterodactyl' });
    }
});

module.exports = app;
