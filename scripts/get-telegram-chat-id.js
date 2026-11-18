// scripts/get-telegram-chat-id.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('❌ TELEGRAM_BOT_TOKEN not found in .env');
  process.exit(1);
}

const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

async function main() {
  console.log('🔍 Checking Telegram for incoming messages to your bot...');
  const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
  const data = await res.json();

  if (!data.ok) {
    console.error('❌ Telegram error:', data.description);
    process.exit(1);
  }

  const updates = data.result || [];
  if (updates.length === 0) {
    console.log('\n⚠️ No messages found yet.');
    console.log('👉 Please open https://t.me/Job2303_bot in Telegram and click "Start" (or send "hello").');
    console.log('Then run this script again or reply "done".');
    process.exit(0);
  }

  // Get the most recent message's chat ID
  const lastMsg = updates[updates.length - 1];
  const chat = lastMsg.message?.chat || lastMsg.my_chat_member?.chat;

  if (!chat || !chat.id) {
    console.log('⚠️ Could not find chat ID in updates:', JSON.stringify(updates, null, 2));
    process.exit(1);
  }

  const chatId = String(chat.id);
  const userName = chat.first_name || chat.username || 'User';
  console.log(`✅ Found chat from: ${userName} (ID: ${chatId})`);

  // Update .env
  const envPath = path.join(ROOT, '.env');
  let envContent = fs.readFileSync(envPath, 'utf8');
  if (envContent.includes('TELEGRAM_CHAT_ID=')) {
    envContent = envContent.replace(/TELEGRAM_CHAT_ID=.*(\r?\n|$)/, `TELEGRAM_CHAT_ID=${chatId}$1`);
  } else {
    envContent += `\nTELEGRAM_CHAT_ID=${chatId}\n`;
  }
  fs.writeFileSync(envPath, envContent, 'utf8');
  console.log(`💾 Saved TELEGRAM_CHAT_ID=${chatId} to .env!`);
}

main().catch(console.error);
