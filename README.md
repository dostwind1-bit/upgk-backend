# UPGK.online — Backend (Node.js + Express + MongoDB)

Community education platform: blog/image/video posts, Q&A, comments, DM + group chat, aur AI-powered content moderation.

## 1. Setup Steps

```bash
npm install
cp .env.example .env
```

`.env` file me ye values bharo:

| Variable | Kaha se milega |
|---|---|
| `MONGO_URI` | MongoDB Atlas → Connect → Drivers |
| `JWT_SECRET` | Koi bhi random 40+ character string |
| `CLOUDINARY_*` | cloudinary.com → Dashboard |
| `PERSPECTIVE_API_KEY` | https://www.perspectiveapi.com/ (FREE - Google Cloud project banake "Perspective Comment Analyzer API" enable karo, API key generate karo) |
| `SIGHTENGINE_API_USER` / `SECRET` | https://sightengine.com/ → Free signup → Dashboard (500 free checks/month) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Apna admin login jo chaho |

## 2. Admin account banane ke liye (ek baar)

```bash
node seedAdmin.js
```

Ye `.env` me diye ADMIN_EMAIL/PASSWORD se admin account bana dega.

## 3. Run karo

```bash
npm start
```
Local testing ke liye: `npm run dev` (nodemon)

## 4. Deploy — Railway (free tier)

1. GitHub pe is folder ko push karo
2. Railway.app → New Project → Deploy from GitHub
3. Environment Variables tab me `.env` ki saari values daal do
4. Deploy hote hi Railway ek URL dega (e.g. `upgk-backend.up.railway.app`) — yahi URL frontend me use hoga

## 5. AI Moderation kaise kaam karta hai

- **Text** (posts, comments, chat messages): Google Perspective API real-time check karta hai — toxic/hate/threat content 75%+ confidence pe reject ho jata hai
- **Plagiarism**: Naya blog/question post existing approved posts se compare hota hai (TF-IDF similarity) — 85%+ match = copied maan ke reject
- **Images**: Sightengine check karta hai nudity/gore/weapons ke liye
- **Video**: YouTube link wale videos check nahi hote (YouTube khud handle karta hai); direct upload wale video ka thumbnail frame check hota hai

Agar AI API fail ho jaye (limit khatam, network issue), content **automatically admin ki manual review queue** me chala jata hai — kabhi bhi silently pass nahi hota.

## 6. Important API Endpoints

| Method | Route | Kaam |
|---|---|---|
| POST | `/api/auth/register` | Signup |
| POST | `/api/auth/login` | Login |
| POST | `/api/posts` | Blog/image/question post banao |
| POST | `/api/posts/video` | Video post banao |
| GET | `/api/posts` | Public feed (approved posts) |
| POST | `/api/comments` | Comment karo |
| GET | `/api/chat/dm/:userId` | DM history |
| POST | `/api/chat/groups` | Group banao |
| GET | `/api/admin/dashboard` | Admin stats |
| GET | `/api/admin/posts?status=flagged_for_review` | Manual review queue |
| PUT | `/api/admin/users/:id/ban` | User ban karo |

Real-time chat Socket.io se hota hai — frontend guide me connection example milega.

## 7. Free-tier limits yaad rakhna

- MongoDB Atlas free: 512MB storage
- Cloudinary free: 25 credits/month (images cheap, video mehenga — isliye video 50MB tak limit rakha hai code me)
- Sightengine free: 500 image checks/month
- Perspective API: koi hard limit nahi, per-second rate limit hai (1 QPS default)

Agar users badh jaye aur free limits kam pade, sabse pehle Cloudinary paid plan ya video ko sirf-YouTube-link tak restrict karna sabse sasta upgrade hoga.
