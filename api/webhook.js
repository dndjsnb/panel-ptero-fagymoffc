const axios = require('axios');
const path = require('path');
const { createCanvas, registerFont } = require('canvas');
const FormData = require('form-data');

// ==========================================
// REGISTER FONT MANUAL (ANTI KOTAK-KOTAK)
// Pastikan file font.ttf ada di sebelah webhook.js
// ==========================================
try {
    registerFont(path.join(__dirname, 'font.ttf'), { family: 'FahmiFont' });
} catch (error) {
    console.error("Waduh, file font.ttf nggak ketemu Bro!", error.message);
}

// ==========================================
// MODE DEMO: Ubah jadi false kalau web sudah mau dirilis ke pembeli!
// ==========================================
const DEMO_MODE = false; 

const plans = {
    "basic": { ram: 1024, disk: 5000, cpu: 100, name: "Paket 1GB Basic", price: "5.000" },
    "standar": { ram: 2048, disk: 10000, cpu: 150, name: "Paket 2GB Standar", price: "8.000" },
    "pro": { ram: 3072, disk: 15000, cpu: 200, name: "Paket 3GB Pro", price: "11.000" },
    "advance": { ram: 4096, disk: 20000, cpu: 250, name: "Paket 4GB Advance", price: "14.000" },
    "5gb": { ram: 5120, disk: 25000, cpu: 300, name: "Paket 5GB", price: "17.000" },
    "6gb": { ram: 6144, disk: 30000, cpu: 350, name: "Paket 6GB", price: "20.000" },
    "7gb": { ram: 7168, disk: 35000, cpu: 400, name: "Paket 7GB", price: "23.000" },
    "8gb": { ram: 8192, disk: 40000, cpu: 450, name: "Paket 8GB", price: "26.000" },
    "9gb": { ram: 9216, disk: 45000, cpu: 500, name: "Paket 9GB", price: "29.000" },
    "10gb": { ram: 10240, disk: 50000, cpu: 550, name: "Paket 10GB Max", price: "32.000" },
    "unlimited": { ram: 0, disk: 0, cpu: 0, name: "Paket Unlimited", price: "50.000" }
};

// ==========================================
// FUNGSI PEMBUAT STRUK GAMBAR ESTETIK
// ==========================================
async function generateReceiptImage(data) {
    const width = 800;
    const height = 950;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. Background Utama
    const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
    bgGradient.addColorStop(0, '#0a0f1d');
    bgGradient.addColorStop(1, '#030712');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    // 2. Card Pembungkus
    ctx.fillStyle = 'rgba(17, 24, 39, 0.75)';
    ctx.strokeStyle = 'rgba(75, 85, 99, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(50, 50, width - 100, height - 100, 24);
    ctx.fill();
    ctx.stroke();

    // 3. Header Toko
    ctx.textAlign = 'center';
    ctx.fillStyle = '#818cf8';
    ctx.font = 'bold 36px FahmiFont, sans-serif';
    ctx.fillText('FAHMI HOSTING', width / 2, 120);

    ctx.fillStyle = '#6b7280';
    ctx.font = '14px FahmiFont, sans-serif';
    ctx.fillText('— OFFICIAL STORE —', width / 2, 150);

    // Badge "PEMBELIAN PANEL"
    ctx.fillStyle = 'rgba(30, 41, 59, 0.9)';
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)';
    ctx.beginPath();
    ctx.roundRect(width / 2 - 160, 180, 320, 45, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#93c5fd';
    ctx.font = 'bold 14px FahmiFont, sans-serif';
    ctx.fillText('PEMBELIAN PANEL', width / 2, 208);

    // 4. Baris Informasi Struk
    const startY = 320;
    const spacing = 80;
    const items = [
        { label: 'PRODUK', value: data.productName.toUpperCase() },
        { label: 'USERNAME PANEL', value: data.username.toUpperCase() },
        { label: 'TOTAL', value: `Rp ${data.price}`, isPrice: true },
        { label: 'METODE', value: 'QRIS' },
        { label: 'PEMBELI', value: data.username.toUpperCase() },
        { label: 'WAKTU', value: data.time }
    ];

    items.forEach((item, index) => {
        const y = startY + (index * spacing);

        ctx.strokeStyle = 'rgba(55, 65, 81, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(90, y - 20);
        ctx.lineTo(width - 90, y - 20);
        ctx.stroke();

        ctx.textAlign = 'left';
        ctx.fillStyle = '#9ca3af';
        ctx.font = 'bold 14px FahmiFont, sans-serif';
        ctx.fillText(item.label, 90, y + 10);

        ctx.textAlign = 'right';
        ctx.fillStyle = item.isPrice ? '#34d399' : '#ffffff';
        ctx.font = item.isPrice ? 'bold 24px FahmiFont, sans-serif' : 'bold 18px FahmiFont, sans-serif';
        ctx.fillText(item.value, width - 90, y + 10);
    });

    // 5. Kotak Status Berhasil di Bagian Bawah
    const boxY = height - 190;
    ctx.fillStyle = 'rgba(6, 78, 59, 0.6)';
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.5)';
    ctx.beginPath();
    ctx.roundRect(90, boxY, width - 180, 75, 16);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 18px FahmiFont, sans-serif';
    ctx.fillText('✓  PEMBAYARAN BERHASIL', 125, boxY + 32);

    ctx.fillStyle = '#a7f3d0';
    ctx.font = '14px FahmiFont, sans-serif';
    ctx.fillText('Transaksi telah dikonfirmasi secara otomatis', 125, boxY + 56);

    return canvas.toBuffer('image/png');
}

