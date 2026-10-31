# API Contract — Peak-Forge

قرارداد درخواست/پاسخ فرانت و بک‌اند. همه‌ی مسیرها زیر `http://localhost:3000/api`
سرو می‌شوند و پاسخ‌ها JSON هستند.

دسترسی: **عمومی** = بدون توکن · **توکن** = نیاز به `Authorization: Bearer <JWT>`
· **مربی/ورزشکار** = توکن + نقش مناسب (کنترل سمت بک‌اند).

خطاهای عمومی همه‌ی مسیرها: `401` توکن نامعتبر/ناموجود · `500` خطای سرور.
خطاهای اختصاصی هر مسیر در ستون آخر آمده است.

## Auth — `/api/auth`

| متد و مسیر | دسترسی | ورودی | پاسخ موفق | خطاها |
|---|---|---|---|---|
| POST `/signup` | عمومی | `role, first, last, email, password, country?, city?, height?/weight? (ورزشکار)، years?/cert? (مربی)` | `201` پیام + `token` + `user` | ۴۰۰ فیلد ناقص/نقش نامعتبر · ۴۰۹ ایمیل تکراری |
| POST `/login` | عمومی | `email, password` | `token` + `user` | ۴۰۱ ایمیل یا رمز اشتباه |
| GET `/me` | توکن | — | `user` + `profile` | — |
| POST `/forgot` | عمومی | `email` | پیام (+ `reset_code` — شبیه‌سازی ایمیل؛ برای ایمیل ناشناس بدون کد) | ۴۰۰ ایمیل ناقص |
| POST `/reset` | عمومی | `email, code, new_password` | پیام موفقیت | ۴۰۰ فیلد ناقص · رمز <۶ کاراکتر · کد اشتباه/منقضی/مصرف‌شده |

## Profile — `/api/profile`

| متد و مسیر | دسترسی | ورودی | پاسخ موفق | خطاها |
|---|---|---|---|---|
| GET `/` | توکن | — | `user` + `profile` (قد/وزن یا سابقه/مدرک) | — |
| PATCH `/` | توکن | `first_name?, last_name?, city?, country?, height?, weight?، experience_years?, certifications?` | پیام به‌روزرسانی | — |
| GET `/weight` | ورزشکار | — | سری `logs (log_date, weight, body_fat)` | ۴۰۳ |
| POST `/weight` | ورزشکار | `weight?، body_fat?` (upsert روزانه) | پیام | ۴۰۰ مقادیر نامعتبر · ۴۰۳ مربی |
| GET `/records` | ورزشکار | — | `records` (نزولی) | ۴۰۳ |
| POST `/records` | ورزشکار | `exercise_name, weight, reps?` | `201` رکورد + XP ۵۰ | ۴۰۰ نام/وزن نامعتبر |
| GET `/analytics` | ورزشکار | — | `week` (۷ روز: پایبندی تمرین/رژیم)، `weight_series` (۹۰ روز)، `totals` (sessions, streak, total_done)، `records` | ۴۰۳ |
| GET `/game` | ورزشکار | — | `xp, level, coins, rank, streak, badges` | ۴۰۳ |
| POST `/upgrade` | توکن | — | پیام + `user` با `tier:'premium'` (خرید شبیه‌سازی‌شده) | — |
| GET `/stats/coach` | مربی | — | `athlete_count` | ۴۰۳ |

## Workouts — `/api/workouts`

| متد و مسیر | دسترسی | ورودی | پاسخ موفق | خطاها |
|---|---|---|---|---|
| GET `/programs` | توکن | — | مربی: برنامه‌های خودش با `sent_count` · ورزشکار: برنامه‌های انتسابی با `assigned_at` | — |
| POST `/programs` | مربی | `name, type?, weeks?` | `201` برنامه | ۴۰۰ نام ناقص · ۴۰۳ |
| PATCH `/programs/:id` | مربی | `name?, weeks?` | برنامه‌ی به‌روزشده | ۴۰۴ برنامه‌ی دیگری |
| DELETE `/programs/:id` | مربی | — | حذف + cascade حرکات/انتساب‌ها | ۴۰۴ |
| POST `/programs/:id/copy` | مربی | `name?` | `201` کپی + `exercises_copied` | ۴۰۴ |
| GET `/programs/:id/exercises` | توکن | — | `exercises` مرتب با `sort_order` | — |
| POST `/programs/:id/exercises` | مربی | `name, sets?, rest?, day_index?, day_name?, focus?` | `201` حرکت | ۴۰۰ نام ناقص |
| DELETE `/programs/:id/exercises/:exId` | مربی | — | حذف حرکت | ۴۰۴ |
| POST `/programs/:id/assign` | مربی | `athlete_id` | انتساب + ساخت خودکار لینک `coach_athletes` | ۴۰۰ · ۴۰۴ برنامه‌ی دیگری |
| GET `/log` | ورزشکار | — | تیک‌های امروز | ۴۰۳ |
| POST `/log` | ورزشکار | `exercise_id, done` | ثبت (+XP ۱۰ اگر اولین تیک روز) | ۴۰۳ |
| GET `/sets` | ورزشکار | `?exercise_id` | ست‌های امروز | ۴۰۰ · ۴۰۳ |
| POST `/sets` | ورزشکار | `exercise_id, sets:[{weight,reps}]` (≤۲۰) | جایگزینی ست‌های امروز | ۴۰۰ مقدار نامعتبر · ۴۰۴ حرکت |
| GET `/athletes` | مربی | — | شاگردانِ متصل | ۴۰۳ |

