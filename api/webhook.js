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
        const { plan_key, username, password, topup_id } = req.body;
        const plan = plans[plan_key];

        if (!plan || !topup_id || !username || !password) {
            return res.status(400).json({ success: false, error: 'Data tidak lengkap. Pastikan Username dan Password terisi.' });
        }

        const autoEmail = `${username.toLowerCase().replace(/\s+/g, '')}@petrofagem.com`;

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
        // TAHAP 3: BIKIN SERVER PTERODACTYL & AUTO-DELETE JIKA GAGAL
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
            // ROLLBACK: Bikin server gagal, langsung hapus akunnya!
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
        // TAHAP 4: BERHASIL SEMUA, KIRIM DATA KE FRONTEND
        // ==========================================
        return res.status(200).json({ 
            success: true, 
            message: '🎉 Pembayaran Sukses & Server Berhasil Dibuat!',
            data_akun: {
                username: username,
                email: autoEmail,
                password: password,
                login_url: process.env.PTERO_URL // Biar pembeli tau link login panelnya
            }
        });

    } catch (error) {
        return res.status(500).json({ 
            success: false, 
            error: 'Terjadi kendala tak terduga pada sistem.' 
        });
    }
};
