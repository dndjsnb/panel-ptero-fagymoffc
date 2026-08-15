const axios = require('axios');

// --- SINKRONISASI ENVIRONMENT DENGAN VERCEL.JSON ---
const PTERO_URL = process.env.PTERO_URL;
const PTERO_KEY = process.env.PTERO_PTLA_KEY;
const ZAKKI_TOKEN = process.env.ZAKKI_TOKEN;
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.TESTI_CHAT_ID;

// --- SAKLAR DEMO MODE (UNTUK TESTING) ---
// true  = Langsung sukses / lunas otomatis tanpa bayar asli (buat uji coba)
// false = Cek pembayaran QRIS asli via Zakkistore
const IS_DEMO_MODE = true; 

const fixedPlans = {
    "basic": { ram: 1024, disk: 5000, cpu: 100, name: "1GB Basic", price: 5000 },
    "standar": { ram: 2048, disk: 10000, cpu: 150, name: "2GB Standard", price: 10000 },
    "pro": { ram: 4096, disk: 20000, cpu: 200, name: "4GB Pro", price: 20000 },
    "elite": { ram: 8192, disk: 40000, cpu: 300, name: "8GB Elite", price: 35000 },
    "ultimate": { ram: 16384, disk: 80000, cpu: 400, name: "16GB Ultimate", price: 60000 }
};

module.exports = async (req, res) => {
    try {
        const { action, plan_key, server_name, custom_ram, custom_disk, custom_cpu, topup_id, username, password } = req.body;
        
        // ==========================================
        // FITUR 1: BUAT TRANSAKSI & QRIS
        // ==========================================
        if (!action || action === 'create') {
            let finalRam, finalDisk, finalCpu, planName, finalPrice;

            if (plan_key === 'custom') {
                finalRam = parseInt(custom_ram) || 256;
                finalDisk = parseInt(custom_disk) || 1;
                finalCpu = parseInt(custom_cpu) || 25;
                planName = `Custom (${finalRam}MB RAM)`;
                finalPrice = 2000 + (finalRam * 10) + (finalDisk * 500) + (finalCpu * 50);
            } else {
                const selectedPlan = fixedPlans[plan_key];
                if (!selectedPlan) return res.status(400).json({ success: false, error: 'Paket tidak ditemukan.' });
                finalRam = selectedPlan.ram;
                finalDisk = selectedPlan.disk;
                finalCpu = selectedPlan.cpu;
                planName = selectedPlan.name;
                finalPrice = selectedPlan.price;
            }

            const invoiceId = 'INV-' + Date.now();
            
            // Buat transaksi ke Zakkistore
            const zakkisResponse = await axios.post('https://api.zakkistore.id/v1/transaction', {
                api_key: ZAKKI_TOKEN,
                ref_id: invoiceId,
                nominal: finalPrice,
                note: `Pembelian ${planName} - ${server_name || 'Bot'}`
            }, { headers: { 'Content-Type': 'application/json' } });

            const qrString = zakkisResponse.data.data.qr_string;
            const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrString)}`;

            return res.status(200).json({ 
                success: true,
                message: 'QRIS berhasil dibuat!', 
                topup_id: invoiceId,
                qr_url: qrImageUrl,
                real_price: finalPrice,
                details: { ram: finalRam, disk: finalDisk, cpu: finalCpu, planName }
            });
        }

        // ==========================================
        // FITUR 2: CEK PEMBAYARAN & EKSEKUSI PTERODACTYL
        // ==========================================
        if (action === 'check_payment') {
            let isPaid = false;

            if (IS_DEMO_MODE) {
                // Mode testing: langsung anggap lunas
                isPaid = true;
            } else {
                // Mode asli: cek status transaksi ke Zakkistore
                try {
                    const checkStatus = await axios.get(`https://api.zakkistore.id/v1/transaction/status?api_key=${ZAKKI_TOKEN}&ref_id=${topup_id}`);
                    if (checkStatus.data && (checkStatus.data.data.status === "LUNAS" || checkStatus.data.data.status === "PAID")) {
                        isPaid = true;
                    }
                } catch (err) {
                    console.error("Gagal cek status Zakkistore:", err.message);
                }
            }

            if (!isPaid) {
                return res.status(400).json({ success: false, error: "Pembayaran belum lunas atau belum dideteksi." });
            }

            // Jika LUNAS / Mode Demo Aktif -> Buat Server di Pterodactyl
            const serverData = {
                name: server_name || username || 'Bot Server',
                user: 1, // ID User Pterodactyl lu
                egg: 15, 
                docker_image: "ghcr.io/pterodactyl/yolks:nodejs_18",
                startup: "npm start",
                environment: {},
                limits: { memory: 1024, swap: 0, disk: 5000, io: 500, cpu: 100 },
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
                console.error("Pterodactyl Creation Error:", pteroErr.response?.data || pteroErr.message);
            }

            // Kirim Notifikasi Telegram (Opsional, pakai teks biasa biar aman)
            if (BOT_TOKEN && CHAT_ID) {
                axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                    chat_id: CHAT_ID,
                    text: ` *Server Berhasil Dibuat!*\n\n User: ${username}\n Server: ${server_name || username}`,
                    parse_mode: 'Markdown'
                }).catch(() => {});
            }

            // Kembalikan data akun sukses ke frontend
            return res.status(200).json({
                success: true,
                data_akun: {
                    username: username || "fagem",
                    password: password || "123456",
                    login_url: PTERO_URL
                }
            });
        }

        return res.status(400).json({ success: false, error: "Aksi tidak dikenal." });

    } catch (error) {
        console.error('Webhook Error:', error.response ? error.response.data : error.message);
        res.status(500).json({ success: false, error: 'Terjadi kesalahan pada server backend.' });
    }
};
