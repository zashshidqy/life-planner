# LIFE PLANNER

## Design & UX Product Requirements Document

**Design Direction:** Premium Neo-Brutalism
**Platform:** Responsive Web + PWA
**Design System Foundation:** shadcn/ui + Neo-Brutalist principles
**Primary Goal:** Motivating, playful, memorable, premium

---

# 1. DESIGN VISION

Life Planner harus terasa seperti gabungan:

```text
Neo-Brutalism
+
Modern Productivity App
+
Game Progression
+
Premium Editorial Design
```

Visual harus:

* bold
* expressive
* playful
* structured
* memorable
* highly usable

Tetapi tidak:

* childish
* noisy
* chaotic
* cheap
* generic
* AI-generated looking

---

# 2. DESIGN PRINCIPLE

## 2.1 Progress Should Be Visible

User harus selalu dapat melihat:

```text
Level
XP
Streak
Daily Progress
Goals
Achievements
```

dengan jelas.

---

# 3. CORE VISUAL PERSONALITY

Gunakan:

```text
Bold typography
Strong borders
Hard / offset shadows
Flat surfaces
Playful shapes
High contrast
Large numbers
Expressive icons
Asymmetric layouts
```

Namun tetap gunakan whitespace yang cukup.

---

# 4. AVOID

Dilarang menggunakan:

```text
Glassmorphism
Excessive gradients
Neon overload
Floating glass cards
Excessive blur
Generic AI dashboard
Excessive rounded cards
Dark cyberpunk UI
Random decorative elements
```

Neo-Brutalism tidak berarti semua elemen harus terlihat kasar.

Target:

> Refined Brutalism.

---

# 5. COLOR SYSTEM

Primary palette dapat menggunakan:

```text
Background
Warm Off-White

Foreground
Near Black

Primary
Strong Accent

Secondary
Soft Yellow

Success
Green

Warning
Orange

Danger
Red

Information
Blue
```

Warna harus digunakan secara intentional.

Contoh:

```text
Black
#111111

Off White
#F7F5EF
```

Accent dapat dikembangkan melalui design system.

Jangan menggunakan terlalu banyak warna dalam satu viewport.

---

# 6. TYPOGRAPHY

Typography harus menjadi bagian besar dari visual identity.

Gunakan font modern sans-serif.

Hierarchy:

```text
Display
H1
H2
H3
Body
Caption
Label
Numeric
```

Level dan XP menggunakan typography besar.

Contoh:

```text
LEVEL 42
```

harus terasa seperti achievement, bukan label kecil.

---

# 7. BORDER

Neo-Brutalist components menggunakan strong borders.

Default:

```text
1px
2px
3px
```

Gunakan 2px sebagai default untuk important UI.

---

# 8. SHADOW

Gunakan offset shadow.

Contoh:

```text
box-shadow:
4px 4px 0px #111;
```

Untuk major components:

```text
6px 6px
8px 8px
```

Jangan menggunakan blur-heavy shadow.

---

# 9. BORDER RADIUS

Gunakan radius secara selective.

Tidak semua component harus rounded.

Hierarchy:

```text
Buttons       small radius
Cards         medium radius
Major panels  low radius
Game badges   custom shapes
```

Beberapa element dapat menggunakan sharp corners.

---

# 10. DASHBOARD

Dashboard adalah halaman paling penting.

Hero section:

```text
Good morning.

Ready to make today count?

LEVEL 42
██████████░░ 82%
```

Di sebelahnya:

```text
🔥 187 DAY STREAK
```

Kemudian:

```text
TODAY'S QUESTS
```

---

# 11. DASHBOARD HIERARCHY

Priority:

```text
1. Greeting
2. Level / XP
3. Streak
4. Today's progress
5. Daily quests
6. Goals
7. Life attributes
8. Insights
```

Jangan menampilkan seluruh data sekaligus.

---

