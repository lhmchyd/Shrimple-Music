import express from 'express';
import cors from 'cors';
import YouTube from 'youtube-sr';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Simple in-memory rate limiting
const rateLimits = new Map();

// Session middleware
const sessionHandler = (req, res, next) => {
    const sessionToken = req.headers['x-session-token'];
    const clientIp = req.headers['x-forwarded-for'] || req.ip; // Get client IP
    const key = `${sessionToken}-${clientIp}`; // Combine token and IP for better uniqueness
    
    if (!sessionToken) {
        return res.status(401).json({ error: 'No session token provided' });
    }

    const now = Date.now();
    const session = rateLimits.get(key);

    if (!session) {
        rateLimits.set(key, { lastRequest: now, requestCount: 1 });
        return next();
    }

    // Clean up old sessions
    for (const [storedKey, storedSession] of rateLimits.entries()) {
        if (now - storedSession.lastRequest > 3600000) { // 1 hour
            rateLimits.delete(storedKey);
        }
    }

    if (now - session.lastRequest >= 60000) {
        session.requestCount = 1;
        session.lastRequest = now;
        return next();
    }

    if (session.requestCount >= 5) {
        const timeLeft = 60000 - (now - session.lastRequest);
        return res.status(429).json({
            error: 'Rate limit exceeded',
            retryAfter: Math.ceil(timeLeft / 1000),
            limitResetTime: session.lastRequest + 60000
        });
    }

    session.requestCount++;
    session.lastRequest = now;
    next();
};

// Apply session middleware to search endpoint
app.use('/api/search', sessionHandler);

app.get('/api/search', async (req, res, next) => {
    try {
        const { query } = req.query;
        console.log('Server received search request for:', query);
        
        const results = await YouTube.default.search(query, {
            limit: 20,
            type: 'video',
            safeSearch: true
        });
        
        const formattedResults = results.map(video => ({
            videoId: video.id,
            title: video.title,
            artist: video.channel?.name || 'Unknown Artist',
            thumbnail: `https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`
        }));
        
        res.json(formattedResults);
    } catch (error) {
        next(error);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});
