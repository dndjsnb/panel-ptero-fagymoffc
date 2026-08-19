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

// SCHEMA RESELLER (UPDATE TAMBAH FITUR OTP)
const resellerSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    whatsapp: { type: String, required: true },
    telegram: { type: String, required: true },
    status: { type: String, default: 'pending' },
    saldo: { type: Number, default: 0 },
    ipAddress: { type: String, default: 'UNKNOWN' },
    hardwareId: { type: String, required: true },
    
    // --- FIELD BARU UNTUK OTP ---
    otp_code: { type: String, default: null },
    otp_expires: { type: Date, default: null },
    failed_otp_attempts: { type: Number, default: 0 },
    lockout_until: { type: Date, default: null }
});

const Reseller = mongoose.models.Reseller || mongoose.model('Reseller', resellerSchema);

// --- SCHEMA IP TRACKER (ANTI SPAM) ---
const ipSchema = new mongoose.Schema({
    ipAddress: { type: String, required: true, unique: true },
    registerCount: { type: Number, default: 0 },
    isBanned: { type: Boolean, default: false }
});

const IpTracker = mongoose.models.IpTracker || mongoose.model('IpTracker', ipSchema);

const plans = {
    "basic": { price: 5000 }, "standar": { price: 10000 }, "pro": { price: 15000 }, "advance": { price: 20000 },
    "1gb": { price: 5000 }, "2gb": { price: 10000 }, "3gb": { price: 15000 }, "4gb": { price: 20000 },
    "5gb": { price: 25000 }, "6gb": { price: 30000 }, "7gb": { price: 35000 }, "8gb": { price: 40000 },
    "9gb": { price: 45000 }, "10gb": { price: 50000 }, "unlimited": { price: 100000 }
};

// Urutan Penalti OTP: 30s, 1m, 3m, 9m, 30m, 1h
const penaltyTimes = [
    30 * 1000, 60 * 1000, 3 * 60 * 1000, 9 * 60 * 1000, 30 * 60 * 1000, 60 * 60 * 1000
];

const zakki = new ZakkiStore({
    baseUrl: 'https://qris.zakki.store',
    token: process.env.ZAKKI_TOKEN,
    iduser: process.env.ZAKKI_IDUSER,
    email: process.env.ZAKKI_EMAIL,
    pin: process.env.ZAKKI_PIN || '123456',
    autoWithdraw: true
});