# 12. HERO PROGRESSION

Hero progression adalah focal point.

Contoh:

```text
┌─────────────────────────────────────┐
│                                     │
│  LEVEL 42                            │
│                                     │
│  ████████████████░░░                │
│                                     │
│  18,420 / 20,000 XP                 │
│                                     │
│  DISCIPLINED                        │
│                                     │
└─────────────────────────────────────┘
```

Character dapat berada di dalam atau dekat progression area.

---

# 13. CHARACTER

Character adalah bagian dari identity.

Character selection screen:

```text
CHOOSE YOUR CHARACTER

     ○       ○       ○

   Character previews

     ○       ○       ○

Choose the one that
represents you.
```

Character preview harus besar.

Jangan menggunakan character sebagai dekorasi kecil.

---

# 14. CHARACTER SELECTION UX

Flow:

```text
Select Character
 ↓
Preview
 ↓
Name / Username
 ↓
Confirm
```

User harus dapat melihat character dalam beberapa context:

```text
Profile
Dashboard
Achievement
Share Card
```

---

# 15. CHARACTER VISUAL STYLE

Character harus:

* simple
* recognizable
* scalable
* expressive
* brandable

Hindari karakter terlalu detail.

Karakter harus tetap terlihat bagus pada:

```text
32px
64px
128px
512px
```

---

# 16. DAILY QUEST UI

Quest card:

```text
┌──────────────────────────────┐
│ ✓  MORNING ROUTINE      +30  │
│                              │
│ Completed                    │
└──────────────────────────────┘
```

Incomplete:

```text
┌──────────────────────────────┐
│ □  BUILD HOMEPAGE       +50  │
│                              │
│ High Priority                │
└──────────────────────────────┘
```

Completion harus memiliki motion kecil.

---

# 17. XP ANIMATION

Ketika mendapatkan XP:

```text
Task completed

+25 XP
```

XP number melakukan subtle movement.

Progress bar bergerak secara smooth.

Jangan menggunakan animation berlebihan.

---

# 18. LEVEL UP EXPERIENCE

Ketika level naik:

```text
────────────────────────

       LEVEL UP

           43

      NEW CHAPTER

────────────────────────
```

Character dapat melakukan animation kecil.

Kemudian:

```text
New achievement unlocked
```

---

# 19. STREAK UI

Streak harus menjadi visual yang sangat recognizable.

```text
🔥
187

DAY STREAK
```

Gunakan typography besar.

Streak milestone:

```text
🔥 100 DAYS
DISCIPLINED
```

---

# 20. STREAK MILESTONE SCREEN

Ketika milestone tercapai:

```text
┌─────────────────────────────┐
│                             │
│             🔥              │
│                             │
│          100 DAYS            │
│                             │
│        DISCIPLINED          │
│                             │
│  You showed up for yourself │
│  for 100 days.              │
│                             │
│       [ SHARE ]             │
│                             │
└─────────────────────────────┘
```

CTA utama:

```text
Share Achievement
```

---

# 21. ACHIEVEMENT UI

Achievement collection:

```text
ACHIEVEMENTS

┌─────┐ ┌─────┐ ┌─────┐
│ 🔥  │ │ ⚡  │ │ 🎯  │
│100D │ │100H │ │50G  │
└─────┘ └─────┘ └─────┘
```

Unlocked achievement terlihat bold.

Locked achievement terlihat subdued.

---

# 22. LIFE ATTRIBUTES

Display:

```text
HEALTH
████████░░
82

DISCIPLINE
███████░░░
73

LEARNING
██████░░░░
64
```

Jangan menggunakan radar chart sebagai default.

Progress bars lebih mudah dipahami.

---

# 23. GOALS UI

Goal card:

```text
BUILD MY PORTFOLIO

████████████░░ 82%

8 / 10 milestones

Next:
Deploy production version
```

Goal harus selalu menunjukkan:

