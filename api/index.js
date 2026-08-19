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

// --- SCHEMA IP TRACKER (ANTI SPAM) ---
const ipSchema = new mongoose.Schema({
    ipAddress: { type: String, required: true, unique: true },
    registerCount: { type: Number, default: 0 },
    isBanned: { type: Boolean, default: false }
});

const IpTracker = mongoose.model('IpTracker', ipSchema);

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

// --- API REGISTER (WITH IP ANTI-SPAM) ---
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, whatsapp, password } = req.body; 
        
        // 1. Dapatkan IP Address User
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'IP_TIDAK_DIKETAHUI';
        
        // 2. Cek Riwayat IP di Database
        let ipRecord = await IpTracker.findOne({ ipAddress: clientIp });
        
        if (!ipRecord) {
            ipRecord = new IpTracker({ ipAddress: clientIp, registerCount: 0, isBanned: false });
        }

        // 3. TOLAK MENTAH-MENTAH JIKA IP SUDAH BANNED (Data tidak akan masuk ke schema Reseller)
        if (ipRecord.isBanned) {
            return res.status(403).json({ message: 'Akses Ditolak! IP Jaringan ini telah diblokir permanen karena terindikasi spam.' });
        }
        
        // Cek duplikat email ATAU nomor WA sekaligus
        const isExist = await Reseller.findOne({ 
            $or: [{ email: email }, { whatsapp: whatsapp }] 
        });
        
        if(isExist) return res.status(400).json({ message: 'Email atau Nomor WA sudah pernah didaftarkan. Anda tidak bisa mendaftar lagi!' });

        // 4. Jika aman, simpan Reseller Baru
        const newReseller = new Reseller({ 
            name, email, whatsapp, password, 
            telegram: 'Belum Terhubung', 
            status: 'pending',
            saldo: 0
        });
        const savedUser = await newReseller.save();

        // 5. Update Hitungan & Status IP
        ipRecord.registerCount += 1;
        let tambahanPesan = '';

        if (ipRecord.registerCount === 2) {
            tambahanPesan = ' (PERINGATAN: Sisa 1x pendaftaran lagi sebelum IP Anda diblokir!)';
        } else if (ipRecord.registerCount >= 3) {
            ipRecord.isBanned = true; // Eksekusi Banned untuk percobaan berikutnya
            tambahanPesan = ' (BATAS MAKSIMAL! IP Anda sekarang diblokir permanen untuk pendaftaran berikutnya.)';
        }
        
        await ipRecord.save();

        res.status(201).json({ message: 'Akun terdaftar.' + tambahanPesan, userId: savedUser._id.toString(), botUsername: process.env.BOT_USERNAME });
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
                const teleMessage = ` *Pesanan Berhasil!*\n\n *User:* ${username || 'Fahmi'}\n *Paket:* ${plan_key || 'Custom'}\n *Status:* LUNAS / Aktif`;
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

        const existingTeleUser = await Reseller.findOne({ telegram: new RegExp(`ID: ${chatId}`) });
        
        if (existingTeleUser) {
            return res.status(200).send('OK');
        }

        const username = message.chat.username ? `@${message.chat.username}` : 'Tidak Ada Username';
        const userId = message.text.split(' ')[1]; 

        if (userId) {
            try {
                const user = await Reseller.findById(userId);
                if (user) {
                    const dataTele = `ID: ${chatId} | ${username}`;
                    await Reseller.findByIdAndUpdate(userId, { telegram: dataTele });

                    await axios.post(`https://api.telegram.org/bot${VERIF_TOKEN}/sendMessage`, { chat_id: chatId, text: ` *Berhasil Terhubung!*\n\nHalo ${user.name}, pengajuan akun kamu sedang di-review Admin.`, parse_mode: 'Markdown' });

                    const pesanAdmin = ` *PENDAFTARAN RESELLER BARU* \n\n *Nama:* ${user.name}\n *Email:* ${user.email}\n *WA:* ${user.whatsapp}\n *Telegram:* ${dataTele}`;
                    await axios.post(`https://api.telegram.org/bot${VERIF_TOKEN}/sendMessage`, { chat_id: ADMIN_CHAT_ID, text: pesanAdmin, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: " ACC", callback_data: `ACC_${user.email}` }, { text: " TOLAK", callback_data: `TOLAK_${user.email}` }]] } });
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
                responseText = ` Akun ${emailTarget} berhasil di-ACC.`;
                if (userUpdated && userUpdated.telegram !== 'Belum Terhubung') {
                    const userTeleId = userUpdated.telegram.split(' | ')[0].replace('ID: ', '');
                    await axios.post(`https://api.telegram.org/bot${VERIF_TOKEN}/sendMessage`, { chat_id: userTeleId, text: ` *SELAMAT!* Akun Reseller kamu telah di-ACC Admin.`, parse_mode: 'Markdown' });
                }
            } else if (action === 'TOLAK') {
                await Reseller.findOneAndUpdate({ email: emailTarget }, { status: 'rejected' });
                responseText = ` Pendaftaran ${emailTarget} ditolak.`;
            }
            await axios.post(`https://api.telegram.org/bot${VERIF_TOKEN}/answerCallbackQuery`, { callback_query_id: callback_query.id, text: responseText });
            await axios.post(`https://api.telegram.org/bot${VERIF_TOKEN}/editMessageText`, { chat_id: adminChatId, message_id: messageId, text: `${callback_query.message.text}\n\n*STATUS:* ${responseText}`, parse_mode: 'Markdown' });
        } catch (error) {}
    }
    res.status(200).send('OK');
});

