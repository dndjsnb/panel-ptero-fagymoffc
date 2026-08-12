const axios = require('axios');

// ==========================================
// MODE DEMO: Ubah jadi false kalau web sudah mau dirilis ke pembeli!
// ==========================================
const DEMO_MODE = true; 

const plans = {
    "basic": { ram: 1024, disk: 5000, cpu: 100 },
    "standar": { ram: 2048, disk: 10000, cpu: 150 },
    "pro": { ram: 3072, disk: 15000, cpu: 200 },
    "advance": { ram: 4096, disk: 20000, cpu: 250 },
    "5gb": { ram: 5120, disk: 25000, cpu: 300 },
    "6gb": { ram: 6144, disk: 30000, cpu: 350 },
    "7gb": { ram: 7168, disk: 35000, cpu: 400 },
    "8gb": { ram: 8192, disk: 40000, cpu: 450 },
    "9gb": { ram: 9216, disk: 45000, cpu: 500 },
    "10gb": { ram: 10240, disk: 50000, cpu: 550 },
    "unlimited": { ram: 0, disk: 0, cpu: 0 } // Angka 0 di Pterodactyl = Unlimited
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

        // TAHAP 1: CEK PEMBAYARAN
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
            console.log("DEMO MODE AKTIF: Melewati validasi pembayaran.");
        }

        // TAHAP 2: BIKIN AKUN
        if (!process.env.PTERO_URL || !process.env.PTERO_PTLA_KEY) {
            return res.status(500).json({ success: false, error: 'Sistem error: Konfigurasi Panel belum siap.' });
        }

        let userId;
        try {
            const userRes = await axios.post(`${process.env.PTERO_URL}/api/application/users`, {
                email: autoEmail, username: username, first_name: username,
                last_name: "Customer", password: password, language: "en"
            }, {
                headers: { 'Authorization': `Bearer ${process.env.PTERO_PTLA_KEY}`, 'Content-Type': 'application/json' }
            });
            userId = userRes.data.attributes.id;
        } catch (pteroUserErr) {
            return res.status(500).json({ success: false, error: `Gagal daftar akun panel: ${pteroUserErr.response?.data?.errors?.[0]?.detail || pteroUserErr.message}` });
        }

        // TAHAP 3: BIKIN SERVER
        try {
            await axios.post(`${process.env.PTERO_URL}/api/application/servers`, {
                name: `Bot-WA-${username}`,
                user: userId, egg: 15, 
                docker_image: "ghcr.io/pterodactyl/yolks:nodejs_18",
                startup: "/usr/local/bin/node /home/container/index.js",
                environment: { MAIN_FILE: "index.js", AUTO_UPDATE: "0", USER_UPLOAD: "0", CMD_RUN: "npm start" },
                limits: { memory: plan.ram, swap: 0, disk: plan.disk, io: 500, cpu: plan.cpu },
                feature_limits: { databases: 1, allocations: 1, backups: 1 },
                allocation: { default: 1 },
                deploy: { locations: [1], dedicated_ip: false, port_range: [] }
            }, {
                headers: { 'Authorization': `Bearer ${process.env.PTERO_PTLA_KEY}`, 'Content-Type': 'application/json' }
            });
        } catch (pteroServerErr) {
            try { await axios.delete(`${process.env.PTERO_URL}/api/application/users/${userId}`, { headers: { 'Authorization': `Bearer ${process.env.PTERO_PTLA_KEY}` } }); } catch (e) {}
            return res.status(500).json({ success: false, error: `Gagal membuat server: ${pteroServerErr.response?.data?.errors?.[0]?.detail || pteroServerErr.message}. (Rollback)` });
        }

        // TAHAP 4: SUKSES
        return res.status(200).json({ 
            success: true, message: '🎉 Server Berhasil Dibuat!',
            data_akun: { username: username, email: autoEmail, password: password, login_url: process.env.PTERO_URL }
        });

    } catch (error) {
        return res.status(500).json({ success: false, error: 'Terjadi kendala tak terduga.', details: error.message });
    }
};