```text
Where am I?
What's next?
```

---

# 24. HABIT UI

Habit harus dapat diselesaikan dengan satu interaction.

Contoh:

```text
READING

M T W T F S S
✓ ✓ ✓ ✓ ✓ □ □
```

Progress:

```text
🔥 12 days
```

---

# 25. CALENDAR

Calendar tidak boleh terlihat seperti enterprise calendar.

Gunakan:

* clean typography
* bold selected date
* subtle borders
* task indicators
* clear time blocks

Important events menggunakan accent color.

---

# 26. TASK UI

Task completion harus terasa satisfying.

Interaction:

```text
□ → ✓
```

Kemudian:

```text
+10 XP
```

Animasi cepat dan subtle.

---

# 27. JOURNAL UI

Journal lebih editorial.

Contoh:

```text
MONDAY
October 5

How was today?

😄 🙂 😐 🙁 😞

────────────────

What went well?

[ Write something... ]
```

Jangan membuat journal seperti form enterprise.

---

# 28. FOCUS MODE

Focus mode harus sangat minimal.

```text
BUILD PORTFOLIO

42:18

██████████████░░

[ Pause ]     [ Finish ]
```

Character dapat berubah menjadi focus state.

---

# 29. PROFILE

Profile menjadi "Life Identity Card".

```text
┌────────────────────────────────────┐
│                                    │
│          [ CHARACTER ]             │
│                                    │
│            ZHUNDY                 │
│                                    │
│            LEVEL 42               │
│          DISCIPLINED              │
│                                    │
│        🔥 187 DAY STREAK          │
│                                    │
│        18,420 LIFE XP             │
│                                    │
└────────────────────────────────────┘
```

---

# 30. SOCIAL SHARE CARD

Share card harus menjadi salah satu komponen design paling polished.

Ukuran:

```text
Instagram Story
1080 × 1920

Square
1080 × 1080

Social preview
1200 × 630
```

Design harus tetap recognizable tanpa UI chrome.

---

# 31. SHARE CARD DESIGN

Contoh:

```text
┌───────────────────────────┐
│                           │
│        LIFE LEVEL         │
│                           │
│            42             │
│                           │
│       DISCIPLINED         │
│                           │
│       🔥 187 DAYS         │
│                           │
│      18,420 LIFE XP       │
│                           │
│                           │
│       [ CHARACTER ]       │
│                           │
│                           │
│       LIFE PLANNER        │
└───────────────────────────┘
```

Branding harus subtle.

---

# 32. MOTION DESIGN

Animation philosophy:

> Fast, physical, intentional.

Gunakan:

```text
150–200ms
micro interaction

250–350ms
normal transition

400–600ms
major achievement
```

Gunakan:

* spring
* scale
* translate
* progress interpolation

Hindari:

* excessive particles
* infinite animations
* unnecessary bouncing
* long transitions

---

# 33. GAMIFICATION MOTION

High importance:

```text
Task completion
XP gain
Level up
Achievement unlock
Streak milestone
Goal completion
```

Low importance:

```text
Navigation
Dropdown
Tooltip
```

Major events mendapat animation lebih expressive.

---

# 34. RESPONSIVE DESIGN

Desktop:

```text
Sidebar
Main content
Secondary information
```

Tablet:

```text
Compact sidebar
Adaptive grid
```

Mobile:

```text
Top header
Main content
Bottom navigation
```

Mobile harus menjadi first-class experience.

---

# 35. MOBILE NAVIGATION

Default:

```text
Home
Tasks
Calendar
Progress
More
```

Quick add:

```text
      +
```

Quick add dapat membuat:

```text
Task
Habit
Event
Journal
Note
```

---

# 36. PWA EXPERIENCE

Mobile PWA harus terasa seperti native application.

Support:

```text
Install prompt
Splash screen
Offline state
Push notification
App icon
Standalone mode
```

---