// --- FITUR ADMIN BOT WEBHOOK (TERINTEGRASI - FULL INLINE KEYBOARD) ---
const botToken = process.env.ADMIN_BOT_TOKEN || 'TARUH_TOKEN_BOT_ADMIN_DI_SINI';
const ADMIN_ID = 8521019587; // ID telegram kamu[span_1](start_span)[span_1](end_span)

// Fungsi helper kirim pesan teks biasa
const sendAdminMessage = async (chatId, text, replyMarkup = null) => {
    try {
        const payload = { chat_id: chatId, text: text, parse_mode: 'Markdown' };
        if (replyMarkup) payload.reply_markup = replyMarkup;
        await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, payload);
    } catch (error) { console.error('Gagal ngirim pesan admin bot:', error.message); }
};

// Fungsi helper edit pesan (untuk navigasi tombol)
const editAdminMessage = async (chatId, messageId, text, replyMarkup = null) => {
    try {
        const payload = { chat_id: chatId, message_id: messageId, text: text, parse_mode: 'Markdown' };
        if (replyMarkup) payload.reply_markup = replyMarkup;
        await axios.post(`https://api.telegram.org/bot${botToken}/editMessageText`, payload);
    } catch (error) { console.error('Gagal edit pesan admin bot:', error.message); }
};

// Fungsi helper untuk merespons klik tombol (biar gak loading terus di sisi Telegram)
const answerCallback = async (callbackId, text = "", showAlert = false) => {
    try {
        await axios.post(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
            callback_query_id: callbackId,
            text: text,
            show_alert: showAlert
        });
    } catch (error) {}
};

