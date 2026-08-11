const axios = require('axios');
require('dotenv').config();

const pteroClient = axios.create({
    baseURL: `${process.env.PTERO_URL}/api/application`,
    headers: {
        'Authorization': `Bearer ${process.env.PTERO_PTLA_KEY}`, // Udah disesuaikan pakai PLTA Key
        'Content-Type': 'application/json',
        'Accept': 'Application/vnd.pterodactyl.v1+json'
    }
});

// Parameter password ditambahin ke sini, Bro
async function createUser(email, username, password) {
    try {
        const res = await pteroClient.post('/users', {
            email: email,
            username: username,
            first_name: username, // First name dibikin sama kayak username
            last_name: "Customer",
            password: password,   // <-- INI YANG BIKIN USER BISA LANGSUNG LOGIN
            language: "en"
        });
        return res.data.attributes.id;
    } catch (error) {
        console.error("Gagal createUser:", error.response?.data || error.message);
        throw error; // Lempar error ke webhook biar bisa ditangkap buat rollback
    }
}

async function createServer(userId, planData, username) {
    try {
        const res = await pteroClient.post('/servers', {
            name: `Bot-WA-${username}`,
            user: userId,
            egg: 15, // Langsung di-hardcode ke Bot WA
            docker_image: "ghcr.io/pterodactyl/yolks:nodejs_18",
            startup: "/usr/local/bin/node /home/container/index.js",
            environment: { 
                MAIN_FILE: "index.js",
                AUTO_UPDATE: "0",
                USER_UPLOAD: "0"
            },
            limits: planData, // Sesuai ram, disk, cpu dari webhook
            feature_limits: { databases: 1, allocations: 1, backups: 1 },
            deploy: {
                locations: [1], // Langsung di-hardcode ke Location 1
                dedicated_ip: false,
                port_range: []
            }
        });
        return res.data.attributes;
    } catch (error) {
        console.error("Gagal createServer:", error.response?.data || error.message);
        throw error; // Lempar error ke webhook biar bisa ditangkap buat rollback
    }
}

// Tambahin fungsi buat Delete User (Rollback kalau server gagal)
async function deleteUser(userId) {
    try {
        await pteroClient.delete(`/users/${userId}`);
    } catch (error) {
        console.error("Gagal menghapus akun rollback:", error.response?.data || error.message);
    }
}

module.exports = { createUser, createServer, deleteUser };
