const express = require('express')
const mongoose = require('mongoose')
const multer = require('multer')
const { GridFSBucket } = require('mongodb')
const { Types } = mongoose
const { Readable } = require('stream')
const path = require('path')
const crypto = require('crypto')
const { clerkClient, clerkMiddleware, getAuth } = require('@clerk/express')
const { publishableKeyFromHost } = require('@clerk/shared/keys')
const {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost
} = require('./.cache/clerkProxyMiddleware.cjs')

const PORT = Number(process.env.PORT) || 5000
const ADMIN = 'oten'
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase()
const AGE_COOKIE = 'nelo_adult'
const AGE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180
const MONGODB_URI = process.env.MONGODB_URI

const app = express()
const upload = multer({ storage: multer.memoryStorage() })
const commentWrites = new Map()
const conn = mongoose.connection
let bucket

if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI).catch(() => {
    console.error('MongoDB connection failed. Check the configured database connection.')
  })
} else {
  console.error('MONGODB_URI is not configured. The video library is unavailable until it is set in Replit Secrets.')
}

conn.once('open', () => {
  bucket = new GridFSBucket(conn.db, { bucketName: 'videos' })
  Promise.all([
    conn.db.collection('comments').createIndex({ videoTitle: 1, createdAt: -1 }),
    conn.db.collection('reactions').createIndex({ videoTitle: 1, userId: 1 }, { unique: true })
  ]).catch(() => console.error('Could not initialize the video discussion storage.'))
})

app.set('trust proxy', 1)
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware())
app.use(clerkMiddleware((req) => ({
  publishableKey: publishableKeyFromHost(
    getClerkProxyHost(req) ?? '',
    process.env.CLERK_PUBLISHABLE_KEY,
  ),
})))
app.use(express.json({ limit: '16kb' }))
app.use(express.urlencoded({ extended: true, limit: '16kb' }))
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff')
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  next()
})
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '7d', etag: true }))

function adultCookieSignature(timestamp) {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is not configured')
  return crypto.createHmac('sha256', secret).update(`adult:${timestamp}`).digest('base64url')
}

function hasAdultConfirmation(req) {
  const part = (req.headers.cookie || '').split(';').map(value => value.trim())
    .find(value => value.startsWith(`${AGE_COOKIE}=`))
  if (!part) return false

  const [timestamp, signature] = part.slice(AGE_COOKIE.length + 1).split('.')
  const issuedAt = Number(timestamp)
  const ageSeconds = Math.floor(Date.now() / 1000) - issuedAt
  if (!Number.isSafeInteger(issuedAt) || ageSeconds < 0 || ageSeconds > AGE_MAX_AGE_SECONDS) return false

  try {
    const expected = Buffer.from(adultCookieSignature(timestamp))
    const received = Buffer.from(signature || '')
    return expected.length === received.length && crypto.timingSafeEqual(expected, received)
  } catch {
    return false
  }
}

function requireAdult(req, res, next) {
  if (!hasAdultConfirmation(req)) {
    return res.status(403).json({ error: 'Confirm that you are 18 or older to continue.' })
  }
  if (!bucket) return res.status(503).json({ error: 'The video library is not available right now.' })
  next()
}

function getSignedInUserId(req) {
  const auth = getAuth(req)
  return auth?.sessionClaims?.userId || auth?.userId || null
}

function requireSignIn(req, res, next) {
  const userId = getSignedInUserId(req)
  if (!userId) return res.status(401).json({ error: 'Sign in to continue.' })
  req.userId = userId
  next()
}

async function requireAdmin(req, res, next) {
  const userId = getSignedInUserId(req)
  if (!userId) return res.status(401).json({ error: 'Sign in to continue.' })
  if (!ADMIN_EMAIL) return res.status(503).json({ error: 'Video administrator access is not configured.' })

  try {
    const user = await clerkClient.users.getUser(userId)
    const hasVerifiedAdminEmail = user.emailAddresses.some(email =>
      email.emailAddress.trim().toLowerCase() === ADMIN_EMAIL &&
      email.verification?.status === 'verified'
    )
    if (!hasVerifiedAdminEmail) {
      return res.status(403).json({ error: 'Only the video administrator can manage the library.' })
    }
    req.userId = userId
    next()
  } catch {
    res.status(503).json({ error: 'Administrator access could not be verified right now.' })
  }
}

async function titleExists(title) {
  const files = await bucket.find().toArray()
  return files.some(file => (file.metadata?.title || file.metadata?.original || file.filename) === title)
}

function validTitle(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 256
}

const authPage = (_req, res) => res.sendFile(path.join(__dirname, 'public', 'auth.html'))
app.get(/^\/sign-in(?:\/.*)?$/, authPage)
app.get(/^\/sign-up(?:\/.*)?$/, authPage)