# 37. EMPTY STATES

Empty state harus memiliki personality.

Contoh Tasks:

```text
Nothing planned yet.

Let's make today count.

[ Create Task ]
```

Bukan:

```text
No data found.
```

---

# 38. ERROR STATES

Error harus tetap friendly.

Contoh:

```text
Something went wrong.

Your progress is safe.
Please try again.

[ Retry ]
```

---

# 39. LOADING STATES

Gunakan skeleton yang sesuai dengan layout.

Hindari full-screen spinner kecuali benar-benar diperlukan.

---

# 40. SUCCESS STATES

Success state harus memberikan feedback.

Contoh:

```text
Task completed

+10 XP
```

atau:

```text
Goal completed

Achievement unlocked
```

---

# 41. ACCESSIBILITY

Minimum:

```text
WCAG-aware contrast
Keyboard navigation
Focus states
Screen reader labels
Reduced motion
Readable typography
Touch targets
```

Gamification tidak boleh mengorbankan accessibility.

---

# 42. DESIGN SYSTEM COMPONENTS

Core components:

```text
Button
Input
Textarea
Select
Dropdown
Dialog
Drawer
Tooltip
Toast
Tabs
Progress
Badge
Avatar
Card
Calendar
Date Picker
Command
Navigation
Modal
Sheet
```

Custom components:

```text
LifeLevel
XPBar
StreakCard
QuestCard
AchievementBadge
CharacterCard
LifeAttribute
GoalProgress
LifeJourney
AchievementUnlock
LevelUpModal
ShareCard
```

---

# 43. DESIGN TOKENS

Semua design harus menggunakan centralized tokens:

```text
colors
spacing
typography
radius
border
shadow
motion
breakpoints
```

Jangan hardcode style secara random.

---

# 44. COMPONENT CONSISTENCY

Satu component harus memiliki:

```text
Default
Hover
Active
Focus
Disabled
Loading
Success
Error
```

State harus didefinisikan sebelum implementation.

---

# 45. DESIGN RULE

Setiap screen harus menjawab:

```text
Where am I?
What matters now?
What can I do?
What progress have I made?
What's next?
```

---

# 46. DASHBOARD FINAL INFORMATION ARCHITECTURE

```text
Dashboard
│
├── Greeting
│
├── Character + Level
│
├── XP Progress
│
├── Primary Streak
│
├── Today's Progress
│
├── Daily Quests
│
├── Today's Schedule
│
├── Goals
│
├── Life Attributes
│
├── Personal Records
│
└── Daily Insight
```

---

# 47. VISUAL HIERARCHY

Prioritas visual:

```text
LEVEL
↓
STREAK
↓
TODAY'S PROGRESS
↓
QUESTS
↓
GOALS
↓
ATTRIBUTES
↓
ANALYTICS
```

User tidak boleh melihat analytics lebih dominan daripada aktivitas hari ini.

---

# 48. GAMIFICATION DESIGN RULE

Gamification harus:

```text
Reward meaningful behavior
Create momentum
Show progress
Celebrate milestones
Encourage returning
```

Tidak boleh:

```text
Create anxiety
Punish missed days excessively
Encourage meaningless clicking
Create unhealthy competition
Overwhelm the user
```

---

# 49. BRAND EXPERIENCE

Ketika user membuka aplikasi:

> "I know what I need to do."

Ketika menyelesaikan task:

> "I made progress."

Ketika naik level:

> "I'm becoming better."

Ketika mencapai streak:

> "I'm proud of my consistency."

Ketika share:

> "This represents me."

---

# 50. FINAL DESIGN PRINCIPLE

Life Planner harus terlihat seperti:

> **A serious productivity product wearing the personality of a game.**

Bukan:

> A children's game disguised as a productivity app.

Visual target:

```text
Premium
+
Bold
+
Playful
+
Motivational
+
Functional
+
Human
```

End of Design PRD.
