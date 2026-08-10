const axios = require('axios');
const ZakkiStore = require('zakkistore-sdk');

const plans = {
    "basic": { name: "Paket 1GB Basic", ram: 1024, disk: 5000, cpu: 100, price: 5000 },
    "standar": { name: "Paket 2GB Standar", ram: 2048, disk: 10000, cpu: 150, price: 10000 },
    "pro": { name: "Paket 3GB Pro", ram: 3072, disk: 15000, cpu: 200, price: 15000 },
    "advance": { name: "Paket 4GB Advance", ram: 4096, disk: 20000, cpu: 250, price: 20000 }
};

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Harus POST Bro!' });

    try {
        const { plan_key, email_pembeli, username, topup_id } = req.body;
        const plan = plans[plan_key];

        if (!plan) {
            return res.status(400).json({ success: false, error: 'Paket hosting tidak ditemukan.' });
        }

        // Inisialisasi ZakkiStore buat ngecek status transaksi
        const zakki = new ZakkiStore({
            baseUrl: 'https://qris.zakki.store',
            token: process.env.ZAKKI_TOKEN,
            iduser: process.env.ZAKKI_IDUSER,
            email: process.env.ZAKKI_EMAIL,
            pin: process.env.ZAKKI_PIN || '123456',
        });

        // CEK STATUS PEMBAYARAN KE ZAKKISTORE
        // (Pastikan topup_id dikirim dari frontend setelah QRIS dibuat)
        if (topup_id) {
            const checkStatus = await zakki.check(topup_id);
            // Sesuaikan kondisi status sukses dari API Zakki (biasanya 'success' atau 'paid')
            if (!checkStatus || checkStatus.status !== 'success') {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Pembayaran belum terdeteksi. Silakan selesaikan pembayaran QRIS terlebih dahulu.' 
                });
            }
        }

        // 1. Bikin Akun User di Pterodactyl
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

        const userId = userRes.data.attributes.id;

        // 2. Bikin Server NodeJS untuk User tersebut
        await axios.post(`${process.env.PTERO_URL}/api/application/servers`, {
            name: `Bot-WA-${username}`,
            user: userId,
            egg: 15, // Ganti dengan ID Egg Node.js di panel lu
            docker_image: "ghcr.io/pterodactyl/yolks:nodejs_18",
            startup: "if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == \"1\" ]]; then git pull; fi; if [[ ! -z {{NODE_PACKAGES}} ]]; then /usr/local/bin/npm install {{NODE_PACKAGES}}; fi; if [[ ! -z {{UNNODE_PACKAGES}} ]]; then /usr/local/bin/npm uninstall {{UNNODE_PACKAGES}}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/node /home/container/{{MAIN_FILE}}",
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

        return res.status(200).json({ 
            success: true, 
            message: 'Server Bot WA berhasil dibuat!' 
        });

    } catch (error) {
        const pteroError = error.response && error.response.data && error.response.data.errors 
            ? error.response.data.errors[0].detail 
            : error.message;
            
        console.error("Webhook Error:", pteroError);
        return res.status(500).json({ 
            success: false, 
            error: `Gagal memproses sistem: ${pteroError}` 
        });
    }
};
