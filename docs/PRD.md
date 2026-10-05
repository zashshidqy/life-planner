# LIFE PLANNER

## System Product Requirements Document

**Document Version:** 1.0
**Product Type:** Commercial Progressive Web Application
**Architecture:** Multi-user SaaS
**Primary Platform:** Web + PWA
**Status:** Product Definition

---

# 1. PRODUCT VISION

Life Planner adalah aplikasi Personal Life Operating System yang membantu pengguna merencanakan, menjalankan, dan mengevaluasi kehidupan sehari-hari.

Produk tidak hanya berfungsi sebagai task manager, calendar, habit tracker, atau journal.

Semua aktivitas pengguna terhubung dengan sebuah sistem progression:

**Plan → Execute → Progress → Level Up → Reflect → Improve**

Pengguna memiliki:

* Character
* Life Level
* Life XP
* Streak
* Attributes
* Quests
* Achievements
* Goals
* Habits
* Projects
* Personal Records

Aktivitas nyata pengguna menghasilkan progress dalam sistem.

Contoh:

```text
Complete Task
      ↓
Earn XP
      ↓
Increase Progress
      ↓
Level Up
      ↓
Unlock Achievement
      ↓
Share Achievement
```

---

# 2. PRODUCT POSITIONING

Produk harus diposisikan sebagai:

> A personal operating system for everyday life.

Bukan:

> A gamified to-do list.

Gamification adalah sistem motivasi di dalam produk, bukan tujuan utama produk.

---

# 3. PRODUCT PRINCIPLES

Sistem harus mengikuti prinsip:

### 3.1 Real Life First

Reward diberikan berdasarkan aktivitas nyata dan meaningful.

### 3.2 Progress Over Perfection

Produk tidak boleh membuat pengguna merasa gagal ketika satu hari tidak produktif.

### 3.3 Self Competition

Pengguna dibandingkan dengan dirinya sendiri, bukan dipaksa bersaing dengan pengguna lain.

### 3.4 Simple Daily Experience

Pengguna harus dapat memahami apa yang harus dilakukan hari ini dalam beberapa detik.

### 3.5 Long-Term Motivation

Sistem dirancang agar tetap menarik setelah digunakan selama berbulan-bulan.

---

# 4. TARGET USERS

Target awal:

* Students
* Young professionals
* Freelancers
* Entrepreneurs
* Creators
* People interested in productivity
* People who want structured daily routines

---

# 5. CORE PRODUCT MODULES

```text
Authentication
Onboarding
Character System
Dashboard
Tasks
Projects
Calendar
Goals
Habits
Routines
Journal
Focus
Life Progression
Achievements
Statistics
Notifications
Social Sharing
Settings
Subscription
Admin
```

---

# 6. AUTHENTICATION

Support:

* Register
* Login
* Logout
* Email verification
* Password reset
* Session management
* Account deletion

Future:

* Google authentication
* Apple authentication

Authentication harus aman dan production-ready.

---

# 7. ONBOARDING

Setelah membuat akun, pengguna tidak langsung dilempar ke dashboard.

Onboarding terdiri dari:

```text
Account
 ↓
Profile
 ↓
Character Selection
 ↓
Life Focus
 ↓
Goals
 ↓
Habits
 ↓
First Plan
 ↓
Dashboard
```

Onboarding harus dapat dilewati sebagian tanpa menghilangkan kemampuan menggunakan aplikasi.

---

# 8. CHARACTER SYSTEM

Saat pertama kali membuat akun, user memilih karakter.

Character bukan sekadar avatar.

Character menjadi representasi identitas user di dalam Life Planner.

Contoh:

```text
Character A
Character B
Character C
Character D
Character E
Character F
```

Setiap karakter memiliki:

* unique visual identity
* name
* personality style
* default appearance
* unlockable cosmetics

Karakter tidak memberikan keuntungan statistik.

Tidak boleh ada:

```text
Character A = +20% XP
Character B = +10% streak
```

Semua karakter harus memiliki kemampuan yang sama.

Tujuan character adalah:

> Identity + personalization.

---

# 9. CHARACTER CUSTOMIZATION

Future version dapat mendukung:

```text
Base Character
Hair
Face
Outfit
Accessories
Background
Badge
Frame
```

Cosmetic item dapat dibuka melalui:

* Level
* Achievement
* Milestone
* Subscription

Cosmetic tidak memberikan gameplay advantage.

---

