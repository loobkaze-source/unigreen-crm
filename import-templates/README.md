# เทมเพลตนำเข้าข้อมูล (Bulk import templates)

ไฟล์ Excel สำหรับกรอกข้อมูลทีละมากๆ แยกเป็น 3 ไฟล์ตามชนิดข้อมูล

| ไฟล์ | ปลายทาง | คอลัมน์ | จำเป็นต้องกรอก |
| --- | --- | --- | --- |
| `import-template-sites.xlsx` | `public.sites` (ไซต์งาน) | 8 | `name` |
| `import-template-assets.xlsx` | `public.equipment` (Asset) | 14 | `site_name`, `name`, `asset_type`, `category` |
| `import-template-service-contracts.xlsx` | `public.service_contracts` (สัญญาบริการ) | 12 | `title`, `service_type`, `start_date` |

แต่ละไฟล์มี 3 ชีต

- **ข้อมูล** — กรอกจริงที่นี่ แถวที่ 1 เป็นหัวคอลัมน์ (ตรึงไว้ + มี filter) หัวสีส้มคือช่องบังคับ สีเขียวคือเว้นว่างได้ ช่องที่เป็นตัวเลือกมี dropdown ให้เลือก
- **ตัวอย่าง** — ตัวอย่างการกรอก 3–4 แถว ไว้ดูรูปแบบอย่างเดียว
- **คำอธิบาย** — อธิบายทุกคอลัมน์ ทั้งชนิดข้อมูล ค่าที่ยอมรับ และวิธีจับคู่ข้อมูล

## ลำดับการนำเข้า

บริษัท/ผู้ติดต่อ/ช่าง ต้องมีอยู่ในระบบก่อน จากนั้น

1. **ไซต์งาน** — จับคู่บริษัทด้วย `customer_code` ก่อน ถ้าเว้นว่างจึงใช้ `company_name`
2. **Asset** — ต้องผูกกับไซต์ที่มีแล้ว (`site_name`)
3. **สัญญาบริการ** — อ้างถึงไซต์ด้วย `site_name`

## สิ่งที่ระบบเติมให้เอง (ไม่มีในเทมเพลต)

- **รหัส Asset** `AS-0001`, `AS-0002`, … — trigger `set_equipment_code` ออกให้ตอน insert
- **`service_contracts.end_date`** — คำนวณจาก `start_date + (duration_years × 12)` เดือน
- **`service_visits`** — รอบเข้าบริการ สร้างเท่ากับ `frequency_per_year × duration_years` รอบ ห่างกันรอบละ `12 ÷ frequency_per_year` เดือน นับจาก `start_date`

  ตัวอย่าง: 2 ครั้ง/ปี × 5 ปี = 10 รอบ ห่างกันรอบละ 6 เดือน

## ข้อควรทราบ

ตอนนี้แอปยังไม่มีหน้าอัปโหลดไฟล์เหล่านี้ — เทมเพลตเป็นแค่รูปแบบที่ตกลงกันไว้ ยังต้องมีตัวนำเข้า (หน้าอัปโหลดในแอป หรือสคริปต์ที่อ่านไฟล์แล้วยิงเข้า Supabase) มารับอีกที ตัวนำเข้าต้องแปลงชื่อ (`company_name`, `site_name`, `technician_name`, `group_name`) เป็น UUID เอง และต้องสร้าง `service_visits` ต่อจากสัญญาแต่ละฉบับด้วย

## แก้ไขเทมเพลต

อย่าแก้ไฟล์ `.xlsx` ตรงๆ — แก้ที่ spec แล้วสร้างใหม่

```bash
node scripts/gen-import-templates.mjs
```

สเปกคอลัมน์ (ชื่อหัวคอลัมน์ ค่าที่ยอมรับ ตัวอย่าง คำอธิบาย) อยู่ต้นไฟล์
[`scripts/gen-import-templates.mjs`](../scripts/gen-import-templates.mjs) แก้ที่เดียวแล้วทั้งสามชีตอัปเดตตาม
