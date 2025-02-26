import express from 'express';
import cors from 'cors';
import YouTube from 'youtube-sr';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

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
    res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0'
    });
    try {
        const { query } = req.query;
        console.log('Server received search request for:', query);
        
        const results = await YouTube.default.search(query, {
            limit: 20,
            type: 'video',
            safeSearch: true
        });
        
        const formattedResults = results.map(video => {
            return {
                videoId: video.id,
                title: video.title,
                artist: video.channel?.name || 'Unknown Artist',
                thumbnail: video.thumbnail?.url || video.thumbnails?.[0]?.url
            };
        });

        console.log('Sending formatted results to client');
        res.json(formattedResults);
    } catch (error) {
        next(error); // Pass errors to the error handler
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});