# 10. LIFE LEVEL SYSTEM

Setiap user mempunyai:

```text
Level
XP
Current XP
XP required
Lifetime XP
```

Contoh:

```text
LEVEL 24

2,840 / 3,500 XP
```

Level menjadi identitas utama user.

---

# 11. XP SYSTEM

Aktivitas meaningful memberikan XP.

Contoh default:

```text
Task completed          +10 XP
Important task          +25 XP
Habit completed         +10 XP
Routine completed       +20 XP
Focus session           +15 XP
Journal entry           +10 XP
Goal milestone          +100 XP
Weekly review           +50 XP
```

Nilai XP harus configurable dari server.

Jangan hardcode seluruh XP logic di frontend.

---

# 12. XP ABUSE PREVENTION

Sistem harus mencegah pengguna farming XP.

Contoh:

User tidak boleh mendapatkan XP besar hanya dengan membuat:

```text
100 fake tasks
```

Sistem dapat menggunakan:

* daily XP limits
* activity weighting
* task importance
* diminishing returns
* duplicate detection
* server-side validation

XP harus dihitung di server.

Frontend hanya menampilkan hasil.

---

# 13. LEVEL CURVE

Level menggunakan progressive XP requirement.

Contoh:

```text
Level 1 → 100 XP
Level 2 → 250 XP
Level 3 → 450 XP
Level 4 → 700 XP
...
```

Formula final harus dibuat configurable.

Jangan menyimpan formula level hanya di frontend.

---

# 14. DAILY QUEST SYSTEM

Setiap hari pengguna memiliki Daily Quests.

Contoh:

```text
TODAY'S QUESTS

Complete morning routine    +30 XP
Finish important task       +50 XP
Exercise                    +40 XP
Read                        +20 XP
```

Quest dapat berasal dari:

* Tasks
* Habits
* Goals
* Routines
* Focus
* Custom daily objectives

---

# 15. DAILY PROGRESS

Sistem menghitung progress harian.

Contoh:

```text
Today's Progress

78%

4 / 6 planned activities
```

Progress dihitung berdasarkan aktivitas yang telah direncanakan.

---

# 16. STREAK SYSTEM

Primary streak menjadi salah satu identitas utama user.

Contoh:

```text
🔥 187 DAY STREAK
```

Streak dihitung berdasarkan meaningful activity.

Bukan sekadar membuka aplikasi.

User harus melakukan aktivitas tertentu agar streak aktif.

---

# 17. STREAK MILESTONES

Milestone:

```text
7 days
30 days
60 days
100 days
365 days
```

Setiap milestone menghasilkan achievement.

Contoh:

```text
7 Days
FIRST SPARK

30 Days
CONSISTENT

100 Days
DISCIPLINED

365 Days
LEGENDARY
```

---

# 18. STREAK RECOVERY

Sistem harus menghindari punishment berlebihan.

Support:

* Grace Day
* Recovery mechanism
* Streak protection

Tujuan:

> Encourage returning, not punish absence.

---

# 19. LIFE ATTRIBUTES

User mempunyai beberapa attribute.

Default:

```text
Health
Productivity
Learning
Discipline
Wellbeing
Finance
```

Attribute dihitung dari aktivitas terkait.

Contoh:

```text
Exercise
Sleep habit
Health goals
```

dapat memengaruhi:

```text
Health
```

Task completion dan routines dapat memengaruhi:

```text
Discipline
Productivity
```

Attribute harus bersifat informational/motivational.

Jangan mengklaim sebagai pengukuran medis atau psikologis.

---

# 20. GOALS

Goal memiliki:

```text
title
description
category
deadline
progress
milestones
status
```

Goal dapat memiliki:

```text
Projects
Tasks
Habits
Milestones
```

Contoh:

```text
Goal
Become better at programming

Projects
Build Portfolio
Learn Next.js

Habits
Code 60 minutes/day

Milestones
Complete Next.js course
Build first project
Deploy project
```

---

# 21. PROJECTS

Project berada di bawah Goal atau dapat berdiri sendiri.

Structure:

```text
Project
 ├── Tasks
 ├── Milestones
 ├── Deadline
 └── Progress
```

---

# 22. TASK SYSTEM

Task memiliki:

```text
id
user_id
project_id
title
description
status
priority
due_date
scheduled_start
scheduled_end
estimated_duration
completed_at
created_at
updated_at
```

Status:

```text
Todo
In Progress
Completed
Cancelled
```