app.post('/api/register', async (req, res) => {
    try {
        const { name, email, whatsapp, password, hardwareId } = req.body; 
        const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'IP_TIDAK_DIKETAHUI';
        
        let ipRecord = await IpTracker.findOne({ ipAddress: clientIp });
        if (!ipRecord) ipRecord = new IpTracker({ ipAddress: clientIp, registerCount: 0, isBanned: false });
        if (ipRecord.isBanned) return res.status(403).json({ message: 'Akses Ditolak! IP Jaringan ini diblokir karena terindikasi spam.' });
        
        if (!hardwareId) return res.status(400).json({ message: 'Akses Ditolak! Hardware ID tidak valid. Gunakan browser resmi.' });
        const deviceExist = await Reseller.findOne({ hardwareId: hardwareId });
        if (deviceExist) return res.status(403).json({ message: 'Akses Ditolak! HP/Perangkat ini sudah digunakan untuk membuat akun.' });

        const isExist = await Reseller.findOne({ $or: [{ email: email }, { whatsapp: whatsapp }] });
        if(isExist) return res.status(400).json({ message: 'Email atau Nomor WA sudah pernah didaftarkan!' });

        const newReseller = new Reseller({ 
            name, email, whatsapp, password, telegram: 'Belum Terhubung', status: 'pending', saldo: 0, 
            ipAddress: clientIp, hardwareId: hardwareId 
        });
        const savedUser = await newReseller.save();

        ipRecord.registerCount += 1;
        let tambahanPesan = '';
        if (ipRecord.registerCount === 2) tambahanPesan = ' (Sisa 1x pendaftaran sebelum IP diblokir!)';
        else if (ipRecord.registerCount >= 3) { ipRecord.isBanned = true; tambahanPesan = ' (IP diblokir permanen untuk daftar berikutnya.)'; }
        await ipRecord.save();

        res.status(201).json({ message: 'Akun terdaftar.' + tambahanPesan, userId: savedUser._id.toString(), botUsername: process.env.BOT_USERNAME });
    } catch (error) { res.status(500).json({ message: 'Gagal daftar! Server error.' }); }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await Reseller.findOne({ email });
        if (!user) return res.status(400).json({ message: 'Email belum terdaftar, Cok!' });
        if (user.status === 'suspended') return res.status(403).json({ message: 'Akun lu lagi dibekukan!' });
        if (user.password !== password) return res.status(400).json({ message: 'Password salah!' });
        if (user.status === 'pending') return res.status(200).json({ verified: false, message: 'Akun belum diverifikasi Admin!' });
        if (user.status === 'rejected') return res.status(400).json({ message: 'Pendaftaran ditolak.' });
        
        res.status(200).json({ verified: true, message: 'Login sukses! Mengalihkan...', userData: { id: user._id, name: user.name, email: user.email, whatsapp: user.whatsapp, telegram: user.telegram, status: user.status, saldo: user.saldo || 0 } });
    } catch (error) { res.status(500).json({ message: 'Server error pas login!' }); }
});

// --- FITUR OTP: REQUEST KODE ---
app.post('/api/request-otp', async (req, res) => {
    try {
        const { userId } = req.body;
        const user = await Reseller.findById(userId);
        if (!user) return res.status(404).json({ message: "User tidak ditemukan!" });

        if (user.telegram === 'Belum Terhubung') {
            return res.status(400).json({ message: "Gagal request OTP! Lu harus hubungin akun ini ke Bot Telegram dulu, bro." });
        }

        const currentTime = new Date();

        if (user.lockout_until && currentTime < user.lockout_until) {
            const sisaWaktu = Math.ceil((user.lockout_until - currentTime) / 1000);
            return res.status(429).json({ message: `Sistem terkunci! Tunggu ${sisaWaktu} detik lagi buat request OTP.` });
        }

        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpires = new Date(Date.now() + 3 * 60 * 1000); 

        await Reseller.updateOne({ _id: userId }, { $set: { otp_code: otpCode, otp_expires: otpExpires } });

        const teleIdMatch = user.telegram.match(/ID: (\d+)/);
        if (teleIdMatch && teleIdMatch[1]) {
            // PAKAI TOKEN BOT KHUSUS OTP
            const OTP_TOKEN = process.env.OTP_BOT_TOKEN; 
            await axios.post(`https://api.telegram.org/bot${OTP_TOKEN}/sendMessage`, { 
                chat_id: teleIdMatch[1], 
                text: `🔐 *KODE OTP LU: ${otpCode}*\n\nKode ini berlaku selama *3 Menit*. Jangan kasih tau siapapun, Bro!`, 
                parse_mode: 'Markdown' 
            });
        }

        res.status(200).json({ message: "Kode OTP berhasil dikirim ke Telegram lu!" });
    } catch (error) { res.status(500).json({ message: "Server error pas request OTP!" }); }
});
// --- FITUR OTP: VERIFIKASI & UPDATE DATA ---
app.post('/api/verify-otp', async (req, res) => {
    try {
        const { userId, otp, newPassword, newWhatsapp, newEmail } = req.body;
        const user = await Reseller.findById(userId);
        if (!user) return res.status(404).json({ message: "User tidak ditemukan!" });

        const currentTime = new Date();

        if (user.lockout_until && currentTime < user.lockout_until) {
            const sisaWaktu = Math.ceil((user.lockout_until - currentTime) / 1000);
            return res.status(429).json({ message: `Sistem terkunci! Lu terlalu banyak masukin kode salah. Tunggu ${sisaWaktu} detik.` });
        }

        if (!user.otp_expires || currentTime > user.otp_expires) {
            return res.status(400).json({ message: "Kode OTP udah kedaluwarsa (lewat 3 menit). Silakan request ulang." });
        }

        if (otp !== user.otp_code) {
            let attempts = (user.failed_otp_attempts || 0) + 1;
            let penaltyIndex = Math.min(attempts - 1, penaltyTimes.length - 1);
            let penaltyDuration = penaltyTimes[penaltyIndex];
            let lockoutTime = new Date(currentTime.getTime() + penaltyDuration);
            
            await Reseller.updateOne({ _id: userId }, {
                $set: { failed_otp_attempts: attempts, lockout_until: lockoutTime }
            });

            return res.status(400).json({ message: `Kode OTP Salah! Lu kena penalti waktu ${penaltyDuration / 1000} detik.`, attempts_failed: attempts });
        }

        let updateData = { 
            failed_otp_attempts: 0, 
            lockout_until: null, 
            otp_code: null, 
            otp_expires: null 
        };
        
        if (newPassword) updateData.password = newPassword;
        if (newWhatsapp) updateData.whatsapp = newWhatsapp;
        if (newEmail) updateData.email = newEmail;

        await Reseller.updateOne({ _id: userId }, { $set: updateData });

        const teleIdMatch = user.telegram.match(/ID: (\d+)/);
        if (teleIdMatch && teleIdMatch[1]) {
            // PAKAI TOKEN BOT KHUSUS OTP
            const OTP_TOKEN = process.env.OTP_BOT_TOKEN; 
            await axios.post(`https://api.telegram.org/bot${OTP_TOKEN}/sendMessage`, { 
                chat_id: teleIdMatch[1], 
                text: `✅ *DATA BERHASIL DIUBAH!*\n\nData akun lu udah sukses di-update lewat website.`, 
                parse_mode: 'Markdown' 
            });
        }

        res.status(200).json({ message: "Mantap! Verifikasi OTP berhasil dan data sukses diubah." });
    } catch (error) { res.status(500).json({ message: "Server error pas verifikasi OTP!" }); }
});

