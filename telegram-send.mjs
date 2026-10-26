/* Sends one or more message files to the Telegram bot's subscribers.
   Usage: node budsignal/telegram-send.mjs <file.html> [...]
   Files are Telegram-HTML (b/i/code/a tags only), split at 4000 chars.
   Chat ids: TELEGRAM_CHAT_ID plus the notifier's cached .notify-state.json. */
import { readFileSync } from 'node:fs';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) { console.error('TELEGRAM_BOT_TOKEN is required'); process.exit(1); }
const chats = new Set();
if (process.env.TELEGRAM_CHAT_ID) chats.add(String(process.env.TELEGRAM_CHAT_ID));
try { for (const c of JSON.parse(readFileSync(process.env.STATE_FILE || '.notify-state.json', 'utf8')).chats || []) chats.add(String(c)); } catch { /* no state */ }
if (!chats.size) { console.error('no chat ids known'); process.exit(1); }

function chunks(text, max = 4000) {
  const out = [];
  let cur = '';
  for (const line of text.split('\n')) {
    if (cur.length + line.length + 1 > max) { out.push(cur); cur = ''; }
    cur += (cur ? '\n' : '') + line;
  }
  if (cur) out.push(cur);
  return out;
}

let failures = 0;
for (const file of process.argv.slice(2)) {
  const text = readFileSync(file, 'utf8').trim();
  for (const chat of chats) {
    for (const part of chunks(text)) {
      try {
        const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chat_id: chat, parse_mode: 'HTML', text: part, disable_web_page_preview: true }),
          signal: AbortSignal.timeout(15000),
        });
        const j = await r.json();
        if (j.ok) console.log(`sent ${file} to chat ${String(chat).slice(0, 3)}…`);
        else { failures++; console.log(`WARN chat ${chat}: ${j.description}`); }
      } catch (e) { failures++; console.log(`WARN chat ${chat}: ${e.message}`); }
    }
  }
}
// A blocked chat must not fail the run as long as someone received it.
process.exit(failures && failures >= chats.size ? 1 : 0);