app.get('/api/config', (req, res) => {
  const host = getClerkProxyHost(req) ?? ''
  res.set('Cache-Control', 'no-store').json({
    publishableKey: publishableKeyFromHost(host, process.env.CLERK_PUBLISHABLE_KEY),
    proxyUrl: process.env.VITE_CLERK_PROXY_URL || ''
  })
})

app.get('/api/age-status', (req, res) => {
  res.json({ confirmed: hasAdultConfirmation(req) })
})

app.post('/api/age-confirmation', (req, res) => {
  if (req.body?.confirmed !== true) {
    return res.status(400).json({ error: 'Confirm that you are 18 or older to continue.' })
  }
  try {
    const timestamp = String(Math.floor(Date.now() / 1000))
    const secure = req.secure || req.get('x-forwarded-proto')?.split(',')[0].trim() === 'https'
    res.cookie(AGE_COOKIE, `${timestamp}.${adultCookieSignature(timestamp)}`, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      maxAge: AGE_MAX_AGE_SECONDS * 1000,
      path: '/'
    })
    res.json({ ok: true })
  } catch {
    res.status(503).json({ error: 'Age confirmation is unavailable right now.' })
  }
})

app.get('/api/stream/:id', requireAdult, async (req, res) => {
  if (!Types.ObjectId.isValid(req.params.id)) return res.sendStatus(404)
  const id = new Types.ObjectId(req.params.id)
  const files = await bucket.find({ _id: id }).toArray()
  const file = files[0]
  if (!file) return res.sendStatus(404)

  const length = file.length
  const type = file.contentType || 'video/mp4'
  const range = req.headers.range
  if (!range) {
    res.set({ 'Content-Type': type, 'Content-Length': length, 'Accept-Ranges': 'bytes' })
    return bucket.openDownloadStream(id).pipe(res)
  }

  const [startText, endText] = range.replace(/bytes=/, '').split('-')
  const start = Number.parseInt(startText, 10)
  const end = endText ? Math.min(Number.parseInt(endText, 10), length - 1) : length - 1
  if (!Number.isSafeInteger(start) || start < 0 || start >= length || end < start) {
    return res.status(416).set('Content-Range', `bytes */${length}`).end()
  }

  res.status(206).set({
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Content-Range': `bytes ${start}-${end}/${length}`,
    'Content-Length': end - start + 1
  })
  bucket.openDownloadStream(id, { start, end: end + 1 }).pipe(res)
})

