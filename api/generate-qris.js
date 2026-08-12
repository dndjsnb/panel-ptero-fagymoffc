const ZakkiStore = require('zakkistore-sdk');

// Daftar harga sesuai plan. Pastikan harganya benar di sini ya Bro.
const planPrices = {
    "basic": 5000,
    "standar": 10000,
    "pro": 15000,
    "advance": 20000
};

module.exports = async (req, res) => {
    // Wajibkan metode POST
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method salah' });
    }

    try {
        const zakki = new ZakkiStore({
            baseUrl: 'https://qris.zakki.store',
            token: process.env.ZAKKI_TOKEN,
            iduser: process.env.ZAKKI_IDUSER,
            email: process.env.ZAKKI_EMAIL,
            pin: process.env.ZAKKI_PIN || '123456',
        });

        // Parse body dengan aman agar tidak crash kalau sudah berwujud Object dari Vercel
        const bodyData = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const planKey = bodyData?.plan_key;

        // Ambil harga dari server berdasarkan planKey
        const amount = planPrices[planKey];

        if (!amount) {
            return res.status(400).json({ 
                success: false, 
                error: "Paket tidak valid atau harga tidak ditemukan" 
            });
        }

        // Tembak nominal ke ZakkiStore
        const response = await zakki.topup(amount);
        
        if (response && response.status === 'success' && response.data) {
            return res.status(200).json({ 
                success: true, 
                qr_url: response.data.qris_image,
                topup_id: response.data.id_transaksi,
                real_price: amount // Kembalikan harga asli ke frontend
            });
        } else {
            return res.status(400).json({ success: false, error: 'Gagal generate QRIS' });
        }
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};