## Diet — `/api/diet`

| متد و مسیر | دسترسی | ورودی | پاسخ موفق | خطاها |
|---|---|---|---|---|
| GET `/plans` | توکن | — | مربی: برنامه‌های خودش · ورزشکار: انتسابی‌ها | — |
| POST `/plans` | مربی | `name, weeks?` | `201` برنامه | ۴۰۰ |
| PATCH `/plans/:id` | مربی | `name?, weeks?` | به‌روزرسانی | ۴۰۴ |
| DELETE `/plans/:id` | مربی | — | حذف + cascade | ۴۰۴ |
| POST `/plans/:id/copy` | مربی | `name?` | `201` کپی + `meals_copied` | ۴۰۴ |
| GET `/plans/:id/meals` | توکن | — | `meals` (با kcal/alt) | — |
| POST `/plans/:id/meals` | مربی | `name, time?, items?, kcal?, alt?` | `201` وعده | ۴۰۰ |
| DELETE `/plans/:planId/meals/:mealId` | مربی | — | حذف وعده | — |
| POST `/plans/:id/assign` | مربی | `athlete_id` | انتساب + لینک خودکار | ۴۰۰ · ۴۰۴ |
| GET `/log` · POST `/log` | ورزشکار | `meal_id, done` | تیک روزانه (+XP ۵) | ۴۰۳ |

## Chat — `/api/chat`

| متد و مسیر | دسترسی | ورودی | پاسخ موفق | خطاها |
|---|---|---|---|---|
| GET `/conversations` | توکن | — | مکالمات با `last_text, unread, pending_priority` | — |
| GET `/messages/:peerId` | توکن | — | تاریخچه + `peer` (ورودی‌ها `is_read` می‌شوند) | ۴۰۰ خودم · ۴۰۳ غیرمتصل |
| POST `/messages` | توکن | `receiver_id, text, is_priority?` | `201` پیام؛ پاسخ مربی، اولویت‌دارهای شاگرد را answered می‌کند | ۴۰۰ · ۴۰۳ غیرمتصل |
| GET `/forums` | توکن | — | تالارهای مربیِ متصل (با `members`) | — |
| POST `/forums` | مربی | `name` | `201` تالار | ۴۰۰ · ۴۰۳ ورزشکار |
| DELETE `/forums/:id` | مربی | — | حذف + پیام‌هایش | ۴۰۴ |
| GET `/forums/:id/messages` | توکن | — | تاریخچه با `sender_name/role` | ۴۰۴ بدون دسترسی |
| POST `/forums/:id/messages` | توکن | `text` | `201` | ۴۰۰ · ۴۰۴ |
| GET `/unread` | توکن | — | مجموع نخوانده‌های DM | — |

## Coach — `/api/coach`

| متد و مسیر | دسترسی | ورودی | پاسخ موفق | خطاها |
|---|---|---|---|---|
| GET `/athletes` | مربی | — | شاگردان با `adherence, idle, sessions, sessions_month, weight_delta, record, new_record, category` | ۴۰۳ |
| POST `/athletes` | مربی | `email` | `201` لینک شاگرد | ۴۰۳ سقف ۵ رایگان (`premium:true`) · ۴۰۴ ثبت‌نام‌نشده · ۴۰۹ تکراری |
| PATCH `/athletes/:id/category` | مربی | `category` | ذخیره دسته | ۴۰۰ طول >۴۰ · ۴۰۴ |
| GET `/athletes/:id/detail` | مربی | — | پایبندی تفکیکی، `weight_series`، رکوردها، برنامه‌های ارسالی | ۴۰۴ غیرمتصل |
| GET `/settings` | مربی | — | `idle_days, auto_remind, alert_weight, alert_pr, priority_inbox` | ۴۰۳ |
| PATCH `/settings` | مربی | هر زیرمجموعه (idle_days با clamp ۱–۳۰) | upsert تنظیمات | ۴۰۳ |
| GET `/schedule` · POST `/schedule` | مربی | `day_index(0-6), plan_kind(workout/diet), plan_id, target?` | تقویم هفتگی | ۴۰۰ روز نامعتبر · ۴۰۴ قالبِ دیگری |
| DELETE `/schedule/:id` | مربی | — | حذف ورودی | — |
| GET `/honors` · POST `/honors` | مربی | `title, detail?` | افتخارات مربی | ۴۰۰ عنوان ناقص |
| DELETE `/honors/:id` | مربی | — | حذف افتخار | — |

## Health

| متد و مسیر | دسترسی | پاسخ |
|---|---|---|
| GET `/api/health` | عمومی | `{status:'ok', time}` |
