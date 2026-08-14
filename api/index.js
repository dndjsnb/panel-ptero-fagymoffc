const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const ZakkiStore = require('zakkistore-sdk');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// --- DATABASE MONGODB ---
const mongoURI = 'mongodb+srv://faaahhmmii_db_user:NwGmRthZCDYqwafy@clusterfagym.qzt0o1a.mongodb.net/?appName=ClusterFagym';
mongoose.connect(mongoURI).catch(() => {});

// SCHEMA RESELLER
const resellerSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    whatsapp: { type: String, required: true },
    telegram: { type: String, required: true }, // Field Telegram ditambahkan
    status: { type: String, default: 'pending' }
});

const Reseller = mongoose.model('Reseller', resellerSchema);

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

// FUNGSI PTERODACTYL API DIRECT (Biarin sesuai script lu yang lama)
async function createPteroUser(email, username) { /* ... Kode lama lu biarin sama ... */ }
async function createPteroServer(userId, plan) { /* ... Kode lama lu biarin sama ... */ }


// --- API REGISTER RESELLER ---
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, whatsapp, password } = req.body; 
        
        const isExist = await Reseller.findOne({ email });
        if(isExist) return res.status(400).json({ message: 'Email sudah terdaftar, Cok!' });

        // Simpan ke DB, telegram di-default ke Belum Terhubung
        const newReseller = new Reseller({ 
            name, email, whatsapp, password, 
            telegram: 'Belum Terhubung', 
            status: 'pending' 
        });
        const savedUser = await newReseller.save();

        // BALIKIN ID DATABASE & USERNAME BOT KE FRONTEND
        res.status(201).json({ 
            message: 'Akun terdaftar.', 
            userId: savedUser._id.toString(),
            botUsername: process.env.BOT_USERNAME || 'FahmiHost_bot' // Pastikan BOT_USERNAME diset di Vercel
        });
    } catch (error) {
        res.status(500).json({ message: 'Gagal daftar! Server error.' });
    }
});


// --- API LOGIN RESELLER ---
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


// --- WEBHOOK TELEGRAM UTAMA ---
app.post('/api/tele-webhook', async (req, res) => {
    const { message, callback_query } = req.body;
    const VERIF_TOKEN = process.env.VERIF_BOT_TOKEN;
    const ADMIN_CHAT_ID = process.env.VERIF_CHAT_ID;

    // 1. TANGKAP KLIK "START" DARI USER RESELLER
    if (message && message.text && message.text.startsWith('/start')) {
        const chatId = message.chat.id;
        const username = message.chat.username ? `@${message.chat.username}` : 'Tidak Ada Username';
        const userId = message.text.split(' ')[1]; // Ngambil ID dari link web ?start=ID

        if (userId) {
            try {
                const user = await Reseller.findById(userId);
                if (user) {
                    const dataTele = `ID: ${chatId} | ${username}`;
                    await Reseller.findByIdAndUpdate(userId, { telegram: dataTele });

                    // Kasih balasan ke user di Bot
                    await axios.post(`https://api.telegram.org/bot${VERIF_TOKEN}/sendMessage`, {
                        chat_id: chatId,
                        text: `✅ *Berhasil Terhubung!*\n\nHalo ${user.name}, pengajuan akun kamu sedang di-review Admin. Mohon tunggu ya!`,
                        parse_mode: 'Markdown'
                    });

                    // KIRIM NOTIFIKASI KE ADMIN BESERTA TOMBOL ACC/TOLAK
                    const pesanAdmin = `✨ *PENDAFTARAN RESELLER BARU* ✨\n\n👤 *Nama:* ${user.name}\n📧 *Email:* ${user.email}\n📱 *WA:* ${user.whatsapp}\n✈️ *Telegram:* ${dataTele}\n\nSilakan verifikasi akun ini.`;
                    
                    const replyMarkup = {
                        inline_keyboard: [
                            [
                                { text: "✅ ACC", callback_data: `ACC_${user.email}` }, 
                                { text: "❌ TOLAK", callback_data: `TOLAK_${user.email}` }
                            ]
                        ]
                    };

                    await axios.post(`https://api.telegram.org/bot${VERIF_TOKEN}/sendMessage`, {
                        chat_id: ADMIN_CHAT_ID, 
                        text: pesanAdmin, 
                        parse_mode: 'Markdown', 
                        reply_markup: replyMarkup
                    });
                }
            } catch (err) { 
                console.error("Error start bot:", err); 
            }
        }
    }

    // 2. TANGKAP TOMBOL ACC/TOLAK DARI ADMIN
    if (callback_query) {
        const actionData = callback_query.data; 
        const adminChatId = callback_query.message.chat.id;
        const messageId = callback_query.message.message_id;
        const [action, emailTarget] = actionData.split('_');

        try {
            let responseText = "";
            if (action === 'ACC') {
                const userUpdated = await Reseller.findOneAndUpdate({ email: emailTarget }, { status: 'verified' }, { new: true });
                responseText = `✅ Akun ${emailTarget} berhasil di-ACC.`;
                
                // Kasih tau reseller kalo akunnya udah di-ACC lewat Bot
                if (userUpdated && userUpdated.telegram !== 'Belum Terhubung') {
                    const userTeleId = userUpdated.telegram.split(' | ')[0].replace('ID: ', '');
                    await axios.post(`https://api.telegram.org/bot${VERIF_TOKEN}/sendMessage`, {
                        chat_id: userTeleId, 
                        text: `🎉 *SELAMAT!* Akun Reseller kamu telah di-ACC Admin. Silakan login ke Dashboard.`, 
                        parse_mode: 'Markdown'
                    });
                }
            } else if (action === 'TOLAK') {
                await Reseller.findOneAndUpdate({ email: emailTarget }, { status: 'rejected' });
                responseText = `❌ Pendaftaran ${emailTarget} ditolak.`;
            }

            // Hapus tombol loading di chat admin
            await axios.post(`https://api.telegram.org/bot${VERIF_TOKEN}/answerCallbackQuery`, { 
                callback_query_id: callback_query.id, 
                text: responseText 
            });
            // Update teks pesan di chat admin
            await axios.post(`https://api.telegram.org/bot${VERIF_TOKEN}/editMessageText`, {
                chat_id: adminChatId, 
                message_id: messageId, 
                text: `${callback_query.message.text}\n\n*STATUS:* ${responseText}`, 
                parse_mode: 'Markdown'
            });
        } catch (error) { 
            console.error('Webhook error:', error); 
        }
    }
    res.status(200).send('OK');
});

// ENDPOINT LAMA (Tinggal sesuain sama kode lu buat QRIS di bawah ini)
app.post('/api/generate-qris', async (req, res) => { /* ... Kode lu ... */ });
app.post('/api/webhook', async (req, res) => { /* ... Kode lu ... */ });

module.exports = app;
