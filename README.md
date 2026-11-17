# มินซ่า (Minza) — Discord Voice Bot 🎙️✨

บอท Discord คุยโต้ตอบด้วยเสียงแบบเรียลไทม์ รับบทเป็น **มินซ่า (Minza)** Frontend Engineer สาวสายคลั่ง AI

## สถาปัตยกรรมการทำงาน
1. **รับเสียงจาก Voice Channel (`@discordjs/voice` + `prism-media` + `opusscript`)** — ฟังเสียงผู้พูดในห้อง แปลงเป็น WAV พร้อมกรองเสียงรบกวน/ความเงียบ
2. **ฟังและคิดคำตอบด้วย Gemini (`@google/genai`)** — ส่งไฟล์เสียงให้ Gemini (`gemini-3.8-flash`) ฟังโดยตรงและตอบกลับในบุคลิกของมินซ่า พร้อมจำบริบทการคุยในเซิร์ฟเวอร์
3. **สังเคราะห์เสียงพูด (`msedge-tts`)** — แปลงข้อความเป็นเสียงภาษาไทยธรรมชาติ (`th-TH-PremwadeeNeural`) และเล่นกลับเข้าไปใน Discord Voice Channel

---

## วิธีตั้งค่าและรันโปรเจกต์

### 1. ตั้งค่าไฟล์ `.env`
คัดลอกไฟล์ตัวอย่างแล้วใส่ Key ของคุณ:
```bash
cp .env.example .env
```
- `DISCORD_TOKEN`: ได้จาก [Discord Developer Portal](https://discord.com/developers/applications) -> เมนู **Bot** -> **Reset Token**
- `GEMINI_API_KEY`: ได้จาก [Google AI Studio](https://aistudio.google.com/apikey)

### 2. เปิดสิทธิ์ (Intents) ใน Discord Developer Portal
ไปที่หน้า **Bot** ของแอปคุณ แล้วเปิด:
- **Message Content Intent** (สำหรับคำสั่ง `!join`, `!ask`, `!leave`, `!reset`)

และตอนเชิญบอทเข้า Server (เมนู **OAuth2 -> URL Generator**):
- Scopes: `bot`, `applications.commands`
- Bot Permissions: `View Channels`, `Send Messages`, `Connect`, `Speak`, `Use Voice Activity`

### 3. รันบอท
```bash
# โหมดพัฒนา (Auto-reload)
npm run dev

# หรือ Build แล้วรัน
npm run build
npm start
```

---

## คำสั่งที่ใช้ได้ใน Discord
- `/join` หรือ `!join` — เรียกมินซ่าเข้า Voice Channel ที่คุณอยู่ แล้วเปิดไมค์คุยได้เลย!
- `/leave` หรือ `!leave` — ให้มินซ่าออกจาก Voice Channel
- `/ask <ข้อความ>` หรือ `!ask <ข้อความ>` — พิมพ์คุยกับมินซ่า (ถ้ามินซ่าอยู่ในห้องเสียง จะพูดตอบด้วย)
- `/reset` หรือ `!reset` — ล้างความจำบทสนทนาของมินซ่าในเซิร์ฟเวอร์
- `!help` — ดูรายการคำสั่งทั้งหมด
