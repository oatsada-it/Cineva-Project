# Doซีรี่ย์ VIP — Full Key + Admin

## เปิดใช้งานบน Windows
1. ติดตั้ง Node.js 18+
2. แตก ZIP
3. เปิด CMD ในโฟลเดอร์
4. รัน `npm install`
5. รัน `npm start`
6. เปิด `http://localhost:3000`

## ลูกค้า
หน้าเข้าเว็บ:
`http://localhost:3000`

ลูกค้ากรอก Key ที่แอดมินสร้าง แล้วระบบจะตรวจสอบ Key จาก SQLite จริง

## แอดมิน
หน้า:
`http://localhost:3000/admin`

ค่าเริ่มต้น:
Username: `admin`
Password: `ChangeMe-123!`

### ความสามารถหลังบ้าน
- สร้าง Key กำหนดจำนวนวัน
- ค้นหา Key
- ตรวจสอบรายละเอียด Key
- ดูสถานะ เปิด/ปิด/หมดอายุ
- เพิ่มเวลา +1 / +7 วัน
- ลดเวลา -1 / -7 วัน
- เปิด/ปิด Key
- ลบ Key
- Copy Key
- ดูสถิติ Key ทั้งหมด / ใช้งานได้ / หมดอายุ

ก่อนเอาขึ้นออนไลน์จริง ให้เปลี่ยน ADMIN_PASSWORD และ SESSION_SECRET และใช้ HTTPS
