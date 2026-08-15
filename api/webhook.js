const axios = require('axios');

// --- KONFIGURASI ENVIRONMENT ---
const PTERO_URL = process.env.PTERO_URL;
const PTERO_KEY = process.env.PTERO_PTLA_KEY;
const ZAKKI_TOKEN = process.env.ZAKKI_TOKEN;
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.TESTI_CHAT_ID;

// --- SAKLAR DEMO MODE ---
// true  = Langsung sukses / lunas otomatis tanpa bayar (buat testing)
// false = Cek pembayaran asli via Zakkistore
const IS_DEMO_MODE = true; 

module.exports = async (req, res) => {
    // Pastikan hanya menerima method POST
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    try {
        const { plan_key, topup_id, username, password } = req.body;

        let isPaid = false;

        if (IS_DEMO_MODE) {
            isPaid = true; // Langsung lunas untuk keperluan uji coba
        } else {
            try {
                // Cek status pembayaran ke Zakkistore
                const checkStatus = await axios.get(`https://api.zakkistore.id/v1/transaction/status?api_key=${ZAKKI_TOKEN}&ref_id=${topup_id}`);
                if (checkStatus.data && (checkStatus.data.data.status === "LUNAS" || checkStatus.data.data.status === "PAID")) {
                    isPaid = true;
                }
            } catch (err) {
                console.error("Gagal cek status Zakkistore:", err.response?.data || err.message);
            }
        }

        if (!isPaid) {
            return res.status(400).json({ success: false, error: "Pembayaran belum lunas atau belum dideteksi." });
        }

        // --- BUAT SERVER DI PTERODACTYL ---
        const serverData = {
            name: username || 'Bot Server',
            user: 1, 
            egg: 15, 
            docker_image: "ghcr.io/pterodactyl/yolks:nodejs_18",
            startup: "npm start",
            environment: {},
            limits: {
                memory: 1024,
                swap: 0,
                disk: 5000,
                io: 500,
                cpu: 100
            },
            feature_limits: { databases: 0, allocations: 1, backups: 1 }
        };

        try {
            await axios.post(`${PTERO_URL}/api/application/servers`, serverData, {
                headers: {
                    'Authorization': `Bearer ${PTERO_KEY}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });
        } catch (pteroErr) {
            console.error("Pterodactyl Error:", pteroErr.response?.data || pteroErr.message);
        }

        // --- KIRIM NOTIFIKASI TELEGRAM ---
        if (BOT_TOKEN && CHAT_ID) {
            const teleMessage = `🚀 *Server Pterodactyl Berhasil Dibuat!*\n\n` +
                                `👤 *User:* ${username || 'Fahmi'}\n` +
                                `⚡ *Status:* Aktif`;
            
            axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                chat_id: CHAT_ID,
                text: teleMessage,
                parse_mode: 'Markdown'
            }).catch(() => {});
        }

        // --- KEMBALIKAN DATA AKUN KE FRONTEND ---
        return res.status(200).json({
            success: true,
            data_akun: {
                username: username || "fagem",
                password: password || "123456",
                login_url: PTERO_URL
            }
        });

    } catch (error) {
        console.error('Webhook Error:', error.response?.data || error.message);
        return res.status(500).json({ success: false, error: 'Terjadi kesalahan pada server backend.' });
    }
};
