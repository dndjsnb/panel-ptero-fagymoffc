const axios = require('axios');

const plans = {
    "basic": { ram: 1024, disk: 5000, cpu: 100 },
    "standar": { ram: 2048, disk: 10000, cpu: 150 },
    "pro": { ram: 3072, disk: 15000, cpu: 200 },
    "advance": { ram: 4096, disk: 20000, cpu: 250 }
};

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method salah' });

    try {
        const { plan_key, email_pembeli, username, topup_id } = req.body;
        const plan = plans[plan_key];

        if (!plan || !topup_id) {
            return res.status(400).json({ success: false, error: 'Data transaksi tidak lengkap.' });
        }

        // ==========================================
        // TAHAP 1: CEK PEMBAYARAN KE ZAKKISTORE
        // ==========================================
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

        // ==========================================
        // TAHAP 2: TEMBAK KE PANEL PTERODACTYL
        // ==========================================
        if (!process.env.PTERO_URL || !process.env.PTERO_APP_KEY) {
            return res.status(500).json({ 
                success: false, 
                error: '🎉 Pembayaran Sukses! Tapi server gagal dibuat karena Konfigurasi Panel Pterodactyl belum siap di server hosting. Hubungi Admin.' 
            });
        }

        let userId;
        try {
            const userRes = await axios.post(`${process.env.PTERO_URL}/api/application/users`, {
                email: email_pembeli,
                username: username,
                first_name: username,
                last_name: "Customer",
                language: "en"
            }, {
                headers: {
                    'Authorization': `Bearer ${process.env.PTERO_APP_KEY}`,
                    'Content-Type': 'application/json'
                }
            });
            userId = userRes.data.attributes.id;
        } catch (pteroUserErr) {
            const errDetail = pteroUserErr.response?.data?.errors?.[0]?.detail || pteroUserErr.message;
            return res.status(500).json({ 
                success: false, 
                error: `🎉 Pembayaran Sukses! Namun gagal mendaftarkan akun panel: ${errDetail}` 
            });
        }

        try {
            await axios.post(`${process.env.PTERO_URL}/api/application/servers`, {
                name: `Bot-WA-${username}`,
                user: userId,
                egg: 15, // Sesuaikan ID Egg Node.js lu
                docker_image: "ghcr.io/pterodactyl/yolks:nodejs_18",
                startup: "/usr/local/bin/node /home/container/index.js",
                environment: {
                    MAIN_FILE: "index.js",
                    AUTO_UPDATE: "0",
                    USER_UPLOAD: "0"
                },
                limits: {
                    memory: plan.ram,
                    swap: 0,
                    disk: plan.disk,
                    io: 500,
                    cpu: plan.cpu
                },
                feature_limits: { databases: 1, allocations: 1, backups: 1 },
                allocation: { default: 1 }
            }, {
                headers: {
                    'Authorization': `Bearer ${process.env.PTERO_APP_KEY}`,
                    'Content-Type': 'application/json'
                }
            });
        } catch (pteroServerErr) {
            const errDetail = pteroServerErr.response?.data?.errors?.[0]?.detail || pteroServerErr.message;
            return res.status(500).json({ 
                success: false, 
                error: `🎉 Pembayaran Sukses & Akun Terbuat! Tapi gagal membuat server Pterodactyl: ${errDetail}` 
            });
        }

        return res.status(200).json({ 
            success: true, 
            message: '🎉 Pembayaran Sukses & Server Pterodactyl Berhasil Dibuat!' 
        });

    } catch (error) {
        return res.status(500).json({ 
            success: false, 
            error: 'Terjadi kendala tak terduga pada sistem.' 
        });
    }
};
