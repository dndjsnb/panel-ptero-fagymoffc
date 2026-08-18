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
    saldo: { type: Number, default: 0 } 
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
        
        if (user.status === 'suspended') return res.status(403).json({ message: 'Akun lu lagi dibekukan sama Owner!' });
        
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

// --- API GENERATE QRIS SAKTI ---
app.post('/api/generate-qris', async (req, res) => {
    const plan_id = req.body.plan_id || req.body.plan_key || 'UNKNOWN'; 
    const customAmount = req.body.custom_amount;

    try {
        let nominal = 0;
        if (customAmount && parseInt(customAmount) >= 1000) {
            nominal = parseInt(customAmount);
        } else {
            if (!plans[plan_id]) return res.status(400).json({ success: false, error: "Paket tidak valid atau harga tidak ditemukan." });
            nominal = plans[plan_id].price;
        }

        const qrisData = await zakki.createQris(nominal, 0); 
        const topup_id = Date.now().toString() + Math.floor(Math.random()*1000);

        res.status(200).json({ success: true, qr_url: qrisData.qr_url, topup_id: topup_id, real_price: nominal });
    } catch (error) { res.status(500).json({ success: false, error: "Gagal membuat QRIS dari server." }); }
});

// --- API WEBHOOK CEK PEMBAYARAN & KIRIM TESTIMONI ---
app.post('/api/webhook', async (req, res) => {
    const { plan_key, topup_id, user_id, username, password } = req.body;

    try {
        const checkPayment = await zakki.cekStatus(topup_id); 

        if (checkPayment.status === "LUNAS" || checkPayment.status === "PAID") {
            const BOT_TOKEN = process.env.BOT_TOKEN;
            const TESTI_CHAT_ID = process.env.TESTI_CHAT_ID;
            
            if (BOT_TOKEN && TESTI_CHAT_ID) {
                const teleMessage = `🚀 *Pesanan Berhasil!*\n\n👤 *User:* ${username || 'Fahmi'}\n📦 *Paket:* ${plan_key || 'Custom'}\n⚡ *Status:* LUNAS / Aktif`;
                try {
                    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { chat_id: TESTI_CHAT_ID, text: teleMessage, parse_mode: 'Markdown' });
                } catch (teleErr) {}
            }

            const PTERO_BOT_URL = process.env.PTERO_BOT_URL;
            if (PTERO_BOT_URL) {
                try {
                    await axios.post(PTERO_BOT_URL, { username: username || 'Fahmi', plan_key: plan_key || 'Custom', topup_id: topup_id, status: 'LUNAS' });
                } catch (waErr) {}
            }

            if (plan_key === "deposit_saldo" || plan_key.startsWith("DEP_")) {
                if (user_id) await Reseller.findByIdAndUpdate(user_id, { $inc: { saldo: 10000 } }); 
                return res.status(200).json({ success: true, message: "Saldo berhasil ditambahkan." });
            } else {
                return res.status(200).json({ success: true, data_akun: { username: username || "fagem", password: password || "123", login_url: "https://panel.fahmihost.com" } });
            }
        } else {
            return res.status(400).json({ success: false, error: "Pembayaran belum lunas." });
        }
    } catch (error) { res.status(500).json({ success: false, error: "Kesalahan sistem webhook." }); }
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

// --- FITUR ADMIN BOT WEBHOOK (TERINTEGRASI) ---
const botToken = process.env.ADMIN_BOT_TOKEN || 'TARUH_TOKEN_BOT_ADMIN_DI_SINI';
const ADMIN_ID = 8521019587;

const sendAdminMessage = async (chatId, text) => {
    try {
        await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            chat_id: chatId,
            text: text,
            parse_mode: 'Markdown'
        });
    } catch (error) {
        console.error('Gagal ngirim pesan admin bot:', error.message);
    }
};

