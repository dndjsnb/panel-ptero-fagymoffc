const ZakkiStore = require('zakkistore-sdk');

module.exports = async (req, res) => {
    try {
        const zakki = new ZakkiStore({
            baseUrl: 'https://qris.zakki.store',
            token: process.env.ZAKKI_TOKEN,
            iduser: process.env.ZAKKI_IDUSER,
            email: process.env.ZAKKI_EMAIL,
            pin: process.env.ZAKKI_PIN || '123456',
        });

        let rawAmount = req.method === 'POST' ? JSON.parse(req.body).amount : req.query.amount;
        if (!rawAmount) return res.status(400).json({ success: false, error: "Nominal tidak valid" });

        const response = await zakki.topup(parseInt(rawAmount));
        
        if (response && response.status === 'success' && response.data) {
            return res.status(200).json({ 
                success: true, 
                qr_url: response.data.qris_image,
                topup_id: response.data.id_transaksi 
            });
        } else {
            return res.status(400).json({ success: false, error: 'Gagal generate QRIS' });
        }
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};
