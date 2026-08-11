const axios = require('axios');
require('dotenv').config(); // Tetap dipanggil buat test lokal

const pteroClient = axios.create({
    baseURL: `${process.env.PTERO_URL}/api/application`,
    headers: {
        'Authorization': `Bearer ${process.env.PTERO_PTLA_KEY}`, // Pakai kunci admin (PLTA)
        'Content-Type': 'application/json',
        'Accept': 'Application/vnd.pterodactyl.v1+json'
    }
});

async function createUser(email, username) {
    try {
        const res = await pteroClient.post('/users', {
            email: email,
            username: username,
            first_name: username,
            last_name: "Customer",
            language: "en"
        });
        return res.data.attributes.id;
    } catch (error) {
        console.error("Gagal createUser:", error.response?.data || error.message);
        throw error;
    }
}

async function createServer(userId, planData) {
    try {
        const res = await pteroClient.post('/servers', {
            name: planData.name || `Bot-WA-${userId}`,
            user: userId,
            egg: 15, // Udah di-fix ke Egg 15 (Node.js / WA Bot)
            docker_image: "ghcr.io/pterodactyl/yolks:nodejs_18", // Sesuaikan kalau lu pakai image lain
            startup: "/usr/local/bin/node /home/container/index.js",
            environment: { 
                MAIN_FILE: "index.js",
                AUTO_UPDATE: "0",
                USER_UPLOAD: "0"
            },
            limits: planData.limits,
            feature_limits: planData.feature_limits,
            deploy: {
                locations: [1], // Udah di-fix ke Location ID 1
                dedicated_ip: false,
                port_range: []
            }
        });
        return res.data.attributes;
    } catch (error) {
        console.error("Gagal createServer:", error.response?.data || error.message);
        throw error;
    }
}

module.exports = { createUser, createServer };
