import  mongoose = require('mongoose'); // Benerin import dari mongoose jadi mongodb murni

// Narik URL Mongo dari index.js[span_4](start_span)[span_4](end_span)
const mongoURI  = require('./index.js'); //[span_5](start_span)[span_5](end_span)

// Setup Token Bot Admin (Taruh token lu di sini)[span_6](start_span)[span_6](end_span)
const botToken = process.env.ADMIN_BOT_TOKEN || 'TARUH_TOKEN_BOT_ADMIN_DI_SINI'; //[span_7](start_span)[span_7](end_span)

// Setup MongoDB[span_8](start_span)[span_8](end_span)
const dbName = 'test'; //[span_9](start_span)[span_9](end_span)
const collectionName = 'resellers'; //[span_10](start_span)[span_10](end_span)

// GANTI pakai ID Telegram lu sendiri[span_11](start_span)[span_11](end_span)
const ADMIN_ID = 8521019587; //[span_12](start_span)[span_12](end_span)

// Fungsi pembantu buat ngirim pesan balik ke Telegram pakai API resmi lewat fetch
const sendMessage = async (chatId, text) => {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: text })
  });
};

// Export Webhook[span_13](start_span)[span_13](end_span)
module.exports = async (req, res) => {
  // Hanya proses jika request adalah POST[span_14](start_span)[span_14](end_span)
  if (req.method !== 'POST') {
    return res.status(200).send('Webhook Admin Bot OK'); //[span_15](start_span)[span_15](end_span)
  }

  try {
    const update = req.body;

    // Pastikan update ini adalah sebuah pesan teks yang valid
    if (!update || !update.message || !update.message.text) {
      return res.status(200).send('Bukan pesan teks');
    }

    const msg = update.message;
    const chatId = msg.chat.id;
    const fromId = msg.from.id;
    const text = msg.text.trim();

    // Middleware: Keamanan, blokir kalau bukan ID lu[span_16](start_span)[span_16](end_span)
    if (fromId !== ADMIN_ID) { //[span_17](start_span)[span_17](end_span)
      await sendMessage(chatId, '⛔ Akses ditolak! Bot ini khusus buat owner.'); //[span_18](start_span)[span_18](end_span)
      return res.status(200).send('Akses ditolak');
    }

    // Pisahin text command jadi array[span_19](start_span)[span_19](end_span)
    const args = text.split(' '); //[span_20](start_span)[span_20](end_span)
    const command = args[0].toLowerCase();

    // Bikin instance baru MongoDB[span_21](start_span)[span_21](end_span)
    const client = new mongoose(mongoURI); //[span_22](start_span)[span_22](end_span)

    // Command: /menu, /start, /help[span_23](start_span)[span_23](end_span)
    if (['/start', '/menu', '/help'].includes(command)) { //[span_24](start_span)[span_24](end_span)
      const menu = `
🛠️ **PANEL KONTROL RESELLER** 🛠️

/list - Lihat semua akun reseller
/cek <email> - Cek detail satu akun
/suspend <email> - Bekukan akun (Non-aktif)
/aktif <email> - Aktifkan kembali akun
/del <email> - Hapus akun permanen
      `; //[span_25](start_span)[span_25](end_span)
      await sendMessage(chatId, menu);
    } 
    
    // Command: /list[span_26](start_span)[span_26](end_span)
    else if (command === '/list') { //[span_27](start_span)[span_27](end_span)
      try {
        await client.connect(); //[span_28](start_span)[span_28](end_span)
        const db = client.db(dbName); //[span_29](start_span)[span_29](end_span)
        const users = await db.collection(collectionName).find({}).toArray(); //[span_30](start_span)[span_30](end_span)

        if (users.length === 0) { //[span_31](start_span)[span_31](end_span)
          await sendMessage(chatId, '📂 Belum ada akun reseller yang terdaftar.'); //[span_32](start_span)[span_32](end_span)
        } else {
          let pesan = '📋 **DAFTAR AKUN RESELLER:**\n\n'; //[span_33](start_span)[span_33](end_span)
          users.forEach((user, index) => { //[span_34](start_span)[span_34](end_span)
            const status = user.status === 'suspended' ? '🔴 Suspended' : (user.status === 'verified' ? '🟢 Aktif' : '🟡 ' + user.status); //[span_35](start_span)[span_35](end_span)
            pesan += `${index + 1}. **${user.name}** (${user.email}) | ${status}\n`; //[span_36](start_span)[span_36](end_span)
          });
          await sendMessage(chatId, pesan);
        }
      } catch (error) {
        await sendMessage(chatId, '❌ Error saat mengambil data dari database.'); //[span_37](start_span)[span_37](end_span)
      } finally {
        await client.close(); // Selalu tutup koneksi setelah selesai
      }
    } 
    
    // Command: /cek[span_38](start_span)[span_38](end_span)
    else if (command === '/cek') { //[span_39](start_span)[span_39](end_span)
      if (args.length < 2) { //[span_40](start_span)[span_40](end_span)
        await sendMessage(chatId, '⚠️ Format: /cek <email>'); //[span_41](start_span)[span_41](end_span)
      } else {
        try {
          await client.connect(); //[span_42](start_span)[span_42](end_span)
          const db = client.db(dbName); //[span_43](start_span)[span_43](end_span)
          const user = await db.collection(collectionName).findOne({ email: args[1] }); //[span_44](start_span)[span_44](end_span)

          if (!user) { //[span_45](start_span)[span_45](end_span)
            await sendMessage(chatId, `❌ Akun dengan email **${args[1]}** tidak ditemukan.`); //[span_46](start_span)[span_46](end_span)
          } else {
            const detail = `
🔍 **DETAIL AKUN RESELLER** 🔍
Nama: ${user.name}
Email: ${user.email}
WA: ${user.whatsapp}
Saldo: ${user.saldo || 0}
Status: ${user.status}
Telegram: ${user.telegram}
            `; //[span_47](start_span)[span_47](end_span)
            await sendMessage(chatId, detail);
          }
        } catch (error) {
          await sendMessage(chatId, '❌ Error saat mengecek database.'); //[span_48](start_span)[span_48](end_span)
        } finally {
          await client.close();
        }
      }
    } 
    
    // Command: /suspend[span_49](start_span)[span_49](end_span)
    else if (command === '/suspend') { //[span_50](start_span)[span_50](end_span)
      if (args.length < 2) { //[span_51](start_span)[span_51](end_span)
        await sendMessage(chatId, '⚠️ Format: /suspend <email>'); //[span_52](start_span)[span_52](end_span)
      } else {
        try {
          await client.connect(); //[span_53](start_span)[span_53](end_span)
          const db = client.db(dbName); //[span_54](start_span)[span_54](end_span)
          const result = await db.collection(collectionName).updateOne( //[span_55](start_span)[span_55](end_span)
            { email: args[1] }, //[span_56](start_span)[span_56](end_span)
            { $set: { status: 'suspended' } } //[span_57](start_span)[span_57](end_span)
          );
          if (result.modifiedCount === 1) await sendMessage(chatId, `✅ Akun **${args[1]}** berhasil dibekukan.`); //[span_58](start_span)[span_58](end_span)
          else await sendMessage(chatId, `❌ Gagal suspend. Akun tidak ditemukan atau sudah tersuspend.`); //[span_59](start_span)[span_59](end_span)
        } catch (error) {
          await sendMessage(chatId, '❌ Error saat update database.'); //[span_60](start_span)[span_60](end_span)
        } finally {
          await client.close();
        }
      }
    } 
    
    // Command: /aktif[span_61](start_span)[span_61](end_span)
    else if (command === '/aktif') { //[span_62](start_span)[span_62](end_span)
      if (args.length < 2) { //[span_63](start_span)[span_63](end_span)
        await sendMessage(chatId, '⚠️ Format: /aktif <email>'); //[span_64](start_span)[span_64](end_span)
      } else {
        try {
          await client.connect(); //[span_65](start_span)[span_65](end_span)
          const db = client.db(dbName); //[span_66](start_span)[span_66](end_span)
          const result = await db.collection(collectionName).updateOne( //[span_67](start_span)[span_67](end_span)
            { email: args[1] }, //[span_68](start_span)[span_68](end_span)
            { $set: { status: 'verified' } } //[span_69](start_span)[span_69](end_span)
          );
          if (result.modifiedCount === 1) await sendMessage(chatId, `✅ Akun **${args[1]}** diaktifkan kembali.`); //[span_70](start_span)[span_70](end_span)
          else await sendMessage(chatId, `❌ Gagal. Akun tidak ditemukan atau sudah aktif.`); //[span_71](start_span)[span_71](end_span)
        } catch (error) {
          await sendMessage(chatId, '❌ Error saat update database.'); //[span_72](start_span)[span_72](end_span)
        } finally {
          await client.close();
        }
      }
    } 
    
    // Command: /del[span_73](start_span)[span_73](end_span)
    else if (command === '/del') { //[span_74](start_span)[span_74](end_span)
      if (args.length < 2) { //[span_75](start_span)[span_75](end_span)
        await sendMessage(chatId, '⚠️ Format: /del <email>'); //[span_76](start_span)[span_76](end_span)
      } else {
        try {
          await client.connect(); //[span_77](start_span)[span_77](end_span)
          const db = client.db(dbName); //[span_78](start_span)[span_78](end_span)
          const result = await db.collection(collectionName).deleteOne({ email: args[1] }); //[span_79](start_span)[span_79](end_span)
          if (result.deletedCount === 1) await sendMessage(chatId, `✅ Akun **${args[1]}** dihapus permanen.`); //[span_80](start_span)[span_80](end_span)
          else await sendMessage(chatId, `❌ Gagal. Email **${args[1]}** tidak ditemukan.`); //[span_81](start_span)[span_81](end_span)
        } catch (error) {
          await sendMessage(chatId, '❌ Error pas nyoba hapus data di MongoDB.'); //[span_82](start_span)[span_82](end_span)
        } finally {
          await client.close();
        }
      }
    }

    res.status(200).send('Webhook Admin Bot OK'); //[span_83](start_span)[span_83](end_span)
  } catch (err) {
    console.error(err);
    res.status(500).send('Something went wrong'); //[span_84](start_span)[span_84](end_span)
  }
};