app.post('/api/generate-qris', async (req, res) => {
    const plan_id = req.body.plan_id || req.body.plan_key || 'UNKNOWN'; 
    const customAmount = req.body.custom_amount;
    try {
        let nominal = 0;
        if (customAmount && parseInt(customAmount) >= 1000) nominal = parseInt(customAmount);
        else {
            if (!plans[plan_id]) return res.status(400).json({ success: false, error: "Paket tidak valid." });
            nominal = plans[plan_id].price;
        }
        const qrisData = await zakki.createQris(nominal, 0); 
        const topup_id = Date.now().toString() + Math.floor(Math.random()*1000);
        res.status(200).json({ success: true, qr_url: qrisData.qr_url, topup_id: topup_id, real_price: nominal });
    } catch (error) { res.status(500).json({ success: false, error: "Gagal bikin QRIS." }); }
});

app.post('/api/webhook', async (req, res) => {
    const { plan_key, topup_id, user_id, username, password } = req.body;
    try {
        const checkPayment = await zakki.cekStatus(topup_id); 
        if (checkPayment.status === "LUNAS" || checkPayment.status === "PAID") {
            const BOT_TOKEN = process.env.BOT_TOKEN;
            const TESTI_CHAT_ID = process.env.TESTI_CHAT_ID;
            if (BOT_TOKEN && TESTI_CHAT_ID) {
                try { await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { chat_id: TESTI_CHAT_ID, text: `  *Pesanan Berhasil!*\n\n  *User:* ${username || 'Fahmi'}\n  *Paket:* ${plan_key || 'Custom'}\n  *Status:* LUNAS`, parse_mode: 'Markdown' }); } catch (e) {}
            }
            const PTERO_BOT_URL = process.env.PTERO_BOT_URL;
            if (PTERO_BOT_URL) {
                try { await axios.post(PTERO_BOT_URL, { username: username || 'Fahmi', plan_key: plan_key || 'Custom', topup_id: topup_id, status: 'LUNAS' }); } catch (e) {}
            }
            if (plan_key === "deposit_saldo" || plan_key.startsWith("DEP_")) {
                if (user_id) await Reseller.findByIdAndUpdate(user_id, { $inc: { saldo: 10000 } }); 
                return res.status(200).json({ success: true, message: "Saldo ditambahkan." });
            } else {
                return res.status(200).json({ success: true, data_akun: { username: username || "fagem", password: password || "123", login_url: "https://panel.fahmihost.com" } });
            }
        } else { return res.status(400).json({ success: false, error: "Belum lunas." }); }
    } catch (error) { res.status(500).json({ success: false, error: "Webhook error." }); }
});