// ==========================================
// FUNGSI UTAMA SERVERLESS (HANDLER)
// ==========================================
module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method salah' });

    try {
        const { plan_key, username, password, topup_id } = req.body;
        const plan = plans[plan_key];

        if (!plan || !topup_id || !username || !password) {
            return res.status(400).json({ success: false, error: 'Data tidak lengkap. Pastikan Username dan Password terisi.' });
        }

        const autoEmail = `${username.toLowerCase().replace(/\s+/g, '')}@petrofagem.com`;

        // ==========================================
        // TAHAP 1: CEK PEMBAYARAN KE ZAKKISTORE
        // ==========================================
        if (!DEMO_MODE) {
            try {
                const checkRes = await axios.get(`https://qris.zakki.store/cektopup`, {
                    params: { idtopup: topup_id }
                });

                if (!checkRes.data || checkRes.data.status !== 'found' || checkRes.data.data.status !== 'SUCCESS') {
                    return res.status(400).json({ success: false, error: '❌ Pembayaran belum lunas!' });
                }
            } catch (err) {
                return res.status(400).json({ success: false, error: '❌ Gagal verifikasi QRIS.' });
            }
        }

        // ==========================================
        // TAHAP 2: BIKIN AKUN PTERODACTYL
        // ==========================================
        if (!process.env.PTERO_URL || !process.env.PTERO_PTLA_KEY) {
            return res.status(500).json({ success: false, error: 'Sistem error: Panel belum siap.' });
        }

        let userId;
        try {
            const userRes = await axios.post(`${process.env.PTERO_URL}/api/application/users`, {
                email: autoEmail, username: username, first_name: username, last_name: "Customer", password: password, language: "en"
            }, {
                headers: { 'Authorization': `Bearer ${process.env.PTERO_PTLA_KEY}`, 'Content-Type': 'application/json' }
            });
            userId = userRes.data.attributes.id;
        } catch (err) {
            const errDetail = err.response?.data?.errors?.[0]?.detail || err.message;
            return res.status(500).json({ success: false, error: `Gagal daftar akun: ${errDetail}` });
        }

        // ==========================================
        // TAHAP 3: BIKIN SERVER PTERODACTYL & ROLLBACK
        // ==========================================
        try {
            await axios.post(`${process.env.PTERO_URL}/api/application/servers`, {
                name: `Bot-WA-${username}`,
                user: userId, egg: 15, docker_image: "ghcr.io/pterodactyl/yolks:nodejs_18",
                startup: "/usr/local/bin/node /home/container/index.js",
                environment: { MAIN_FILE: "index.js", AUTO_UPDATE: "0", USER_UPLOAD: "0", CMD_RUN: "npm start" },
                limits: { memory: plan.ram, swap: 0, disk: plan.disk, io: 500, cpu: plan.cpu },
                feature_limits: { databases: 1, allocations: 1, backups: 1 },
                allocation: { default: 1 }, deploy: { locations: [1], dedicated_ip: false, port_range: [] }
            }, {
                headers: { 'Authorization': `Bearer ${process.env.PTERO_PTLA_KEY}`, 'Content-Type': 'application/json' }
            });
        } catch (err) {
            try { 
                await axios.delete(`${process.env.PTERO_URL}/api/application/users/${userId}`, { 
                    headers: { 'Authorization': `Bearer ${process.env.PTERO_PTLA_KEY}` } 
                }); 
            } catch (e) {}
            const errDetail = err.response?.data?.errors?.[0]?.detail || err.message;
            return res.status(500).json({ success: false, error: `Gagal membuat server: ${errDetail}. (Rollback)` });
        }

        // ==========================================
        // TAHAP 4: GENERATE GAMBAR & KIRIM KE TELEGRAM + WA
        // ==========================================
        try {
            // Konfigurasi WA
            const TARGET_JID_WA = '120363428864413425@newsletter'; 
            const URL_BOT_WA_LU = 'http://cabangdua.lilyss.xyz:2019/api/send-testi';

            const options = { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' };
            const timeString = new Intl.DateTimeFormat('id-ID', options).format(new Date()).replace(/\./g, '/');

            // 1. Render Gambar Struk (Cukup 1x kerja)
            const imageBuffer = await generateReceiptImage({
                productName: plan.name,
                username: username,
                price: plan.price,
                time: timeString
            });
            
            const captionText = `✨ *TRANSAKSI BERHASIL OTOMATIS* ✨\n\nTerima kasih *${username}* telah membeli ${plan.name} di Fahmi Hosting! Server Anda sudah aktif.`;

            // 2. Eksekusi Tembak ke Telegram
            if (process.env.BOT_TOKEN && process.env.TESTI_CHAT_ID) {
                try {
                    const formTele = new FormData();
                    formTele.append('chat_id', process.env.TESTI_CHAT_ID);
                    formTele.append('photo', imageBuffer, { filename: 'struk-pembelian.png' });
                    formTele.append('caption', captionText);
                    formTele.append('parse_mode', 'Markdown');

                    await axios.post(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendPhoto`, formTele, {
                        headers: formTele.getHeaders()
                    });
                    console.log("Struk berhasil dikirim ke Telegram!");
                } catch (teleErr) {
                    console.error("Gagal kirim ke Telegram:", teleErr.message);
                }
            }

            // 3. Eksekusi Tembak ke API Bot WA Pterodactyl
            try {
                const formWA = new FormData();
                formWA.append('target_jid', TARGET_JID_WA);
                formWA.append('photo', imageBuffer, { filename: 'struk-wa.png' });
                formWA.append('caption', captionText);

                await axios.post(URL_BOT_WA_LU, formWA, {
                    headers: formWA.getHeaders()
                });
                console.log("Struk berhasil dikirim ke API Bot WA lokal!");
            } catch (waErr) {
                console.error("Gagal mengirim struk ke Jembatan Bot WA:", waErr.message);
            }

        } catch (botErr) {
            console.error("Gagal memproses gambar/notifikasi:", botErr.message);
        }

        // ==========================================
        // TAHAP 5: KIRIM RESPONSE KE WEB FRONTEND
        // ==========================================
        return res.status(200).json({ 
            success: true, 
            message: '🎉 Pembayaran Sukses & Server Berhasil Dibuat!',
            data_akun: { username: username, email: autoEmail, password: password, login_url: process.env.PTERO_URL }
        });

    } catch (error) {
        return res.status(500).json({ success: false, error: 'Terjadi kendala sistem.', details: error.message });
    }
};
