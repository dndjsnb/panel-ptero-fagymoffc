const axios = require('axios');

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
                    return res.status(400).json({ 
                        success: false, 
                        error: '❌ Pembayaran belum lunas! Silakan selesaikan pembayaran QRIS terlebih dahulu.' 
                    });
                }
            } catch (err) {
                return res.status(400).json({ 
                    success: false, 
                    error: '❌ Gagal memverifikasi pembayaran ke server QRIS. Coba ulangi beberapa saat lagi.' 
                });
            }
        } else {
            console.log("DEMO MODE AKTIF: Melewati validasi pembayaran ZakkiStore.");
        }

        // ==========================================
        // TAHAP 2: BIKIN AKUN PTERODACTYL
        // ==========================================
        if (!process.env.PTERO_URL || !process.env.PTERO_PTLA_KEY) {
            return res.status(500).json({ 
                success: false, 
                error: 'Sistem error: Konfigurasi Panel belum siap.' 
            });
        }

        let userId;
        try {
            const userRes = await axios.post(`${process.env.PTERO_URL}/api/application/users`, {
                email: autoEmail,
                username: username,
                first_name: username,
                last_name: "Customer",
                password: password,
                language: "en"
            }, {
                headers: {
                    'Authorization': `Bearer ${process.env.PTERO_PTLA_KEY}`,
                    'Content-Type': 'application/json'
                }
            });
            userId = userRes.data.attributes.id;
        } catch (pteroUserErr) {
            const errDetail = pteroUserErr.response?.data?.errors?.[0]?.detail || pteroUserErr.message;
            return res.status(500).json({ 
                success: false, 
                error: `Gagal mendaftarkan akun panel: ${errDetail}` 
            });
        }

        // ==========================================
        // TAHAP 3: BIKIN SERVER PTERODACTYL & ROLLBACK
        // ==========================================
        try {
            await axios.post(`${process.env.PTERO_URL}/api/application/servers`, {
                name: `Bot-WA-${username}`,
                user: userId,
                egg: 15, 
                docker_image: "ghcr.io/pterodactyl/yolks:nodejs_18",
                startup: "/usr/local/bin/node /home/container/index.js",
                environment: {
                    MAIN_FILE: "index.js",
                    AUTO_UPDATE: "0",
                    USER_UPLOAD: "0",
                    CMD_RUN: "npm start"
                },
                limits: {
                    memory: plan.ram,
                    swap: 0,
                    disk: plan.disk,
                    io: 500,
                    cpu: plan.cpu
                },
                feature_limits: { databases: 1, allocations: 1, backups: 1 },
                allocation: { default: 1 },
                deploy: {
                    locations: [1], 
                    dedicated_ip: false,
                    port_range: []
                }
            }, {
                headers: {
                    'Authorization': `Bearer ${process.env.PTERO_PTLA_KEY}`,
                    'Content-Type': 'application/json'
                }
            });
        } catch (pteroServerErr) {
            try {
                await axios.delete(`${process.env.PTERO_URL}/api/application/users/${userId}`, {
                    headers: { 'Authorization': `Bearer ${process.env.PTERO_PTLA_KEY}` }
                });
            } catch (deleteErr) {
                console.error("Gagal menghapus akun rollback:", deleteErr.message);
            }

            const errDetail = pteroServerErr.response?.data?.errors?.[0]?.detail || pteroServerErr.message;
            return res.status(500).json({ 
                success: false, 
                error: `Gagal membuat server: ${errDetail}. Akun telah dihapus otomatis (Rollback).` 
            });
        }

        // ==========================================
        // TAHAP 4: KIRIM TESTIMONI OTOMATIS KE BOT (OPSIONAL / ENV VERCEL)
        // ==========================================
        try {
            const teksTesti = `🎉 *PEMBAYARAN & SERVER BERHASIL* 🎉\n\n` +
                              `📦 Paket: *${plan.name}*\n` +
                              `💰 Harga: *Rp ${plan.price}*\n` +
                              `👤 Username: \`${username}\`\n` +
                              `🚀 Status: Server Pterodactyl Aktif Otomatis!\n\n` +
                              `_Terima kasih telah menggunakan layanan Fahmi Hosting!_`;

            // Jika pakai Telegram Bot (Contoh menggunakan BOT_TOKEN dan CHAT_ID di Vercel .env)
            if (process.env.BOT_TOKEN && process.env.TESTI_CHAT_ID) {
                await axios.post(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
                    chat_id: process.env.TESTI_CHAT_ID,
                    text: teksTesti,
                    parse_mode: 'Markdown'
                });
            }

            console.log("Log Testimoni:", teksTesti);
        } catch (botErr) {
            console.error("Gagal kirim notif ke bot:", botErr.message);
        }

        // ==========================================
        // TAHAP 5: KIRIM DATA AKUN KE FRONTEND (WEB)
        // ==========================================
        return res.status(200).json({ 
            success: true, 
            message: '🎉 Pembayaran Sukses & Server Berhasil Dibuat!',
            data_akun: {
                username: username,
                email: autoEmail,
                password: password,
                login_url: process.env.PTERO_URL 
            }
        });

    } catch (error) {
        return res.status(500).json({ 
            success: false, 
            error: 'Terjadi kendala tak terduga pada sistem.',
            details: error.message
        });
    }
};