app.post('/api/tele-webhook', async (req, res) => {
    const { message, callback_query } = req.body;
    const VERIF_TOKEN = process.env.VERIF_BOT_TOKEN;
    const ADMIN_CHAT_ID = process.env.VERIF_CHAT_ID;

    if (message && message.text && message.text.startsWith('/start')) {
        const chatId = message.chat.id;
        const existing = await Reseller.findOne({ telegram: new RegExp(`ID: ${chatId}`) });
        if (existing) return res.status(200).send('OK');
        const username = message.chat.username ? `@${message.chat.username}` : 'No Username';
        const userId = message.text.split(' ')[1]; 
        if (userId) {
            try {
                const user = await Reseller.findById(userId);
                if (user) {
                    const dataTele = `ID: ${chatId} | ${username}`;
                    await Reseller.findByIdAndUpdate(userId, { telegram: dataTele });
                    await axios.post(`https://api.telegram.org/bot${VERIF_TOKEN}/sendMessage`, { chat_id: chatId, text: `  *Terhubung!*\nHalo ${user.name}, akun direview Admin.`, parse_mode: 'Markdown' });
                    
                    const msgAdmin = `  *RESELLER BARU*  \n\nNama: ${user.name}\nEmail: ${user.email}\nWA: ${user.whatsapp}\nTelegram: ${dataTele}\nHWID: \`${user.hardwareId || 'UNKNOWN'}\``;
                    await axios.post(`https://api.telegram.org/bot${VERIF_TOKEN}/sendMessage`, { chat_id: ADMIN_CHAT_ID, text: msgAdmin, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "  ACC", callback_data: `ACC_${user.email}` }, { text: "  TOLAK", callback_data: `TOLAK_${user.email}` }]] } });
                }
            } catch (err) {}
        }
    }

    if (callback_query) {
        const [action, emailTarget] = callback_query.data.split('_');
        try {
            let resTxt = "";
            if (action === 'ACC') {
                const userUp = await Reseller.findOneAndUpdate({ email: emailTarget }, { status: 'verified' }, { new: true });
                resTxt = `Akun ${emailTarget} di-ACC.`;
                if (userUp && userUp.telegram !== 'Belum Terhubung') {
                    const teleId = userUp.telegram.split(' | ')[0].replace('ID: ', '');
                    await axios.post(`https://api.telegram.org/bot${VERIF_TOKEN}/sendMessage`, { chat_id: teleId, text: `  *SELAMAT!* Akun di-ACC Admin.`, parse_mode: 'Markdown' });
                }
            } else if (action === 'TOLAK') {
                await Reseller.findOneAndUpdate({ email: emailTarget }, { status: 'rejected' });
                resTxt = `Pendaftaran ditolak.`;
            }
            await axios.post(`https://api.telegram.org/bot${VERIF_TOKEN}/answerCallbackQuery`, { callback_query_id: callback_query.id, text: resTxt });
            await axios.post(`https://api.telegram.org/bot${VERIF_TOKEN}/editMessageText`, { chat_id: callback_query.message.chat.id, message_id: callback_query.message.message_id, text: `${callback_query.message.text}\n\n*STATUS:* ${resTxt}`, parse_mode: 'Markdown' });
        } catch (e) {}
    }
    res.status(200).send('OK');
});

