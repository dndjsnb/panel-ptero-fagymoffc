const axios = require('axios');

// Sesuaikan data ini dengan spek paket lu
const plans = {
    "basic": { name: "Paket 1GB Basic", ram: 1024, disk: 5000, cpu: 100, price: 5000 },
    "standar": { name: "Paket 2GB Standar", ram: 2048, disk: 10000, cpu: 150, price: 10000 },
    "pro": { name: "Paket 3GB Pro", ram: 3072, disk: 15000, cpu: 200, price: 15000 },
    "advance": { name: "Paket 4GB Advance", ram: 4096, disk: 20000, cpu: 250, price: 20000 }
};

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Harus POST Bro!' });

    try {
        const { plan_key, email_pembeli, username } = req.body;
        const plan = plans[plan_key];

        if (!plan) {
            return res.status(400).json({ success: false, error: 'Paket nggak ketemu' });
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
        const serverRes = await axios.post(`${process.env.PTERO_URL}/api/application/servers`, {
            name: `Bot-WA-${username}`,
            user: userId,
            egg: 15, // CEK CATATAN DI BAWAH SOAL ID EGG INI
            docker_image: "ghcr.io/pterodactyl/yolks:nodejs_18", // Standar image Node.js 18
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
            allocation: { default: 1 } // Pastikan ID Allocation/Node lu bener
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.PTERO_APP_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        return res.status(200).json({ 
            success: true, 
            message: 'Mantap, Server Bot WA berhasil dibuat!' 
        });

    } catch (error) {
        // Balikin pesan asli dari Pterodactyl biar kita tau salahnya dimana
        const pteroError = error.response && error.response.data && error.response.data.errors 
            ? error.response.data.errors[0].detail 
            : error.message;
            
        console.error("Webhook Error:", pteroError);
        return res.status(500).json({ 
            success: false, 
            error: pteroError 
        });
    }
};
