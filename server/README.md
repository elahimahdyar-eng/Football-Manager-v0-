# سرور «مدیر تیم» — گام ۲ برنامه‌ی آنلاین

سرور حداقلی که **همان `js/engine.js` کلاینت** را اجرا می‌کند و نتیجه‌ها را تأیید می‌کند.
بدون هیچ وابستگی npm — فقط `http`، `fs`، `crypto` خود Node (نسخه‌ی ۱۸ به بالا کافی است).

```
server/
├── index.js         ← سرور: API + سرو کردن فایل‌های بازی + صفحه‌ی وضعیت
├── engine-node.js   ← پل موتور: js/engine.js را بدون تغییر اجرا می‌کند
├── store.js         ← ذخیره‌ی JSON با نوشتن اتمیک (جای دیتابیس، برای گام ۲)
└── README.md
```

---

## اجرا

```bash
node server/index.js
# بازی:      http://localhost:8081/
# وضعیت:     http://localhost:8081/server
```

متغیرهای محیطی:

| متغیر | پیش‌فرض | کار |
|---|---|---|
| `PORT` | `8081` | پورت سرور |
| `HOST` | `0.0.0.0` | آدرس اتصال |
| `DATA_DIR` | `server-data/` | محل فایل `db.json` |
| `SECRET` | `dev-secret-change-me` | کلید امضای کدهای ورود — **در production حتماً عوضش کن** |
| `DEV_OTP` | اگر `NODE_ENV≠production` روشن | کد ورود در پاسخ API و در کنسول چاپ می‌شود (برای تست) |
| `SMS_API_KEY` / `SMS_TEMPLATE` | — | ارسال واقعی پیامک با کاوه‌نگار (اختیاری) |

نمونه‌ی production:

```bash
NODE_ENV=production SECRET="$(openssl rand -hex 32)" DEV_OTP=0 \
SMS_API_KEY=xxxx SMS_TEMPLATE=football-login PORT=8080 node server/index.js
```

## تست

```bash
node tools/server-test.js         # ۵۴ بررسی E2E روی یک سرور واقعی (پورت تصادفی، داده‌ی موقت)
node tools/client-online-test.js  # ۳۷ بررسی یکپارچه: کلاینت واقعی ⇄ سرور واقعی (fetch واقعی، بدون mock)
node tools/smoketest.js           # ۱۱۳ بررسی کل بازی (آفلاین، بدون سرور)
node tools/engine-parity.js   # اثبات قطعیت موتور (کلاینت ↔ سرور)
```

## API

| متد | مسیر | کار |
|---|---|---|
| `GET` | `/api/health` | سلامت + اثر انگشت موتور |
| `GET` | `/api/engine-fingerprint` | نسخه و اثر انگشت موتور (برای مقایسه با کلاینت) |
| `POST` | `/api/auth/otp` | درخواست کد یک‌بارمصرف `{phone}` |
| `POST` | `/api/auth/verify` | ورود `{phone, code, clubName}` ⇒ `{token}` |
| `GET` | `/api/me` | باشگاه و لیگ‌های من (Bearer) |
| `POST` | `/api/squad` | آپلود ترکیب/تاکتیک (Bearer) |
| `POST` | `/api/leagues` | ساخت لیگ (Bearer) |
| `POST` | `/api/leagues/:id/join` | عضویت در لیگ (Bearer) |
| `GET` | `/api/leagues/:id` | جدول + برنامه + seedهای دور (Bearer) |
| `POST` | `/api/leagues/:id/simulate` | سرور خودش دور جاری را بازی می‌کند (Bearer) |
| `POST` | `/api/leagues/:id/verify` | تأیید/رد نتیجه‌ی اعلامی کلاینت (Bearer) |
| `GET` | `/api/matches/:id` | گزارش کامل یک مسابقه |

## ضدتقلب (چرا کار می‌کند)

```
کلاینت: seed را از سرور می‌گیرد → نتیجه را نمایش می‌دهد (لذت + ری‌پلی)
سرور:   همان موتور، همان seed → نتیجه را مستقل حساب می‌کند
        نتیجه‌ی اعلامی کلاینت فقط وقتی پذیرفته می‌شود که بازتولید شود
```

- **seed قابل انتخاب نیست:** `hash(شناسه‌ی لیگ + دور + نام دو تیم مرتب‌شده)` — منطق مشترک در `js/league-core.js`
- **قدرت تیم قابل جعل نیست:** عدد `atk/def` اعلامی کلاینت داخل محدوده‌ی معقول بازیکنانش محدود می‌شود
  (سقف = بهترین بازیکن تیم × ۱.۱۵ + ۶)
- **کد ورود خام ذخیره نمی‌شود:** HMAC-SHA256 با `SECRET`؛ کد ۲ دقیقه اعتبار، حداکثر ۶ تلاش
- **محدودیت نرخ:** ۵ درخواست کد و ۱۰ تلاش تأیید در ۱۰ دقیقه برای هر شماره

## استقرار (Deploy)

سرور هیچ وابستگی‌ای ندارد، پس هر جایی که Node 18+ دارد کافی است:

**لیارا / آروان (پیشنهاد برای کاربر ایرانی — تأخیر کم):**
```
پلتفرم: Node.js · دستور اجرا: node server/index.js · پورت: از متغیر PORT
متغیرها: NODE_ENV=production, SECRET=..., SMS_API_KEY=...
```
نکته: فایل `server-data/db.json` روی دیسک پایدار بنشیند (وگرنه با هر دیپلوی پاک می‌شود).

**هر VPS (systemd):**
```ini
[Service]
WorkingDirectory=/srv/football-manager
ExecStart=/usr/bin/node server/index.js
Environment=NODE_ENV=production
Environment=SECRET=...
Restart=always
```

**نکات امنیتی production:**
1. `SECRET` تصادفی و بلند (۳۲ بایت هگز)
2. `DEV_OTP=0` تا کد ورود در پاسخ برنگردد
3. پشت HTTPS (Cloudflare/لیارا خودشان می‌دهند)
4. پشتیبان‌گیری دوره‌ای از `server-data/db.json`
5. اگر تعداد کاربر بالا رفت ⇒ مهاجرت از `store.js` به Postgres (فقط همین یک فایل عوض می‌شود)

## گام بعدی (طبق `PLAN-ONLINE.md`)

- ✅ اتصال کلاینت انجام شد: تب «آنلاین» (`js/online.js`)
- لیگ هفتگی با پنجره‌ی ثبت ترکیب + اعلان PWA
- هرم صعود/سقوط (گروه‌های ۸ تایی) و AI جانشین برای تیم‌های خالی