// --- FITUR ADMIN BOT WEBHOOK (TERINTEGRASI - FULL INLINE KEYBOARD) ---
const botToken = process.env.ADMIN_BOT_TOKEN || 'TARUH_TOKEN_BOT_ADMIN_DI_SINI';
const ADMIN_ID = 8521019587; 

const sendAdminMessage = async (chatId, text, replyMarkup = null) => {
    try {
        const payload = { chat_id: chatId, text: text, parse_mode: 'Markdown' };
        if (replyMarkup) payload.reply_markup = replyMarkup;
        await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, payload);
    } catch (e) {}
};

const editAdminMessage = async (chatId, messageId, text, replyMarkup = null) => {
    try {
        const payload = { chat_id: chatId, message_id: messageId, text: text, parse_mode: 'Markdown' };
        if (replyMarkup) payload.reply_markup = replyMarkup;
        await axios.post(`https://api.telegram.org/bot${botToken}/editMessageText`, payload);
    } catch (e) {}
};

const answerCallback = async (callbackId, text = "", showAlert = false) => {
    try { await axios.post(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, { callback_query_id: callbackId, text: text, show_alert: showAlert }); } catch (e) {}
};

app.post('/api/admin-webhook', async (req, res) => {
    try {
        const update = req.body;

        if (update.callback_query) {
            const cb = update.callback_query;
            const chatId = cb.message.chat.id;
            const messageId = cb.message.message_id;
            const data = cb.data; 
            const fromId = cb.from.id;

            if (fromId !== ADMIN_ID) {
                await answerCallback(cb.id, '🚫 Akses ditolak! Cuma Owner.', true);
                return res.status(200).send('Akses ditolak');
            }

            if (data === 'MENU_UTAMA') {
                const mkup = { inline_keyboard: [[{ text: "📋 Lihat Daftar Reseller", callback_data: "LIST_RESELLER" }], [{ text: "🌐 Monitor Keamanan & IP", callback_data: "MENU_IP" }]] };
                await editAdminMessage(chatId, messageId, `🛠️ *PANEL KONTROL RESELLER* 🛠️\n\nPilih menu:`, mkup);
                await answerCallback(cb.id);
            }
            else if (data === 'MENU_IP') {
                const mkup = { inline_keyboard: [[{ text: "🚫 IP Diblokir (Spam)", callback_data: "IP_BANNED" }], [{ text: "⏳ IP & HWID Pending", callback_data: "IP_PENDING" }], [{ text: "✅ IP & HWID Verified", callback_data: "IP_VERIFIED" }], [{ text: "🔙 Kembali", callback_data: "MENU_UTAMA" }]] };
                await editAdminMessage(chatId, messageId, `🌐 *MONITOR JARINGAN & HWID* 🌐\nPilih kategori:`, mkup);
                await answerCallback(cb.id);
            }
            else if (data === 'IP_BANNED') {
                const ips = await IpTracker.find({ isBanned: true });
                if (ips.length === 0) {
                    await editAdminMessage(chatId, messageId, "🚫 *IP DIBLOKIR:*\n\nAman Bos.", { inline_keyboard: [[{ text: "🔙 Kembali", callback_data: "MENU_IP" }]] });
                } else {
                    const kb = ips.map(ip => { return [{ text: `🟢 Unban: ${ip.ipAddress} (${ip.registerCount}x)`, callback_data: `UNBAN_${ip.ipAddress}` }]; });
                    kb.push([{ text: "🔙 Kembali", callback_data: "MENU_IP" }]);
                    await editAdminMessage(chatId, messageId, "🚫 *IP DIBLOKIR:*\n_Klik IP untuk Unban._", { inline_keyboard: kb });
                }
                await answerCallback(cb.id);
            }
            else if (data.startsWith('UNBAN_')) {
                const ipTarget = data.replace('UNBAN_', '');
                await IpTracker.updateOne({ ipAddress: ipTarget }, { $set: { isBanned: false, registerCount: 0 } });
                await answerCallback(cb.id, `✅ IP ${ipTarget} di-Unban!`, true);
                await editAdminMessage(chatId, messageId, `✅ IP \`${ipTarget}\` direset.`, { inline_keyboard: [[{ text: "🔙 Cek Blokir Lain", callback_data: "IP_BANNED" }]] });
            }
            else if (data === 'IP_PENDING') {
                const users = await Reseller.find({ status: 'pending' });
                let txt = `⏳ *MONITOR AKUN PENDING:*\n\n`;
                if (users.length === 0) txt += "Kosong."; else { 
                    users.forEach((u, i) => { 
                        txt += `${i+1}. *${u.name}*\n   IP: \`${u.ipAddress || 'UNKNOWN'}\`\n   HWID: \`${u.hardwareId || 'UNKNOWN'}\`\n\n`; 
                    }); 
                }
                await editAdminMessage(chatId, messageId, txt, { inline_keyboard: [[{ text: "🔙 Kembali", callback_data: "MENU_IP" }]] });
                await answerCallback(cb.id);
            }
            else if (data === 'IP_VERIFIED') {
                const users = await Reseller.find({ status: 'verified' });
                let txt = `✅ *MONITOR AKUN VERIFIED:*\n\n`;
                if (users.length === 0) txt += "Kosong."; else { 
                    users.forEach((u, i) => { 
                        txt += `${i+1}. *${u.name}*\n   IP: \`${u.ipAddress || 'UNKNOWN'}\`\n   HWID: \`${u.hardwareId || 'UNKNOWN'}\`\n\n`; 
                    }); 
                }
                await editAdminMessage(chatId, messageId, txt, { inline_keyboard: [[{ text: "🔙 Kembali", callback_data: "MENU_IP" }]] });
                await answerCallback(cb.id);
            }
            else if (data === 'LIST_RESELLER') {
                const users = await Reseller.find({});
                if (users.length === 0) {
                    await editAdminMessage(chatId, messageId, "📭 *Belum ada akun.*", { inline_keyboard: [[{ text: "🔙 Kembali", callback_data: "MENU_UTAMA" }]] });
                } else {
                    const kb = users.map(u => {
                        let ikon = u.status === 'verified' ? '✅' : (u.status === 'suspended' ? '🚫' : (u.status === 'rejected' ? '❌' : '⏳'));
                        return [{ text: `${ikon} ${u.name} - ${u.status.toUpperCase()}`, callback_data: `CEK_${u.email}` }];
                    });
                    kb.push([{ text: "🔙 Kembali", callback_data: "MENU_UTAMA" }]);
                    await editAdminMessage(chatId, messageId, "📋 *PILIH AKUN:*", { inline_keyboard: kb });
                }
                await answerCallback(cb.id);
            }
            else if (data.startsWith('CEK_') || data.startsWith('SUSPEND_') || data.startsWith('AKTIF_')) {
                let email = '';
                if(data.startsWith('CEK_')) email = data.replace('CEK_', '');
                if(data.startsWith('SUSPEND_')) { email = data.replace('SUSPEND_', ''); await Reseller.updateOne({ email }, { $set: { status: 'suspended' } }); await answerCallback(cb.id, `Suspend: ${email}`, true); }
                if(data.startsWith('AKTIF_')) { email = data.replace('AKTIF_', ''); await Reseller.updateOne({ email }, { $set: { status: 'verified' } }); await answerCallback(cb.id, `Aktif: ${email}`, true); }

                const user = await Reseller.findOne({ email });
                if (!user) {
                    await editAdminMessage(chatId, messageId, `🔍 Akun \`${email}\` tidak ditemukan.`, { inline_keyboard: [[{ text: "🔙 Kembali", callback_data: "LIST_RESELLER" }]] });
                } else {
                    let ikon = user.status === 'verified' ? '✅' : (user.status === 'suspended' ? '🚫' : (user.status === 'rejected' ? '❌' : '⏳'));
                    
                    const txt = `👤 *DETAIL AKUN* 👤\n━━━━━━━━━━━━━━━━━━\n🔹 *Nama*: ${user.name}\n🔹 *Email*: \`${user.email}\`\n🔹 *WA*: \`${user.whatsapp}\`\n🔹 *IP*: \`${user.ipAddress}\`\n🔹 *HWID*: \`${user.hardwareId}\`\n🔹 *Saldo*: Rp ${user.saldo}\n🔹 *Tele*: ${user.telegram}\n\n📊 *STATUS*: ${ikon} *${user.status.toUpperCase()}*\n━━━━━━━━━━━━━━━━━━`;
                    const mkup = { inline_keyboard: [[{ text: "✅ Aktif", callback_data: `AKTIF_${user.email}` }, { text: "🚫 Suspend", callback_data: `SUSPEND_${user.email}` }], [{ text: "🗑️ Hapus", callback_data: `DELCONFIRM_${user.email}` }], [{ text: "🔙 Kembali", callback_data: "LIST_RESELLER" }]] };
                    await editAdminMessage(chatId, messageId, txt, mkup);
                }
                if(data.startsWith('CEK_')) await answerCallback(cb.id);
            }
            else if (data.startsWith('DELCONFIRM_')) {
                const email = data.replace('DELCONFIRM_', '');
                await editAdminMessage(chatId, messageId, `⚠️ Yakin hapus \`${email}\`?`, { inline_keyboard: [[{ text: "✔️ Ya, Hapus!", callback_data: `DEL_${email}` }, { text: "❌ Batal", callback_data: `CEK_${email}` }]] });
                await answerCallback(cb.id);
            }
            else if (data.startsWith('DEL_')) {
                const email = data.replace('DEL_', '');
                await Reseller.deleteOne({ email });
                await answerCallback(cb.id, `Dihapus: ${email}`, true);
                await editAdminMessage(chatId, messageId, `✅ Akun \`${email}\` dihapus.`, { inline_keyboard: [[{ text: "🔙 Kembali", callback_data: "LIST_RESELLER" }]] });
         }
            return res.status(200).send('OK');
        }

        if (!update || !update.message || !update.message.text) return res.status(200).send('Bukan teks');

        const msg = update.message;
        const chatId = msg.chat.id;
        if (msg.from.id !== ADMIN_ID) {
            await sendAdminMessage(chatId, '🚫 Akses ditolak!');
            return res.status(200).send('Akses ditolak');
        }

        const cmd = msg.text.trim().split(' ')[0].toLowerCase();
        if (['/start', '/menu', '/help', '/panel'].includes(cmd)) {
            const mkup = { inline_keyboard: [[{ text: "📋 Lihat Daftar Reseller", callback_data: "LIST_RESELLER" }], [{ text: "🌐 Monitor Keamanan & IP", callback_data: "MENU_IP" }]] };
            await sendAdminMessage(chatId, `🛠️ *PANEL KONTROL RESELLER* 🛠️\n\nPilih menu:`, mkup);
        } else {
             await sendAdminMessage(chatId, 'Gunakan /menu Bos! 🚀');
        }

        res.status(200).send('OK');
    } catch (err) { res.status(500).send('Error'); }
});

module.exports = app;
module.exports.mongoURI = mongoURI;
