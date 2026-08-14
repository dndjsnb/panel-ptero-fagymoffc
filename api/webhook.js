const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { createCanvas, loadImage } = require('canvas');

// --- KONFIGURASI ENVIRONMENT (AMAN 100% PAKE .ENV) ---
const PTERODACTYL_URL = process.env.PTERODACTYL_URL;
const PTERODACTYL_API_KEY = process.env.PTERODACTYL_API_KEY;
const ZAKKISTORE_API_KEY = process.env.ZAKKISTORE_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// --- DAFTAR PAKET TETAP ---
const fixedPlans = {
    "basic": { ram: 1024, disk: 5000, cpu: 100, name: "1GB Basic", price: 5000 },
    "standar": { ram: 2048, disk: 10000, cpu: 150, name: "2GB Standard", price: 10000 },
    "pro": { ram: 4096, disk: 20000, cpu: 200, name: "4GB Pro", price: 20000 },
    "elite": { ram: 8192, disk: 40000, cpu: 300, name: "8GB Elite", price: 35000 },
    "ultimate": { ram: 16384, disk: 80000, cpu: 400, name: "16GB Ultimate", price: 60000 }
};

module.exports = async (req, res) => {
    try {
        const { plan_key, server_name, payment_method, custom_ram, custom_disk, custom_cpu } = req.body;
        
        // 1. TENTUKAN SPESIFIKASI SERVER (LOGIKA CUSTOM PLAN DITAMBAHKAN DI SINI)
        let finalRam, finalDisk, finalCpu, planName, finalPrice;

        if (plan_key === 'custom') {
            // Validasi Minimal
            const minRam = 256;
            const minDisk = 1;
            const minCpu = 25;

            finalRam = parseInt(custom_ram) || minRam;
            finalDisk = parseInt(custom_disk) || minDisk;
            finalCpu = parseInt(custom_cpu) || minCpu;

            // Pastikan tidak di bawah minimal
            if (finalRam < minRam) finalRam = minRam;
            if (finalDisk < minDisk) finalDisk = minDisk;
            if (finalCpu < minCpu) finalCpu = minCpu;

            planName = `Custom (${finalRam}MB RAM)`;
            
            // Hitung harga di backend buat validasi (Rumus: Base 2000 + Ram*10 + Disk*500 + Cpu*50)
            finalPrice = 2000 + (finalRam * 10) + (finalDisk * 500) + (finalCpu * 50);
        } else {
            // Logic Paket Tetap
            const selectedPlan = fixedPlans[plan_key];
            if (!selectedPlan) {
                return res.status(400).json({ error: 'Paket tidak ditemukan.' });
            }
            finalRam = selectedPlan.ram;
            finalDisk = selectedPlan.disk;
            finalCpu = selectedPlan.cpu;
            planName = selectedPlan.name;
            finalPrice = selectedPlan.price;
        }

        // 2. PROSES PEMBAYARAN (ZAKKISTORE)
        const invoiceId = 'INV-' + Date.now();
        
        // Buat Invoice di Zakkistore
        const zakkisResponse = await axios.post('https://api.zakkistore.id/v1/transaction', {
            api_key: ZAKKISTORE_API_KEY,
            ref_id: invoiceId,
            nominal: finalPrice,
            note: `Pembelian ${planName} - ${server_name}`
        }, { headers: { 'Content-Type': 'application/json' } });

        const paymentUrl = zakkisResponse.data.data.checkout_url;
        const qrString = zakkisResponse.data.data.qr_string;

        // 3. BUAT USER & SERVER DI PTERODACTYL
        // Cari user berdasarkan email atau buat baru (sesuai logic lama lu)
        // Di sini gue asumsikan lu udah punya logic buat dapetin user_id
        const userId = 1; // Ganti dengan logic pencarian user lu

        const serverData = {
            name: server_name,
            user: userId,
            egg: 15, // ID Egg NodeJS/Bot lu
            docker_image: "ghcr.io/pterodactyl/yolks:nodejs_18",
            startup: "npm start",
            environment: {},
            limits: {
                memory: finalRam,   // Menggunakan variabel hasil logic custom/tetap
                swap: 0,
                disk: finalDisk,    // Menggunakan variabel hasil logic custom/tetap
                io: 500,
                cpu: finalCpu       // Menggunakan variabel hasil logic custom/tetap
            },
            feature_limits: { databases: 0, allocations: 1, backups: 1 }
        };

        await axios.post(`${PTERODACTYL_URL}/api/application/servers`, serverData, {
            headers: {
                'Authorization': `Bearer ${PTERODACTYL_API_KEY}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        // 4. GENERATE STRUK DIGITAL (CANVAS)
        const canvas = createCanvas(800, 400);
        const ctx = canvas.getContext('2d');
        
        // Background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 800, 400);
        
        // Header
        ctx.fillStyle = '#2563eb';
        ctx.fillRect(0, 0, 800, 100);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 30px Inter';
        ctx.fillText('BOT HOSTING INVOICE', 50, 60);

        // Detail
        ctx.fillStyle = '#1f2937';
        ctx.font = '20px Inter';
        ctx.fillText(`Invoice: ${invoiceId}`, 50, 150);
        ctx.fillText(`Paket: ${planName}`, 50, 190);
        ctx.fillText(`Harga: Rp ${finalPrice.toLocaleString('id-ID')}`, 50, 230);
        ctx.fillText(`Server: ${server_name}`, 50, 270);

        // QR Code
        const qrImage = await QRCode.toBuffer(qrString);
        const image = await loadImage(qrImage);
        ctx.drawImage(image, 550, 150, 200, 200);

        const buffer = canvas.toBuffer('image/png');
        const fileName = `invoice-${invoiceId}.png`;
        fs.writeFileSync(fileName, buffer);

        // 5. KIRIM NOTIFIKASI TELEGRAM
        const caption = `🎉 *Pesanan Baru!*\n\n📦 Paket: ${planName}\n💰 Harga: Rp ${finalPrice.toLocaleString('id-ID')}\n🤖 Server: ${server_name}\n\nSilakan selesaikan pembayaran via QRIS.`;
        
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
            chat_id: TELEGRAM_CHAT_ID,
            photo: { source: fs.createReadStream(fileName) },
            caption: caption,
            parse_mode: 'Markdown'
        }, { headers: { 'Content-Type': 'multipart/form-data' } });

        // Cleanup file
        fs.unlinkSync(fileName);

        res.status(200).json({ 
            message: 'Pesanan berhasil diproses!', 
            invoice: invoiceId,
            payment_url: paymentUrl,
            details: {
                ram: finalRam,
                disk: finalDisk,
                cpu: finalCpu
            }
        });

    } catch (error) {
        console.error('Webhook Error:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
    }
};
