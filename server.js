import express from 'express';
import cors from 'cors';
import YouTube from 'youtube-sr';
import rateLimit from 'express-rate-limit';
import NodeCache from 'node-cache';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Create cache instance (items expire after 1 hour)
const searchCache = new NodeCache({ stdTTL: 3600 });

// Create rate limiter only for new searches
const newSearchLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5, // 30 requests per minute
    message: { 
        error: 'Rate limit exceeded',
        retryAfter: 60
    },
    skip: (req) => {
        // Skip rate limiting if query exists in cache
        const query = req.query.query;
        return searchCache.has(query);
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Apply modified middleware chain
app.use('/api/search', newSearchLimiter);

// Add no-cache headers middleware
app.use((req, res, next) => {
    res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0'
    });
    next();
});

// Error handler middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err.stack);
    res.status(500).json({ error: 'Something broke!' });
});

app.get('/api/search', async (req, res, next) => {
    try {
        const { query } = req.query;
        console.log('Server received search request for:', query);

        // Check cache first
        const cachedResults = searchCache.get(query);
        if (cachedResults) {
            console.log('Returning cached results for:', query);
            // Don't count cached results against rate limit
            return res.json(cachedResults);
        }
        
        // Only new searches get rate limited
        console.log('Cache miss, performing new search');
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

        // Store in cache
        searchCache.set(query, formattedResults);
        
        console.log('Sending new results to client');
        res.json(formattedResults);
    } catch (error) {
        next(error); // Pass errors to the error handler
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});
