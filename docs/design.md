# Design Views — Peak-Forge

چهار نمای طراحی الزامی سند پروژه + توجیه فنی. نمودارها Mermaid هستند و در
GitHub مستقیماً رندر می‌شوند.

## ۱) UML Use Case — بازیگران و کارها

```mermaid
flowchart LR
    athlete([ورزشکار])
    coach([مربی])

    subgraph Peak-Forge
        signup([ثبت‌نام / ورود / خروج])
        tick([تیک تمرین و وعده‌ی روزانه])
        sets([ثبت وزن و تکرار هر ست])
        body([ثبت وزن و چربی بدن])
        chat([چت مستقیم با مربی / شاگرد])
        progress([دیدن روند وزن و پایبندی])
        records([ثبت رکورد شخصی])
        build([ساخت برنامه‌ی تمرینی و غذایی])
        assign([ارسال برنامه به شاگرد])
        panel([پنل شاگردان و پایبندی])
        remind([یادآوری شاگرد بی‌فعال])
        forum([تالار گروهی])
        category([دسته‌بندی شاگردان])
        bulk([کپی و ارسال گروهی])
    end

    athlete --> signup
    athlete --> tick
    athlete --> sets
    athlete --> body
    athlete --> chat
    athlete --> progress
    athlete --> records

    coach --> signup
    coach --> build
    coach --> assign
    coach --> panel
    coach --> chat
    coach --> remind
    coach --> forum
    coach --> category
    coach --> bulk
```

## ۲) UML Activity — جریان «تیک زدن تمرین» با مسیرهای خطا

```mermaid
flowchart TD
    start([شروع]) --> login[ورزشکار وارد می‌شود]
    login --> select[روز و حرکت را انتخاب می‌کند]
    select --> tick[تیک حرکت]
    tick --> api[POST /api/workouts/log]
    api --> token{توکن معتبر است؟}
    token -- خیر --> e401[۴۰۱ → پاک‌سازی و برگشت به صفحه‌ی ورود]
    token -- بله --> role{نقش ورزشکار است؟}
    role -- خیر --> e403[۴۰۳ دسترسی غیرمجاز]
    role -- بله --> save[ذخیره در exercise_logs برای امروز]
    save --> xp{اولین تیک این حرکت در امروز؟}
    xp -- بله --> addxp[+۱۰ XP و ست‌کردن فلگ xp_awarded]
    xp -- خیر --> skip[بدون XP — جلوگیری از farm]
    addxp --> show[به‌روزرسانی حلقه‌ی درصد و ارسال به داشبورد مربی]
    skip --> show
    show --> end1([پایان])
    e401 --> end2([پایان])
    e403 --> end2
```

## ۳) System Architecture

```mermaid
flowchart LR
    subgraph Browser
        ui["فرانت: HTML/CSS/Vanilla JS
        (صفحات free و premium ورزشکار/مربی، api.js مشترک)"]
    end
    subgraph Server["Node.js + Express (پورت ۳۰۰۰)"]
        static["سرو فایل‌های استاتیک"]
        mw["auth middleware: تأیید JWT و نقش"]
        routes["۶ ماژول route:
        auth / profile / workouts / diet / chat / coach"]
        game["game.js: منطق XP"]
    end
    db[("SQLite — peak_forge.db
    ۱۶ جدول، PRAGMA foreign_keys=ON")]

    ui -- "fetch + Bearer token (JSON)" --> static
    static --> mw
    mw --> routes
    routes --> game
    routes -- "خواندن/نوشتن" --> db
    ui <-. "polling هر ۴–۵ ثانیه برای پیام‌های جدید" .-> routes
```

انتخاب‌ها و چرایی:

- **Vanilla JS بدون فریم‌ورک فرانت:** پروژه‌ی ترمی با حجم UI محدود؛ بدون بیلد
  و وابستگی، یادگیری و دفاع آسان‌تر. trade-off: رندر دستی DOM و بدون routing.
- **Express:** سبک و شفاف؛ لایه‌بندی «route → قاعده‌ی کسب‌وکار → دسترسی داده»
  قابل توضیح است. اعتبارسنجی ورودی داخل روت‌ها، احراز هویت در middleware.
- **SQLite (فایل):** رابطه‌ای است چون موجودیت‌ها به هم وابسته‌اند (کاربر → برنامه →
  حرکت → لاگ)؛ با UNIQUE constraint ها یکپارچگی تضمین می‌شود (مثلاً یک لاگ در روز).
  trade-off: برای دیپلوی به دیسک پایدار نیاز دارد و هم‌زمانی نویسنده محدود است —
  برای مقیاس MVP کافی است.
