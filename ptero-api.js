const axios = require('axios');
require('dotenv').config(); // Tetap dipanggil buat test lokal

const pteroClient = axios.create({
    baseURL: `${process.env.PTERO_URL}/api/application`,
    headers: {
        'Authorization': `Bearer ${process.env.PTERO_APP_KEY}`,
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
            name: planData.name,
            user: userId,
            egg: planData.egg_id,
            docker_image: planData.docker_image,
            startup: planData.startup,
            environment: { SERVER_JARFILE: "server.jar" },
            limits: planData.limits,
            feature_limits: planData.feature_limits,
            deploy: {
                locations: [1], // Ganti dengan ID Location Ptero lu
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

