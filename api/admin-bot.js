const { Telegraf } = require('telegraf');
const { MongoClient } = require('mongodb');

// Narik URL Mongo dari index.js
const { mongoURI } = require('./index.js'); 

// Setup Token Bot Admin (Taruh token lu di sini)
const botToken = process.env.ADMIN_BOT_TOKEN || 'TARUH_TOKEN_BOT_ADMIN_DI_SINI';
const bot = new Telegraf(botToken);

// Setup MongoDB pakai settingan bawaan Mongoose lu
const client = new MongoClient(mongoURI);
const dbName = 'test'; 
const collectionName = 'resellers'; 

// GANTI pakai ID Telegram lu sendiri
const ADMIN_ID = 8521019587; 

// Middleware: Keamanan
bot.use(async (ctx, next) => {
  if (ctx.from?.id !== ADMIN_ID) {
    return ctx.reply('⛔ Akses ditolak! Bot ini khusus buat owner.');
  }
  return next();
});

// Command: /menu
bot.command(['start', 'menu', 'help'], (ctx) => {
  const menu = `
🛠️ **PANEL KONTROL RESELLER** 🛠️

/list - Lihat semua akun reseller
/cek <email> - Cek detail satu akun
/suspend <email> - Bekukan akun (Non-aktif)
/aktif <email> - Aktifkan kembali akun
/del <email> - Hapus akun permanen
  `;
  ctx.reply(menu);
});

// Command: /list
bot.command('list', async (ctx) => {
  try {
    await client.connect();
    const db = client.db(dbName);
    const users = await db.collection(collectionName).find({}).toArray();

    if (users.length === 0) return ctx.reply('📂 Belum ada akun reseller yang terdaftar.');

    let pesan = '📋 **DAFTAR AKUN RESELLER:**\n\n';
    users.forEach((user, index) => {
      const status = user.status === 'suspended' ? '🔴 Suspended' : (user.status === 'verified' ? '🟢 Aktif' : '🟡 ' + user.status);
      pesan += `${index + 1}. **${user.name}** (${user.email}) | ${status}\n`;
    });
    ctx.reply(pesan);
  } catch (error) {
    ctx.reply('❌ Error saat mengambil data dari database.');
  }
});

// Command: /cek
bot.command('cek', async (ctx) => {
  const args = ctx.message.text.split(' ');
  if (args.length < 2) return ctx.reply('⚠️ Format: /cek <email>');
  
  try {
    await client.connect();
    const db = client.db(dbName);
    const user = await db.collection(collectionName).findOne({ email: args[1] });

    if (!user) return ctx.reply(`❌ Akun dengan email **${args[1]}** tidak ditemukan.`);

    const detail = `
🔍 **DETAIL AKUN RESELLER** 🔍
Nama: ${user.name}
Email: ${user.email}
WA: ${user.whatsapp}
Saldo: ${user.saldo || 0}
Status: ${user.status}
Telegram: ${user.telegram}
    `;
    ctx.reply(detail);
  } catch (error) {
    ctx.reply('❌ Error saat mengecek database.');
  }
});

// Command: /suspend
bot.command('suspend', async (ctx) => {
  const args = ctx.message.text.split(' ');
  if (args.length < 2) return ctx.reply('⚠️ Format: /suspend <email>');
  
  try {
    await client.connect();
    const db = client.db(dbName);
    const result = await db.collection(collectionName).updateOne(
      { email: args[1] },
      { $set: { status: 'suspended' } }
    );
    if (result.modifiedCount === 1) ctx.reply(`✅ Akun **${args[1]}** berhasil dibekukan.`);
    else ctx.reply(`❌ Gagal suspend. Akun tidak ditemukan atau sudah tersuspend.`);
  } catch (error) {
    ctx.reply('❌ Error saat update database.');
  }
});

// Command: /aktif
bot.command('aktif', async (ctx) => {
  const args = ctx.message.text.split(' ');
  if (args.length < 2) return ctx.reply('⚠️ Format: /aktif <email>');
  
  try {
    await client.connect();
    const db = client.db(dbName);
    const result = await db.collection(collectionName).updateOne(
      { email: args[1] },
      { $set: { status: 'verified' } }
    );
    if (result.modifiedCount === 1) ctx.reply(`✅ Akun **${args[1]}** diaktifkan kembali.`);
    else ctx.reply(`❌ Gagal. Akun tidak ditemukan atau sudah aktif.`);
  } catch (error) {
    ctx.reply('❌ Error saat update database.');
  }
});

// Command: /del
bot.command('del', async (ctx) => {
  const args = ctx.message.text.split(' ');
  if (args.length < 2) return ctx.reply('⚠️ Format: /del <email>');
  
  try {
    await client.connect();
    const db = client.db(dbName);
    const result = await db.collection(collectionName).deleteOne({ email: args[1] });
    if (result.deletedCount === 1) ctx.reply(`✅ Akun **${args[1]}** dihapus permanen.`);
    else ctx.reply(`❌ Gagal. Email **${args[1]}** tidak ditemukan.`);
  } catch (error) {
    ctx.reply('❌ Error pas nyoba hapus data di MongoDB.');
  }
});

// Export Webhook
module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') await bot.handleUpdate(req.body);
    res.status(200).send('Webhook Admin Bot OK');
  } catch (err) {
    res.status(500).send('Something went wrong');
  }
};