- **JWT:** stateless و ساده؛ trade-off: ابطال فوری توکن ممکن نیست (انقضای ۷ روز).

## ۴) ERD — مدل داده

```mermaid
erDiagram
    USERS ||--o| ATHLETE_PROFILES : "قد/وزن"
    USERS ||--o| COACH_PROFILES : "سابقه/مدرک"
    USERS ||--o| COACH_SETTINGS : "تنظیمات اعلان"
    USERS ||--o| ATHLETE_GAME : "XP"
    USERS ||--o{ COACH_ATHLETES : "coach_id / athlete_id"
    USERS ||--o{ PROGRAMS : "می‌سازد"
    USERS ||--o{ WEIGHT_LOGS : "ثبت می‌کند"
    USERS ||--o{ PERSONAL_RECORDS : "ثبت می‌کند"
    USERS ||--o{ MESSAGES : "sender/receiver"
    USERS ||--o{ FORUMS : "مالک تالار"
    USERS ||--o{ COACH_SCHEDULE : "تقویم"
    USERS ||--o{ COACH_HONORS : "افتخارات"
    PROGRAMS ||--|{ EXERCISES : "شامل"
    PROGRAMS ||--o{ PROGRAM_ASSIGNMENTS : "انتساب"
    EXERCISES ||--o{ EXERCISE_LOGS : "تیک روزانه"
    EXERCISES ||--o{ EXERCISE_SETS : "جزئیات ست"
    DIET_PLANS ||--|{ MEALS : "شامل"
    DIET_PLANS ||--o{ DIET_ASSIGNMENTS : "انتساب"
    MEALS ||--o{ MEAL_LOGS : "تیک روزانه"
    FORUMS ||--o{ MESSAGES : "پیام تالار"

    USERS {
        int id PK
        string email UK
        string password_hash
        string role "athlete|coach"
        string tier "free|premium"
    }
    COACH_ATHLETES {
        int id PK
        int coach_id FK
        int athlete_id FK
        string category
    }
    PROGRAMS {
        int id PK
        int coach_id FK
        string name
        int weeks
    }
    EXERCISES {
        int id PK
        int program_id FK
        string name
        string sets
        int day_index
    }
    EXERCISE_LOGS {
        int athlete_id FK
        int exercise_id FK
        string log_date
        int done
        int xp_awarded
    }
    EXERCISE_SETS {
        int athlete_id FK
        int exercise_id FK
        string log_date
        int set_index
        real weight
        int reps
    }
    MESSAGES {
        int id PK
        int sender_id FK
        int receiver_id FK
        int forum_id FK
        int is_priority
        int is_read
        int answered
    }
    WEIGHT_LOGS {
        int athlete_id FK
        string log_date
        real weight
        real body_fat
    }
    ATHLETE_GAME {
        int user_id PK
        int xp
    }
```

محدودیت‌های کلیدی داده:

- `exercise_logs`: UNIQUE(athlete_id, exercise_id, log_date) — هر حرکت در روز
  فقط یک لاگ؛ مالکیت لاگ همیشه از توکن می‌آید نه ورودی کاربر.
- `exercise_sets`: UNIQUE(athlete_id, exercise_id, log_date, set_index).
- `coach_athletes`: UNIQUE(coach_id, athlete_id) — لینک تکراری ممکن نیست.
- `messages`: CHECK که یا گیرنده داشته باشد یا تالار.

## ۵) توجیه هاست و هزینه

- الزام: SQLite فایل است، پس هاست باید **دیسک پایدار** داشته باشد وگرنه داده
  با هر دیپلوی/ری‌استارت پاک می‌شود.
- **انتخاب پیشنهادی: Railway** با volume — حدود ۵ دلار در ماه، HTTPS و
  زیردامنه‌ی آماده می‌دهد، `npm start` بدون تغییر کد اجرا می‌شود و دیسک
  ماندگار است. محدودیت: سهمیه‌ی اجرا/حافظه‌ی پلن و هزینه‌ی اندک.
- گزینه‌ی رد‌شده: پلن رایگان Render — دیسک غیرماندگار است و داده بعد از
  ری‌استارت پاک می‌شود (نقض «ماندگاری داده» در سند).
- گزینه‌ی صفر-هزینه برای دمو: تونل HTTPS موقت (cloudflared) روی سیستم خود
  دانشجو — مناسب دموی زنده، نه انتشار دائمی.
- پیکربندی runtime: `PORT` و `JWT_SECRET` از متغیر محیطی خوانده می‌شوند
  (در کد `process.env` پشتیبانی شده)، دیتابیس در volume نصب می‌شود.