app.get('/api/download/:id', requireAdult, async (req, res) => {
  if (!Types.ObjectId.isValid(req.params.id)) return res.sendStatus(404)
  const id = new Types.ObjectId(req.params.id)
  const files = await bucket.find({ _id: id }).toArray()
  const file = files[0]
  if (!file) return res.sendStatus(404)

  const filename = path.basename(file.metadata?.original || file.filename).replace(/["\\\r\n]/g, '_')
  res.set({
    'Content-Type': file.contentType || 'video/mp4',
    'Content-Disposition': `attachment; filename="${filename}"`
  })
  bucket.openDownloadStream(id).pipe(res)
})

app.delete('/api/video/:id', requireAdult, requireAdmin, async (req, res) => {
  if (!Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ ok: false })
  try {
    await bucket.delete(new Types.ObjectId(req.params.id))
    res.json({ ok: true })
  } catch {
    res.status(500).json({ ok: false })
  }
})

app.get('/api/videos', requireAdult, async (_req, res) => {
  const files = await bucket.find().sort({ uploadDate: -1 }).toArray()
  const grouped = {}
  files.forEach(file => {
    const original = file.metadata?.original || file.filename
    const title = file.metadata?.title || original
    const match = original.match(/_(\d{3,4}p)\./i)
    const quality = match ? match[1] : 'original'
    if (!grouped[title]) grouped[title] = []
    grouped[title].push({ id: file._id.toString(), quality })
  })
  const videos = Object.entries(grouped).map(([title, variants]) => {
    variants.sort((a, b) => {
      const rank = item => item.quality === 'original' ? 0 : Number.parseInt(item.quality, 10)
      return rank(b) - rank(a)
    })
    return { title, variants }
  })
  res.json(videos)
})

app.get('/api/comments', requireAdult, async (req, res) => {
  const title = typeof req.query.title === 'string' ? req.query.title.trim() : ''
  if (!validTitle(title)) return res.status(400).json({ error: 'A valid video title is required.' })
  try {
    if (!await titleExists(title)) return res.status(404).json({ error: 'Video not found.' })
    const comments = await conn.db.collection('comments')
      .find({ videoTitle: title })
      .sort({ createdAt: 1 })
      .limit(100)
      .toArray()
    res.json({
      comments: comments.map(comment => ({
        id: comment._id.toString(),
        userId: comment.userId,
        displayName: comment.displayName,
        text: comment.text,
        createdAt: comment.createdAt
      }))
    })
  } catch {
    res.status(503).json({ error: 'Comments could not be loaded right now.' })
  }
})

app.post('/api/comments', requireAdult, requireSignIn, async (req, res) => {
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : ''
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : ''
  if (!validTitle(title)) return res.status(400).json({ error: 'A valid video title is required.' })
  if (!text || text.length > 1000) return res.status(400).json({ error: 'Comments must be between 1 and 1,000 characters.' })

  const now = Date.now()
  const recent = (commentWrites.get(req.userId) || []).filter(timestamp => now - timestamp < 60_000)
  if (recent.length >= 5) return res.status(429).json({ error: 'Please wait a moment before posting another comment.' })

  try {
    if (!await titleExists(title)) return res.status(404).json({ error: 'Video not found.' })
    recent.push(now)
    commentWrites.set(req.userId, recent)
    const comment = {
      videoTitle: title,
      userId: req.userId,
      displayName: `Member ${req.userId.slice(-5)}`,
      text,
      createdAt: new Date(now)
    }
    const result = await conn.db.collection('comments').insertOne(comment)
    res.status(201).json({
      comment: {
        id: result.insertedId.toString(),
        userId: comment.userId,
        displayName: comment.displayName,
        text: comment.text,
        createdAt: comment.createdAt
      }
    })
  } catch {
    res.status(503).json({ error: 'Your comment could not be posted right now.' })
  }
})

app.delete('/api/comments/:id', requireAdult, requireSignIn, async (req, res) => {
  if (!Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid comment.' })
  try {
    const result = await conn.db.collection('comments').deleteOne({
      _id: new Types.ObjectId(req.params.id),
      userId: req.userId
    })
    if (!result.deletedCount) return res.status(404).json({ error: 'Comment not found.' })
    res.json({ ok: true })
  } catch {
    res.status(503).json({ error: 'The comment could not be deleted right now.' })
  }
})

app.get('/api/engagement', requireAdult, async (req, res) => {
  const title = typeof req.query.title === 'string' ? req.query.title.trim() : ''
  if (!validTitle(title)) return res.status(400).json({ error: 'A valid video title is required.' })
  try {
    if (!await titleExists(title)) return res.status(404).json({ error: 'Video not found.' })
    const reactions = conn.db.collection('reactions')
    const comments = conn.db.collection('comments')
    const userId = getSignedInUserId(req)
    const [likes, commentCount, reaction] = await Promise.all([
      reactions.countDocuments({ videoTitle: title }),
      comments.countDocuments({ videoTitle: title }),
      userId ? reactions.findOne({ videoTitle: title, userId }) : null
    ])
    res.json({ likes, comments: commentCount, liked: Boolean(reaction) })
  } catch {
    res.status(503).json({ error: 'Video activity could not be loaded right now.' })
  }
})

app.put('/api/reaction', requireAdult, requireSignIn, async (req, res) => {
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : ''
  if (!validTitle(title) || typeof req.body?.liked !== 'boolean') {
    return res.status(400).json({ error: 'A video and reaction state are required.' })
  }
  try {
    if (!await titleExists(title)) return res.status(404).json({ error: 'Video not found.' })
    const reactions = conn.db.collection('reactions')
    if (req.body.liked) {
      try {
        await reactions.updateOne(
          { videoTitle: title, userId: req.userId },
          { $setOnInsert: { videoTitle: title, userId: req.userId, createdAt: new Date() } },
          { upsert: true }
        )
      } catch (error) {
        if (error.code !== 11000) throw error
      }
    } else {
      await reactions.deleteOne({ videoTitle: title, userId: req.userId })
    }
    const likes = await reactions.countDocuments({ videoTitle: title })
    res.json({ likes, liked: req.body.liked })
  } catch {
    res.status(503).json({ error: 'Your reaction could not be saved right now.' })
  }
})

app.post('/api/upload', requireAdult, requireAdmin, upload.single('video'), (req, res) => {
  if (!req.file) return res.redirect(`/admin/${ADMIN}`)
  const { buffer, originalname, mimetype } = req.file
  const title = req.body.title || originalname
  const stream = bucket.openUploadStream(
    `${Date.now()}${path.extname(originalname)}`,
    { contentType: mimetype || 'video/mp4', metadata: { original: originalname, title } }
  )
  Readable.from(buffer).pipe(stream).on('finish', () => res.redirect(`/admin/${ADMIN}`))
})

app.get(`/admin/${ADMIN}`, (req, res, next) => {
  if (!hasAdultConfirmation(req)) return res.redirect('/')
  if (!getSignedInUserId(req)) {
    return res.redirect(`/sign-in?redirect=${encodeURIComponent(`/admin/${ADMIN}`)}`)
  }
  next()
}, requireAdmin, (_req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'admin.html'))
})

app.use((error, _req, res, _next) => {
  console.error('Request failed.')
  if (!res.headersSent) res.status(500).json({ error: 'The request could not be completed.' })
})

app.listen(PORT, () => console.log(`Nelo Butay is listening on port ${PORT}.`))