Task dapat mempunyai subtasks.

---

# 23. CALENDAR

Calendar mendukung:

```text
Day
Week
Month
Agenda
```

Event:

```text
title
start
end
location
description
reminder
```

Task dapat memiliki scheduled time.

---

# 24. HABIT SYSTEM

Habit:

```text
title
frequency
target
measurement
schedule
status
```

Measurement dapat berupa:

```text
Boolean
Count
Duration
Quantity
```

Contoh:

```text
Read
20 pages

Exercise
30 minutes

Water
2 liters
```

---

# 25. ROUTINE SYSTEM

Routine adalah kumpulan aktivitas.

Contoh:

```text
Morning Routine

Wake up
Drink water
Exercise
Shower
Plan day
```

Routine memiliki:

```text
items
order
duration
schedule
```

---

# 26. JOURNAL

Journal entry:

```text
date
mood
content
tags
created_at
updated_at
```

Mood hanya digunakan untuk personal reflection dan tidak boleh diposisikan sebagai diagnosis kesehatan mental.

---

# 27. FOCUS SYSTEM

Focus session:

```text
duration
task
project
started_at
ended_at
```

Support:

* Pomodoro
* Custom duration
* Focus history

Focus session dapat memberikan XP.

---

# 28. ACHIEVEMENT SYSTEM

Achievement adalah milestone permanen.

Contoh:

```text
First Step
10 Tasks
7 Day Streak
30 Day Streak
100 Day Streak
100 Hours Focus
50 Goals Completed
Level 25
Level 50
```

Achievement memiliki:

```text
id
name
description
icon
rarity
condition
unlocked_at
```

---

# 29. PERSONAL RECORDS

Sistem mencatat:

```text
Longest Streak
Highest Weekly XP
Highest Monthly XP
Longest Focus Session
Total Focus Hours
Goals Completed
Tasks Completed
Habits Completed
```

Personal records dibandingkan dengan history user sendiri.

---

# 30. SOCIAL SHARING

Achievement dapat di-share.

Jenis share:

```text
Level Up
Streak Milestone
Achievement
Goal Completed
Personal Record
Season Completed
```

Generate share card.

Contoh:

```text
LEVEL 42

DISCIPLINED

🔥 187 DAY STREAK

18,420 LIFE XP

[Brand]
```

User dapat:

* Download image
* Share
* Copy share link

---

# 31. PUBLIC PROFILE

Optional public profile:

```text
/@username
```

Menampilkan data yang user pilih untuk publik.

Contoh:

```text
Level 42
187 Day Streak
27 Achievements
312 Focus Hours
```

User dapat mengatur privacy.

Default profile harus private.

---

# 32. PRIVACY

User dapat mengontrol:

```text
Public profile
Show level
Show streak
Show achievements
Show statistics
Show character
```

Tidak ada data pribadi yang dipublikasikan tanpa persetujuan user.

---

# 33. NOTIFICATION SYSTEM

Support:

```text
Task reminder
Habit reminder
Calendar reminder
Streak reminder
Goal milestone
Daily summary
Weekly review
```

Channel:

```text
In-app
Push
Email
```

User dapat mengatur notification preferences.

---

# 34. SEARCH

Global search harus mencari:

```text
Tasks
Projects
Goals
Habits
Journal
Notes
Calendar
Achievements
```

---

# 35. COMMAND CENTER

Shortcut:

```text
Ctrl/Cmd + K
```

Commands:

```text
Create task
Create goal
Create habit
Create note
Create event
Start focus
Open journal
Search
```

---

# 36. OFFLINE PWA

Aplikasi harus tetap usable saat offline.

Offline support minimal:

```text
View dashboard
View tasks
Create task
Complete task
View habits
Complete habit
View calendar
Create journal
```

Data lokal disimpan sementara dan disinkronkan ketika koneksi kembali.

Gunakan IndexedDB untuk local persistence.

---

# 37. SYNC SYSTEM

```text
Client
 ↓
Local Store
 ↓
Offline Changes
 ↓
Sync Queue
 ↓
Server
 ↓
Database
```

Conflict resolution harus dirancang sebelum implementasi offline penuh.

---

# 38. DATABASE

Primary database:

**PostgreSQL**

ORM:

**Drizzle ORM**

Core tables:

```text
users
profiles
characters
user_characters
user_settings

tasks
subtasks
projects
goals
goal_milestones

habits
habit_logs

routines
routine_items

calendar_events

journal_entries
notes

focus_sessions

xp_transactions
user_progression

achievements
user_achievements

streaks
streak_events

personal_records

notifications
notification_preferences

share_cards
public_profiles

subscriptions
payments

audit_logs
```

---

# 39. XP TRANSACTION LEDGER

XP jangan hanya disimpan sebagai:

```text
users.xp
```

Gunakan ledger.

```text
xp_transactions

id
user_id
source_type
source_id
amount
reason
created_at
```

Contoh:

```text
+50
Task completed
task_123
```

Kemudian total XP dapat dihitung dan/atau dicache.

Ini penting untuk audit dan anti-abuse.

---

# 40. AUTHORIZATION

Semua user-owned records harus memiliki ownership.

Contoh:

```text
tasks.user_id
goals.user_id
habits.user_id
journal_entries.user_id
```

Server wajib memvalidasi ownership.

Jangan mempercayai user_id dari client.

---

# 41. SECURITY

Minimum:

```text
HTTPS
Secure cookies
Password hashing
CSRF protection
Rate limiting
Input validation
Authorization
XSS prevention
SQL injection prevention
Session security
Audit logging
Backup
```

Semua business-critical logic harus server-side.

---

# 42. TECH STACK

Recommended:

```text
Next.js
TypeScript
React
Tailwind CSS v4
shadcn/ui
NeoBrutalism components
Drizzle ORM
PostgreSQL
PWA Service Worker
IndexedDB
```

Infrastructure dapat menggunakan managed services.

---

# 43. ARCHITECTURE

Recommended structure:

src/

```text
app/
components/
features/
  auth/
  dashboard/
  tasks/
  projects/
  goals/
  habits/
  routines/
  calendar/
  journal/
  focus/
  progression/
  achievements/
  sharing/
  profile/

server/
  auth/
  database/
  services/
  repositories/
  jobs/

lib/
types/
config/
```

Domain logic harus dipisahkan dari UI.

---

# 44. ADMIN SYSTEM

Admin dashboard minimal:

```text
Users
Subscriptions
Revenue
Active Users
Retention
XP abuse monitoring
Reports
System configuration
Feature flags
```

Admin tidak boleh memiliki akses langsung terhadap private journal content kecuali terdapat proses/legal policy yang jelas.

---

# 45. MONETIZATION

Potential plans:

```text
FREE
PRO
```

Free:

```text
Tasks
Calendar
Basic Goals
Basic Habits
Basic Progression
Basic Achievements
```

Pro:

```text
Advanced analytics
Advanced customization
Advanced statistics
Advanced routines
AI features
Premium cosmetics
Advanced sharing
```

Pricing dan feature limits harus configurable.

---

# 46. MVP

MVP wajib:

```text
Authentication
Onboarding
Character Selection
Dashboard
Tasks
Goals
Habits
Calendar
XP
Level
Primary Streak
Achievements
Basic Profile
PWA
```

Jangan membangun seluruh feature set sekaligus.

---

# 47. V1

Setelah MVP:

```text
Projects
Routines
Focus
Journal
Personal Records
Social Share Cards
Public Profile
Notifications
Offline Sync
```

---

# 48. V2

```text
AI Planner
AI Goal Breakdown
AI Weekly Review
AI Insights
Advanced Analytics
Subscription
Premium Cosmetics
Advanced Character Customization
```

---

# 49. SUCCESS METRICS

Primary:

```text
DAU
WAU
MAU
D1 retention
D7 retention
D30 retention
```

Product metrics:

```text
Tasks completed
Habits completed
Daily active streak
Average session
XP earned
Level progression
Achievement unlock rate
Share rate
```

Important:

> Measure whether gamification increases meaningful activity, not merely app opens.

---

# 50. NON-GOALS

MVP tidak mencoba menjadi:

```text
Full accounting software
Medical tracker
Social network
Competitive gaming platform
Project management enterprise suite
```

Produk tetap fokus pada:

> Personal Life Management + Meaningful Progression.

---

# 51. FINAL PRODUCT LOOP

```text
PLAN
 ↓
DO
 ↓
EARN XP
 ↓
LEVEL UP
 ↓
BUILD STREAK
 ↓
UNLOCK ACHIEVEMENT
 ↓
REFLECT
 ↓
SHARE PROGRESS
 ↓
RETURN
 ↓
PLAN AGAIN
```

End of System PRD.
