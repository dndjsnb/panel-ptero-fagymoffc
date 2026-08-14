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
    telegram: { type: String, required: true },
    status: { type: String, default: 'pending' },
    saldo: { type: Number, default: 0 } // Database siap nampung duit
});

const Reseller = mongoose.model('Reseller', resellerSchema);

// DATA PLANS UNTUK CHECKOUT PTERO
const plans = {
    "basic": { price: 5000 }, "standar": { price: 10000 }, "pro": { price: 15000 }, "advance": { price: 20000 },
    "1gb": { price: 5000 }, "2gb": { price: 10000 }, "3gb": { price: 15000 }, "4gb": { price: 20000 },
    "5gb": { price: 25000 }, "6gb": { price: 30000 }, "7gb": { price: 35000 }, "8gb": { price: 40000 },
    "9gb": { price: 45000 }, "10gb": { price: 50000 }, "unlimited": { price: 100000 }
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

// --- API REGISTER ---
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, whatsapp, password } = req.body; 
        const isExist = await Reseller.findOne({ email });
        if(isExist) return res.status(400).json({ message: 'Email sudah terdaftar, Cok!' });

        const newReseller = new Reseller({ 
            name, email, whatsapp, password, 
            telegram: 'Belum Terhubung', 
            status: 'pending',
            saldo: 0
        });
        const savedUser = await newReseller.save();

        res.status(201).json({ message: 'Akun terdaftar.', userId: savedUser._id.toString(), botUsername: process.env.BOT_USERNAME });
    } catch (error) { res.status(500).json({ message: 'Gagal daftar! Server error.' }); }
});

// --- API LOGIN ---
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await Reseller.findOne({ email });
        
        if (!user) return res.status(400).json({ message: 'Email belum terdaftar, Cok!' });
        if (user.password !== password) return res.status(400).json({ message: 'Password salah, Cok!' });
        if (user.status === 'pending') return res.status(200).json({ verified: false, message: 'Akun belum diverifikasi oleh Admin via WA!' });
        if (user.status === 'rejected') return res.status(400).json({ message: 'Pendaftaran ditolak Admin.' });
        
        res.status(200).json({ 
            verified: true, 
            message: 'Login sukses! Mengalihkan...',
            userData: {
                id: user._id, name: user.name, email: user.email, whatsapp: user.whatsapp, 
                telegram: user.telegram, status: user.status, saldo: user.saldo || 0
            }
        });
    } catch (error) { res.status(500).json({ message: 'Server error pas login!' }); }
});

// --- API GENERATE QRIS SAKTI (UDAH GAK KAKU LAGI) ---
app.post('/api/generate-qris', async (req, res) => {
    const plan_id = req.body.plan_id || req.body.plan_key || 'UNKNOWN'; 
    const customAmount = req.body.custom_amount;

    try {
        let nominal = 0;

        // JALUR 1: Kalau ada nominal (Dari Deposit Dashboard), langsung gas buatin QRIS! Gak usah mikirin data paket.
        if (customAmount && parseInt(customAmount) >= 1000) {
            nominal = parseInt(customAmount);
        } 
        // JALUR 2: Kalau nominal gak ada (Dari Checkout), baru kita cek harga paketnya.
        else {
            if (!plans[plan_id]) {
                return res.status(400).json({ success: false, error: "Paket tidak valid atau harga tidak ditemukan." });
            }
            nominal = plans[plan_id].price;
        }

        // Generate QRIS via SDK Zakkistore
        const qrisData = await zakki.createQris(nominal, 0); 
        const topup_id = Date.now().toString() + Math.floor(Math.random()*1000);

        res.status(200).json({ 
            success: true, 
            qr_url: qrisData.qr_url, 
            topup_id: topup_id, 
            real_price: nominal 
        });

    } catch (error) {
        res.status(500).json({ success: false, error: "Gagal membuat QRIS dari server." });
    }
});

