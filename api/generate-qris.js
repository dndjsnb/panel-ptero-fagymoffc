const ZakkiStore = require('zakkistore-sdk');

module.exports = async (req, res) => {
    try {
        const zakki = new ZakkiStore({
            baseUrl: 'https://qris.zakki.store',
            token: process.env.ZAKKI_TOKEN,
            iduser: process.env.ZAKKI_IDUSER,
            email: process.env.ZAKKI_EMAIL,
            pin: process.env.ZAKKI_PIN || '123456',
            autoWithdraw: true
        });

        // Tangkap harga (Bisa lewat POST dari checkout.html, atau GET dari URL langsung)
        let rawAmount;
        if (req.method === 'POST') {
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            rawAmount = body.amount;
        } else {
            rawAmount = req.query.amount;
        }
        
        if (!rawAmount) {
            return res.status(400).json({ success: false, error: "Nominal (amount) kosong nih Bro!" });
        }

        const amount = parseInt(rawAmount);

        // Eksekusi API ZakkiStore
        const response = await zakki.topup(amount);
        
        // PERBAIKAN DISINI: qris_image dan id_transaksi
        if (response && response.status === 'success' && response.data && response.data.qris_image) {
            return res.status(200).json({ 
                success: true, 
                qr_url: response.data.qris_image,
                topup_id: response.data.id_transaksi 
            });
        } else {
            return res.status(400).json({ 
                success: false, 
                error: 'Respon ZakkiStore error atau struktur berubah', 
                detail_asli: response 
            });
        }
    } catch (error) {
        console.error("Crash Server:", error.message);
        return res.status(500).json({ 
            success: false, 
            error: error.message,
            detail_asli: error.response ? error.response.data : "API nge-blank"
        });
    }
};
