const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const ZakkiStore = require('zakkistore-sdk');
const axios = require('axios'); // Kita pake axios buat nembak ke Tele

const app = express();
app.use(cors());
app.use(express.json());

// --- BAGIAN DATABASE MONGODB (Silent Mode) ---
const mongoURI = 'mongodb+srv://faaahhmmii_db_user:NwGmRthZCDYqwafy@clusterfagym.qzt0o1a.mongodb.net/?appName=ClusterFagym';

mongoose.connect(mongoURI).catch(() => {});

// 1. UPDATE SCHEMA: Tambahin whatsapp dan status
const resellerSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    whatsapp: { type: String, required: true }, // Dari form web
    status: { type: String, default: 'pending' } // Default pending pas baru daftar
});

const Reseller = mongoose.model('Reseller', resellerSchema);
// ---------------------------------

// DATA PLANS / PAKET HOSTING
const plans = {
    "1gb": { name: "Paket 1GB Basic", ram: 1024, disk: 5000, cpu: 100, price: 5000 },
    "2gb": { name: "Paket 2GB Standar", ram: 2048, disk: 10000, cpu: 150, price: 10000 },
    "3gb": { name: "Paket 3GB Pro", ram: 3072, disk: 15000, cpu: 200, price: 15000 },
    "4gb": { name: "Paket 4GB Advance", ram: 4096, disk: 20000, cpu: 250, price: 20000 }
};

// KONFIGURASI ZAKKISTORE SDK
const zakki = new ZakkiStore({
    baseUrl: 'https://qris.zakki.store',
    token: process.env.ZAKKI_TOKEN,
    iduser: process.env.ZAKKI_IDUSER,
    email: process.env.ZAKKI_EMAIL,
    pin: process.env.ZAKKI_PIN || '123456',
    autoWithdraw: true
});

// FUNGSI PTERODACTYL API DIRECT
async function createPteroUser(email, username) { /* ... Kode lama lu biarin sama ... */ }
async function createPteroServer(userId, plan) { /* ... Kode lama lu biarin sama ... */ }

// --- 2. UPDATE ENDPOINT API REGISTER RESELLER ---
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, whatsapp, password } = req.body; // Tangkap whatsapp
        
        // Cek email udah ada apa belum
        const isExist = await Reseller.findOne({ email });
        if(isExist) return res.status(400).json({ message: 'Email sudah terdaftar, Cok!' });

        // Simpan ke DB dengan status pending
        const newReseller = new Reseller({ name, email, whatsapp, password, status: 'pending' });
        await newReseller.save();

        // Tembak Notifikasi ke Bot Tele Verif
        const VERIF_TOKEN = process.env.VERIF_BOT_TOKEN; 
        const ADMIN_CHAT_ID = process.env.VERIF_CHAT_ID;

        if (VERIF_TOKEN && ADMIN_CHAT_ID) {
            const pesan = `🚨 *PENDAFTARAN RESELLER BARU* 🚨\n\n👤 *Nama:* ${name}\n📧 *Email:* ${email}\n📱 *WA:*${whatsapp}\n\nSilakan verifikasi akun ini.`;
            const replyMarkup = {
                inline_keyboard: [
                    [
                        { text: "✅ ACC", callback_data: `ACC_${email}` },
                        { text: "❌ TOLAK", callback_data: `TOLAK_${email}` }
                    ]
                ]
            };

            await axios.post(`https://api.telegram.org/bot${VERIF_TOKEN}/sendMessage`, {
                chat_id: ADMIN_CHAT_ID,
                text: pesan,
                parse_mode: 'Markdown',
                reply_markup: replyMarkup
            }).catch(err => console.error("Gagal kirim tele:", err.message));
        }

        res.status(201).json({ message: 'Akun reseller berhasil didaftarkan. Menunggu verifikasi.' });
    } catch (error) {
        res.status(500).json({ message: 'Gagal daftar! Server error.' });
    }
});

// --- 3. UPDATE ENDPOINT API LOGIN RESELLER ---
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await Reseller.findOne({ email });
        
        if (!user) {
            return res.status(400).json({ message: 'Email belum terdaftar, Cok!' });
        }
        if (user.password !== password) {
            return res.status(400).json({ message: 'Password salah, Cok!' });
        }

        // CEK STATUS AKUN
        if (user.status === 'pending') {
            return res.status(200).json({ verified: false, message: 'Akun belum diverifikasi oleh Admin via WA!' });
        }
        if (user.status === 'rejected') {
            return res.status(400).json({ message: 'Pendaftaran akun ditolak oleh Admin.' });
        }
        
        res.status(200).json({ verified: true, message: 'Login sukses! Mengalihkan...' });
    } catch (error) {
        res.status(500).json({ message: 'Server error pas login!' });
    }
});

// --- 4. ENDPOINT BARU KHUSUS WEBHOOK TELEGRAM (BUAT TOMBOL ACC) ---
app.post('/api/tele-webhook', async (req, res) => {
    const { callback_query } = req.body;

    if (callback_query) {
        const actionData = callback_query.data; 
        const chatId = callback_query.message.chat.id;
        const messageId = callback_query.message.message_id;
        const callbackQueryId = callback_query.id;
        const [action, email] = actionData.split('_');
        const VERIF_TOKEN = process.env.VERIF_BOT_TOKEN;

        try {
            let responseText = "";
            if (action === 'ACC') {
                await Reseller.findOneAndUpdate({ email: email }, { status: 'verified' });
                responseText = `✅ Akun ${email} berhasil di-ACC.`;
            } else if (action === 'TOLAK') {
                await Reseller.findOneAndUpdate({ email: email }, { status: 'rejected' });
                responseText = `❌ Pendaftaran ${email} ditolak.`;
            }

            // Hapus tombol loading dari Tele
            await axios.post(`https://api.telegram.org/bot${VERIF_TOKEN}/answerCallbackQuery`, {
                callback_query_id: callbackQueryId, text: responseText
            });

            // Edit teks pesan di Tele
            await axios.post(`https://api.telegram.org/bot${VERIF_TOKEN}/editMessageText`, {
                chat_id: chatId,
                message_id: messageId,
                text: `${callback_query.message.text}\n\n*STATUS:*${responseText}`,
                parse_mode: 'Markdown'
            });
        } catch (error) {
            console.error('Webhook error:', error);
        }
    }
    res.status(200).send('OK');
});

// ENDPOINT LAMA TETAP ADA (QRIS & Buat Server)
app.post('/api/generate-qris', async (req, res) => { /* ... Kode lu ... */ });
app.post('/api/webhook', async (req, res) => { /* ... Kode lu ... */ });

module.exports = app;
