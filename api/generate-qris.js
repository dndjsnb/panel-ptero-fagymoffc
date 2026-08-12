const ZakkiStore = require('zakkistore-sdk');

const planPrices = {
    "basic": 5000,
    "standar": 8000,
    "pro": 11000,
    "advance": 14000,
    "5gb": 17000,
    "6gb": 20000,
    "7gb": 23000,
    "8gb": 26000,
    "9gb": 29000,
    "10gb": 32000,
    "unlimited": 50000 // Ganti harga Unlimited di sini kalau mau
};

module.exports = async (req, res) => {
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

        const bodyData = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const planKey = bodyData?.plan_key;
        const amount = planPrices[planKey];

        if (!amount) {
            return res.status(400).json({ 
                success: false, 
                error: "Paket tidak valid atau harga tidak ditemukan" 
            });
        }

        const response = await zakki.topup(amount);
        
        if (response && response.status === 'success' && response.data) {
            return res.status(200).json({ 
                success: true, 
                qr_url: response.data.qris_image,
                topup_id: response.data.id_transaksi,
                real_price: amount
            });
        } else {
            return res.status(400).json({ success: false, error: 'Gagal generate QRIS' });
        }
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};