// --- API WEBHOOK CEK PEMBAYARAN ---
app.post('/api/webhook', async (req, res) => {
    const { plan_key, topup_id, user_id, username, password } = req.body;

    try {
        const checkPayment = await zakki.cekStatus(topup_id); 

        if (checkPayment.status === "LUNAS" || checkPayment.status === "PAID") {
            // Kalau ini webhook dari deposit
            if (plan_key === "deposit_saldo" || plan_key.startsWith("DEP_")) {
                if (user_id) {
                    await Reseller.findByIdAndUpdate(user_id, { $inc: { saldo: 10000 } }); // Nominal bisa lu ubah dinamis nanti
                }
                return res.status(200).json({ success: true, message: "Saldo berhasil ditambahkan." });
            }
            // Kalau ini webhook dari beli Ptero
            else {
                return res.status(200).json({ 
                    success: true, 
                    data_akun: { username: username || "fagem", password: password || "123", login_url: "https://panel.fahmihost.com" } 
                });
            }
        } else {
            return res.status(400).json({ success: false, error: "Pembayaran belum lunas." });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: "Kesalahan sistem webhook." });
    }
});

// --- WEBHOOK TELEGRAM UTAMA ---
app.post('/api/tele-webhook', async (req, res) => {
    const { message, callback_query } = req.body;
    const VERIF_TOKEN = process.env.VERIF_BOT_TOKEN;
    const ADMIN_CHAT_ID = process.env.VERIF_CHAT_ID;

    if (message && message.text && message.text.startsWith('/start')) {
        const chatId = message.chat.id;
        const username = message.chat.username ? `@${message.chat.username}` : 'Tidak Ada Username';
        const userId = message.text.split(' ')[1]; 

        if (userId) {
            try {
                const user = await Reseller.findById(userId);
                if (user) {
                    const dataTele = `ID: ${chatId} | ${username}`;
                    await Reseller.findByIdAndUpdate(userId, { telegram: dataTele });

                    await axios.post(`https://api.telegram.org/bot${VERIF_TOKEN}/sendMessage`, { chat_id: chatId, text: `✅ *Berhasil Terhubung!*\n\nHalo ${user.name}, pengajuan akun kamu sedang di-review Admin.`, parse_mode: 'Markdown' });

                    const pesanAdmin = `🚨 *PENDAFTARAN RESELLER BARU* 🚨\n\n👤 *Nama:* ${user.name}\n📧 *Email:* ${user.email}\n📱 *WA:* ${user.whatsapp}\n✈️ *Telegram:* ${dataTele}`;
                    await axios.post(`https://api.telegram.org/bot${VERIF_TOKEN}/sendMessage`, { chat_id: ADMIN_CHAT_ID, text: pesanAdmin, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "✅ ACC", callback_data: `ACC_${user.email}` }, { text: "❌ TOLAK", callback_data: `TOLAK_${user.email}` }]] } });
                }
            } catch (err) {}
        }
    }

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
                if (userUpdated && userUpdated.telegram !== 'Belum Terhubung') {
                    const userTeleId = userUpdated.telegram.split(' | ')[0].replace('ID: ', '');
                    await axios.post(`https://api.telegram.org/bot${VERIF_TOKEN}/sendMessage`, { chat_id: userTeleId, text: `🎉 *SELAMAT!* Akun Reseller kamu telah di-ACC Admin.`, parse_mode: 'Markdown' });
                }
            } else if (action === 'TOLAK') {
                await Reseller.findOneAndUpdate({ email: emailTarget }, { status: 'rejected' });
                responseText = `❌ Pendaftaran ${emailTarget} ditolak.`;
            }
            await axios.post(`https://api.telegram.org/bot${VERIF_TOKEN}/answerCallbackQuery`, { callback_query_id: callback_query.id, text: responseText });
            await axios.post(`https://api.telegram.org/bot${VERIF_TOKEN}/editMessageText`, { chat_id: adminChatId, message_id: messageId, text: `${callback_query.message.text}\n\n*STATUS:* ${responseText}`, parse_mode: 'Markdown' });
        } catch (error) {}
    }
    res.status(200).send('OK');
});

module.exports = app;
