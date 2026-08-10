const ZakkiStore = require('zakkistore-sdk');

module.exports = async (req, res) => {
    try {
        // Panggil konfigurasi dari .env lu
        const zakki = new ZakkiStore({
            baseUrl: 'https://qris.zakki.store',
            token: process.env.ZAKKI_TOKEN,
            iduser: process.env.ZAKKI_IDUSER,
            email: process.env.ZAKKI_EMAIL,
            pin: process.env.ZAKKI_PIN || '123456',
            autoWithdraw: false
        });

        // Kita tes generate QRIS receh (Rp 1.000) buat pancingan
        const response = await zakki.topup(1000);
        
        // Kalau sukses, ini yang bakal muncul di layar
        res.status(200).json({
            status: "BERHASIL KONEK BRO!",
            pesan_dari_zakki: response
        });

    } catch (error) {
        // Kalau gagal, ini bakal ngebongkar semua alasan penolakannya
        res.status(500).json({
            status: "GAGAL NGISI BENSIN!",
            pesan_error: error.message,
            detail_ditolak: error.response ? error.response.data : "API Zakki gak ngasih alasan",
            cek_env_lu: {
                token_ada: !!process.env.ZAKKI_TOKEN,
                iduser_ada: !!process.env.ZAKKI_IDUSER
            }
        });
    }
};
