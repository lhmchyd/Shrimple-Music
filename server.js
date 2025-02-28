import express from 'express';
import cors from 'cors';
import YouTube from 'youtube-sr';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Store active sessions with their last request timestamp
const activeSessions = new Map();

// Session middleware
const sessionHandler = (req, res, next) => {
    const sessionToken = req.headers['x-session-token'];
    
    if (!sessionToken) {
        return res.status(401).json({ error: 'No session token provided' });
    }

    const session = activeSessions.get(sessionToken);
    const now = Date.now();

    if (!session) {
        activeSessions.set(sessionToken, { lastRequest: now, requestCount: 1 });
        return next();
    }

    if (now - session.lastRequest >= 60000) {
        session.requestCount = 1;
        session.lastRequest = now;
        return next();
    }

    if (session.requestCount >= 5) {
        return res.status(429).json({
            error: 'Rate limit exceeded',
            retryAfter: 60,
            limitResetTime: session.lastRequest + 60000 // Add timestamp when limit resets
        });
    }

    session.requestCount++;
    session.lastRequest = now;
    next();
};

// Apply session middleware to search endpoint
app.use('/api/search', sessionHandler);

// Clean up old sessions every hour
setInterval(() => {
    const oneHourAgo = Date.now() - 3600000;
    for (const [token, session] of activeSessions) {
        if (session.lastRequest < oneHourAgo) {
            activeSessions.delete(token);
        }
    }
}, 3600000);

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
            thumbnail: video.thumbnail?.url || video.thumbnails?.[0]?.url
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
