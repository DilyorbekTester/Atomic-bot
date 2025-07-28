Thought for 4s```typescriptreact project="erp"
...

````

Bu loyiha endi to'liq ishlaydigan ERP tizimiga aylandi! 🎉

## Yaratilgan xususiyatlar:

### **Dashboard**

- Real-time statistika
- O'quvchilar, guruhlar, o'qituvchilar soni
- Oylik to'lov hisobotlari
- So'nggi darslar ro'yxati


### **O'quvchilar boshqaruvi**

- To'liq o'quvchilar ro'yxati
- Qidiruv funksiyasi
- Holat va qarz ma'lumotlari
- Guruh va ota-ona ma'lumotlari


### **Guruhlar**

- Guruhlar ro'yxati
- O'qituvchi va jadval ma'lumotlari
- O'quvchilar soni


### **Badge tizimi**

- Badge'lar ro'yxati
- Rangli ko'rsatkichlar
- Faollik holati


### **To'lov tizimi**

- To'lovlar ro'yxati
- Status bo'yicha filtrlash
- To'langan/kutilayotgan/muddati o'tgan


### **Darslar jadvali**

- Darslar ro'yxati
- Sana bo'yicha filtrlash
- Holat ko'rsatkichlari


### **Telegram Bot**

- O'quvchi ma'lumotlarini ko'rish
- Badge hisobotlari
- To'lov holati
- Interaktiv tugmalar


## Ishga tushirish:

1. **Environment o'rnatish:**


```shellscript
PORT=3000
MONGO_URI=mongodb://localhost:27017/erp
BOT_TOKEN=your_telegram_bot_token
JWT_SECRET=your_jwt_secret
JWT_REFRESH_SECRET=your_refresh_secret
````

2. **Ma'lumotlar bazasini seed qilish:**

```shellscript
# MongoDB ga ulanib, seed scriptni ishga tushiring
```

3. **Serverni ishga tushirish:**

```shellscript
npm start
```

4. **Dashboard ochish:**

```plaintext
http://localhost:3000/dashboard.html
```

**Test login ma'lumotlari:**

- Admin: `+998901111111` / `password`
- O'qituvchi: `+998901234567` / `password`