app.post('/api/admin-webhook', async (req, res) => {
    try {
        const update = req.body;

        // ==========================================
        // 1. PENANGANAN KLIK TOMBOL (CALLBACK QUERY)
        // ==========================================
        if (update.callback_query) {
            const cb = update.callback_query;
            const chatId = cb.message.chat.id;
            const messageId = cb.message.message_id;
            const data = cb.data; // Data tombol yang diklik (misal: "LIST", "CEK_email")
            const fromId = cb.from.id;

            // Proteksi: Cuma Owner yang bisa klik
            if (fromId !== ADMIN_ID) {
                await answerCallback(cb.id, '🚫 Akses ditolak! Cuma Owner yang bisa ngeklik.', true);
                return res.status(200).send('Akses ditolak');
            }

            // Aksi: KEMBALI KE MENU UTAMA
            if (data === 'MENU_UTAMA') {
                const textMenu = `🛠️ *PANEL KONTROL RESELLER* 🛠️\n\nHalo Bos! Pilih menu manajemen di bawah ini:`;
                const markup = { inline_keyboard: [[{ text: "📋 Lihat Daftar Reseller", callback_data: "LIST_RESELLER" }]] };
                await editAdminMessage(chatId, messageId, textMenu, markup);
                await answerCallback(cb.id);
            }
            
            // Aksi: TAMPILKAN LIST RESELLER
            else if (data === 'LIST_RESELLER') {
                const users = await Reseller.find({}); //[span_2](start_span)[span_2](end_span)
                if (users.length === 0) {
                    await editAdminMessage(chatId, messageId, "📭 *Belum ada akun reseller yang terdaftar.*", { inline_keyboard: [[{ text: "🔙 Kembali", callback_data: "MENU_UTAMA" }]] });
                } else {
                    const keyboard = users.map(u => {
                        let statusIkon = u.status === 'verified' ? '✅' : (u.status === 'suspended' ? '🚫' : '⏳');
                        return [{ text: `${statusIkon} ${u.name} - ${u.status.toUpperCase()}`, callback_data: `CEK_${u.email}` }];
                    });
                    keyboard.push([{ text: "🔙 Kembali ke Menu", callback_data: "MENU_UTAMA" }]);
                    
                    await editAdminMessage(chatId, messageId, "📋 *PILIH AKUN UNTUK DIKELOLA:*\n_Klik pada salah satu nama di bawah ini._", { inline_keyboard: keyboard });
                }
                await answerCallback(cb.id);
            }

            // Aksi: CEK DETAIL SATU AKUN
            else if (data.startsWith('CEK_')) {
                const email = data.replace('CEK_', '');
                const user = await Reseller.findOne({ email }); //[span_3](start_span)[span_3](end_span)
                
                if (!user) {
                    await editAdminMessage(chatId, messageId, `🔍 Akun dengan email \`${email}\` *tidak ditemukan*.`, { inline_keyboard: [[{ text: "🔙 Kembali ke Daftar", callback_data: "LIST_RESELLER" }]] });
                } else {
                    let statusIkon = user.status === 'verified' ? '✅' : (user.status === 'suspended' ? '🚫' : '⏳');
                    const textDetail = `👤 *DETAIL AKUN RESELLER* 👤\n━━━━━━━━━━━━━━━━━━\n🔹 *Nama*  : ${user.name}\n🔹 *Email* : \`${user.email}\`\n🔹 *WA*    : \`${user.whatsapp}\`\n🔹 *Saldo* : Rp ${user.saldo || 0}\n🔹 *Telegram*: ${user.telegram}\n\n📊 *STATUS*: ${statusIkon} *${user.status.toUpperCase()}*\n━━━━━━━━━━━━━━━━━━`;
                    
                    const markupDetail = {
                        inline_keyboard: [
                            [
                                { text: "✅ Aktifkan", callback_data: `AKTIF_${user.email}` },
                                { text: "🚫 Suspend", callback_data: `SUSPEND_${user.email}` }
                            ],
                            [{ text: "🗑️ Hapus Permanen", callback_data: `DELCONFIRM_${user.email}` }],
                            [{ text: "🔙 Kembali ke Daftar", callback_data: "LIST_RESELLER" }]
                        ]
                    };
                    await editAdminMessage(chatId, messageId, textDetail, markupDetail);
                }
                await answerCallback(cb.id);
            }

            // Aksi: SUSPEND AKUN
            else if (data.startsWith('SUSPEND_')) {
                const email = data.replace('SUSPEND_', '');
                await Reseller.updateOne({ email }, { $set: { status: 'suspended' } }); //[span_4](start_span)[span_4](end_span)
                await answerCallback(cb.id, `Berhasil Suspend: ${email}`, true);
                
                // Panggil ulang detail buat refresh UI
                const u = await Reseller.findOne({ email }); //[span_5](start_span)[span_5](end_span)
                const txt = `👤 *DETAIL AKUN RESELLER* 👤\n━━━━━━━━━━━━━━━━━━\n🔹 *Nama*  : ${u.name}\n🔹 *Email* : \`${u.email}\`\n🔹 *WA*    : \`${u.whatsapp}\`\n🔹 *Saldo* : Rp ${u.saldo || 0}\n🔹 *Telegram*: ${u.telegram}\n\n📊 *STATUS*: 🚫 *SUSPENDED*\n━━━━━━━━━━━━━━━━━━`;
                const mkup = { inline_keyboard: [[{ text: "✅ Aktifkan", callback_data: `AKTIF_${u.email}` }, { text: "🚫 Suspend", callback_data: `SUSPEND_${u.email}` }], [{ text: "🗑️ Hapus", callback_data: `DELCONFIRM_${u.email}` }], [{ text: "🔙 Kembali ke Daftar", callback_data: "LIST_RESELLER" }]] };
                await editAdminMessage(chatId, messageId, txt, mkup);
            }

            // Aksi: AKTIFKAN AKUN
            else if (data.startsWith('AKTIF_')) {
                const email = data.replace('AKTIF_', '');
                await Reseller.updateOne({ email }, { $set: { status: 'verified' } }); //[span_6](start_span)[span_6](end_span)
                await answerCallback(cb.id, `Berhasil Mengaktifkan: ${email}`, true);
                
                const u = await Reseller.findOne({ email }); //[span_7](start_span)[span_7](end_span)
                const txt = `👤 *DETAIL AKUN RESELLER* 👤\n━━━━━━━━━━━━━━━━━━\n🔹 *Nama*  : ${u.name}\n🔹 *Email* : \`${u.email}\`\n🔹 *WA*    : \`${u.whatsapp}\`\n🔹 *Saldo* : Rp ${u.saldo || 0}\n🔹 *Telegram*: ${u.telegram}\n\n📊 *STATUS*: ✅ *VERIFIED*\n━━━━━━━━━━━━━━━━━━`;
                const mkup = { inline_keyboard: [[{ text: "✅ Aktifkan", callback_data: `AKTIF_${u.email}` }, { text: "🚫 Suspend", callback_data: `SUSPEND_${u.email}` }], [{ text: "🗑️ Hapus", callback_data: `DELCONFIRM_${u.email}` }], [{ text: "🔙 Kembali ke Daftar", callback_data: "LIST_RESELLER" }]] };
                await editAdminMessage(chatId, messageId, txt, mkup);
            }

            // Aksi: KONFIRMASI HAPUS
            else if (data.startsWith('DELCONFIRM_')) {
                const email = data.replace('DELCONFIRM_', '');
                const textConfirm = `⚠️ *PERINGATAN!* ⚠️\nApakah kamu yakin ingin menghapus akun \`${email}\` secara permanen? Data tidak bisa dikembalikan.`;
                const markupConfirm = {
                    inline_keyboard: [
                        [
                            { text: "✔️ Ya, Hapus!", callback_data: `DEL_${email}` },
                            { text: "❌ Batal", callback_data: `CEK_${email}` }
                        ]
                    ]
                };
                await editAdminMessage(chatId, messageId, textConfirm, markupConfirm);
                await answerCallback(cb.id);
            }

            // Aksi: EKSEKUSI HAPUS
            else if (data.startsWith('DEL_')) {
                const email = data.replace('DEL_', '');
                await Reseller.deleteOne({ email }); //[span_8](start_span)[span_8](end_span)
                await answerCallback(cb.id, `Berhasil Dihapus: ${email}`, true);
                
                // Langsung kembali ke list karena akun sudah tidak ada
                const textHapus = `✅ Akun \`${email}\` telah sukses dihapus.`;
                const markupHapus = { inline_keyboard: [[{ text: "🔙 Kembali ke Daftar", callback_data: "LIST_RESELLER" }]] };
                await editAdminMessage(chatId, messageId, textHapus, markupHapus);
            }

            return res.status(200).send('Webhook Callback OK');
        }

        // ==========================================
        // 2. PENANGANAN PESAN TEKS (COMMAND)
        // ==========================================
        if (!update || !update.message || !update.message.text) {
            return res.status(200).send('Bukan pesan teks');
        }

        const msg = update.message;
        const chatId = msg.chat.id;
        const fromId = msg.from.id;
        const text = msg.text.trim();

        if (fromId !== ADMIN_ID) {
            await sendAdminMessage(chatId, '🚫 Akses ditolak! Bot ini khusus buat owner.');
            return res.status(200).send('Akses ditolak');
        }

        const command = text.split(' ')[0].toLowerCase();

        // Kalo dipanggil, kita kirim pesan dengan tombol
        if (['/start', '/menu', '/help', '/panel'].includes(command)) {
            const menuUtama = `🛠️ *PANEL KONTROL RESELLER* 🛠️\n\nHalo Bos! Pilih menu manajemen di bawah ini:`;
            const markupUtama = {
                inline_keyboard: [
                    [{ text: "📋 Lihat Daftar Reseller", callback_data: "LIST_RESELLER" }]
                ]
            };
            await sendAdminMessage(chatId, menuUtama, markupUtama);
        } else {
             // Fallback kalau ngetik perintah manual yang lama
             await sendAdminMessage(chatId, 'Gunakan /menu untuk membuka Panel Interaktif ya Bos! 🚀');
        }

        res.status(200).send('Webhook Teks Admin Bot OK');
    } catch (err) {
        console.error(err);
        res.status(500).send('Something went wrong');
    }
});

// EXPORT APP VERCEL & URL MONGO
module.exports = app;
module.exports.mongoURI = mongoURI;
