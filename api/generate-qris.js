const ZakkiStore = require('zakkistore-sdk');

module.exports = async (req, res) => {
    // Blokir kalau ada yang iseng akses langsung lewat URL (GET)
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Hanya menerima jalur POST, Bro!' });
    }

    try {
        // Deklarasi SDK Zakki di dalam fungsi biar langsung baca vercel.json
        const zakki = new ZakkiStore({
            baseUrl: 'https://qris.zakki.store',
            token: process.env.ZAKKI_TOKEN,
            iduser: process.env.ZAKKI_IDUSER,
            email: process.env.ZAKKI_EMAIL,
            pin: process.env.ZAKKI_PIN || '123456',
            autoWithdraw: true
        });

        // Tangkap data harga dari checkout.html
        const { amount } = req.body;
        
        if (!amount) {
            return res.status(400).json({ success: false, error: "Nominal harganya nggak kebaca" });
        }

        // Tembak ke server ZakkiStore
        const response = await zakki.topup(parseInt(amount));
        
        if (response && response.data && response.data.qr_image) {
            // Kalau sukses, kirim URL gambarnya ke depan
            return res.status(200).json({ 
                success: true, 
                qr_url: response.data.qr_image,
                topup_id: response.data.idtopup 
            });
        } else {
            return res.status(400).json({ success: false, error: 'Data QRIS kosong dari server Zakki' });
        }
    } catch (error) {
        console.error("Crash Server:", error.message);
        return res.status(500).json({ 
            success: false, 
            error: error.response ? error.response.data : error.message 
        });
    }
};
