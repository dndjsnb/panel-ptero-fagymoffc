const axios = require('axios');
const ZakkiStore = require('zakkistore-sdk');

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

        if (!plan || !topup_id) return res.status(400).json({ success: false, error: 'Data tidak lengkap' });

        const zakki = new ZakkiStore({
            baseUrl: 'https://qris.zakki.store',
            token: process.env.ZAKKI_TOKEN,
            iduser: process.env.ZAKKI_IDUSER,
            email: process.env.ZAKKI_EMAIL,
            pin: process.env.ZAKKI_PIN || '123456',
        });

        const checkStatus = await zakki.check(topup_id);
        if (!checkStatus || checkStatus.status !== 'success') {
            return res.status(400).json({ success: false, error: '❌ Pembayaran belum lunas!' });
        }

        const userRes = await axios.post(`${process.env.PTERO_URL}/api/application/users`, {
            email: email_pembeli, username, first_name: username, last_name: "Customer", language: "en"
        }, { headers: { 'Authorization': `Bearer ${process.env.PTERO_APP_KEY}`, 'Content-Type': 'application/json' } });

        await axios.post(`${process.env.PTERO_URL}/api/application/servers`, {
            name: `Bot-WA-${username}`,
            user: userRes.data.attributes.id,
            egg: 15, // SESUAIKAN ID EGG DI PANEL LU
            docker_image: "ghcr.io/pterodactyl/yolks:nodejs_18",
            startup: "/usr/local/bin/node /home/container/index.js",
            environment: { MAIN_FILE: "index.js", AUTO_UPDATE: "0", USER_UPLOAD: "0" },
            limits: { memory: plan.ram, swap: 0, disk: plan.disk, io: 500, cpu: plan.cpu },
            feature_limits: { databases: 1, allocations: 1, backups: 1 },
            allocation: { default: 1 }
        }, { headers: { 'Authorization': `Bearer ${process.env.PTERO_APP_KEY}`, 'Content-Type': 'application/json' } });

        return res.status(200).json({ success: true, message: 'Server berhasil dibuat!' });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};
