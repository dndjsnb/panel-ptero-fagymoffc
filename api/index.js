const express = require('express');
const ZakkiStore = require('zakkistore-sdk');
const axios = require('axios');

const app = express();
app.use(express.json());

// 1. DATA PLANS / PAKET HOSTING
const plans = {
    "1gb": { name: "Paket 1GB Basic", ram: 1024, disk: 5000, cpu: 100, price: 5000 },
    "2gb": { name: "Paket 2GB Standar", ram: 2048, disk: 10000, cpu: 150, price: 10000 },
    "3gb": { name: "Paket 3GB Pro", ram: 3072, disk: 15000, cpu: 200, price: 15000 },
    "4gb": { name: "Paket 4GB Advance", ram: 4096, disk: 20000, cpu: 250, price: 20000 }
};

// 2. KONFIGURASI ZAKKISTORE SDK
const zakki = new ZakkiStore({
    baseUrl: 'https://qris.zakki.store',
    token: process.env.ZAKKI_TOKEN,
    iduser: process.env.ZAKKI_IDUSER,
    email: process.env.ZAKKI_EMAIL,
    pin: process.env.ZAKKI_PIN || '123456',
    autoWithdraw: true
});

// 3. FUNGSI PTERODACTYL API DIRECT
async function createPteroUser(email, username) {
    const res = await axios.post(`${process.env.PTERO_URL}/api/application/users`, {
        email: email,
        username: username,
        first_name: username,
        last_name: "Customer",
        language: "en"
    }, {
        headers: {
            'Authorization': `Bearer ${process.env.PTERO_APP_KEY}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    });
    return res.data.attributes.id;
}

async function createPteroServer(userId, plan) {
    const res = await axios.post(`${process.env.PTERO_URL}/api/application/servers`, {
        name: `Server-${plan.name}`,
        user: userId,
        egg: 15, // Disesuaikan dengan Egg ID default di panel lu
        docker_image: "ghcr.io/pterodactyl/yolks:java_17",
        startup: "java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}}",
        environment: {
            SERVER_JARFILE: "server.jar",
            VANILLA_VERSION: "latest"
        },
        limits: {
            memory: plan.ram,
            swap: 0,
            disk: plan.disk,
            io: 500,
            cpu: plan.cpu
        },
        feature_limits: {
            databases: 1,
            allocations: 1,
            backups: 1
        },
        allocation: {
            default: 1
        }
    }, {
        headers: {
            'Authorization': `Bearer ${process.env.PTERO_APP_KEY}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    });
    return res.data.attributes;
}

// 4. ENDPOINT GENERATE QRIS
app.post('/api/generate-qris', async (req, res) => {
    try {
        const { amount } = req.body;
        if (!amount) return res.status(400).json({ error: "Nominal tidak valid" });

        const response = await zakki.topup(parseInt(amount));
        
        if (response && response.data && response.data.qr_image) {
            return res.json({ 
                success: true, 
                qr_url: response.data.qr_image,
                topup_id: response.data.idtopup 
            });
        }
        
        throw new Error("Respon dari ZakkiStore tidak valid");
    } catch (err) {
        console.error("QRIS Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 5. ENDPOINT WEBHOOK / BUAT SERVER
app.post('/api/webhook', async (req, res) => {
    try {
        const { plan_key, email_pembeli, username } = req.body;
        
        const plan = plans[plan_key];
        if (!plan) return res.status(400).json({ success: false, error: 'Paket tidak ditemukan' });

        // Buat User & Server di Pterodactyl
        const userId = await createPteroUser(email_pembeli, username);
        const server = await createPteroServer(userId, plan);

        return res.status(200).json({ 
            success: true, 
            message: 'Server Pterodactyl berhasil dibuat!',
            server_id: server.identifier 
        });
    } catch (err) {
        console.error("Webhook Error:", err.response ? err.response.data : err.message);
        return res.status(500).json({ 
            success: false, 
            error: 'Gagal membuat server Pterodactyl. Cek data API Key / Panel.' 
        });
    }
});

module.exports = app;