app.post('/api/admin-webhook', async (req, res) => {
    try {
        const update = req.body;

        if (!update || !update.message || !update.message.text) {
            return res.status(200).send('Bukan pesan teks');
        }

        const msg = update.message;
        const chatId = msg.chat.id;
        const fromId = msg.from.id;
        const text = msg.text.trim();

        if (fromId !== ADMIN_ID) {
            await sendAdminMessage(chatId, '⛔ Akses ditolak! Bot ini khusus buat owner.');
            return res.status(200).send('Akses ditolak');
        }

        const args = text.split(' ');
        const command = args[0].toLowerCase();

        if (['/start', '/menu', '/help'].includes(command)) {
            const menu = `
🛠️ *PANEL KONTROL RESELLER* 🛠️

/list - Lihat semua akun reseller
/cek <email> - Cek detail satu akun
/suspend <email> - Bekukan akun (Non-aktif)
/aktif <email> - Aktifkan kembali akun
/del <email> - Hapus akun permanen
            `;
            await sendAdminMessage(chatId, menu);
        } 
        else if (command === '/list') {
            const users = await Reseller.find({});
            if (users.length === 0) {
                await sendAdminMessage(chatId, '📂 Belum ada akun reseller yang terdaftar.');
            } else {
                let pesan = '📋 *DAFTAR AKUN RESELLER:*\n\n';
                users.forEach((user, index) => {
                    const status = user.status === 'suspended' ? '🔴 Suspended' : (user.status === 'verified' ? '🟢 Aktif' : '🟡 ' + user.status);
                    pesan += `${index + 1}. *${user.name}* (${user.email}) | ${status}\n`;
                });
                await sendAdminMessage(chatId, pesan);
            }
        } 
        else if (command === '/cek') {
            if (args.length < 2) return sendAdminMessage(chatId, '⚠️ Format: /cek <email>');
            const user = await Reseller.findOne({ email: args[1] });
            
            if (!user) {
                await sendAdminMessage(chatId, `❌ Akun dengan email *${args[1]}* tidak ditemukan.`);
            } else {
                const detail = `
🔍 *DETAIL AKUN RESELLER* 🔍
Nama: ${user.name}
Email: ${user.email}
WA: ${user.whatsapp}
Saldo: ${user.saldo || 0}
Status: ${user.status}
Telegram: ${user.telegram}
                `;
                await sendAdminMessage(chatId, detail);
            }
        } 
        else if (command === '/suspend') {
            if (args.length < 2) return sendAdminMessage(chatId, '⚠️ Format: /suspend <email>');
            const result = await Reseller.updateOne({ email: args[1] }, { $set: { status: 'suspended' } });
            
            if (result.modifiedCount === 1) await sendAdminMessage(chatId, `✅ Akun *${args[1]}* berhasil dibekukan.`);
            else await sendAdminMessage(chatId, `❌ Gagal suspend. Akun tidak ditemukan atau sudah tersuspend.`);
        } 
        else if (command === '/aktif') {
            if (args.length < 2) return sendAdminMessage(chatId, '⚠️ Format: /aktif <email>');
            const result = await Reseller.updateOne({ email: args[1] }, { $set: { status: 'verified' } });
            
            if (result.modifiedCount === 1) await sendAdminMessage(chatId, `✅ Akun *${args[1]}* diaktifkan kembali.`);
            else await sendAdminMessage(chatId, `❌ Gagal. Akun tidak ditemukan atau sudah aktif.`);
        } 
        else if (command === '/del') {
            if (args.length < 2) return sendAdminMessage(chatId, '⚠️ Format: /del <email>');
            const result = await Reseller.deleteOne({ email: args[1] });
            
            if (result.deletedCount === 1) await sendAdminMessage(chatId, `✅ Akun *${args[1]}* dihapus permanen.`);
            else await sendAdminMessage(chatId, `❌ Gagal. Email *${args[1]}* tidak ditemukan.`);
        }

        res.status(200).send('Webhook Admin Bot OK');
    } catch (err) {
        console.error(err);
        res.status(500).send('Something went wrong');
    }
});

// EXPORT APP VERCEL & URL MONGO
module.exports = app;
module.exports.mongoURI = mongoURI;
