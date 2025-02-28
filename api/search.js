import YouTube from 'youtube-sr';

// Simple in-memory rate limiting for serverless
const rateLimits = new Map();

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    const sessionToken = req.headers['x-session-token'];
    const clientIp = req.headers['x-forwarded-for'] || req.ip;
    const key = `${sessionToken}-${clientIp}`;
    const now = Date.now();

    if (!sessionToken) {
        return res.status(401).json({ error: 'No session token provided' });
    }

    // Clean old entries
    for (const [storedKey, storedSession] of rateLimits.entries()) {
        if (now - storedSession.lastRequest > 3600000) {
            rateLimits.delete(storedKey);
        }
    }

    const session = rateLimits.get(key);
    
    if (!session) {
        rateLimits.set(key, { lastRequest: now, requestCount: 1 });
    } else {
        if (now - session.lastRequest >= 60000) {
            session.requestCount = 1;
            session.lastRequest = now;
        } else if (session.requestCount >= 5) {
            const timeLeft = 60000 - (now - session.lastRequest);
            return res.status(429).json({
                error: 'Rate limit exceeded',
                retryAfter: Math.ceil(timeLeft / 1000),
                limitResetTime: session.lastRequest + 60000
            });
        } else {
            session.requestCount++;
            session.lastRequest = now;
        }
    }

    // Handle preflight request
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Set no-cache headers
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    try {
        // Handle both query string and body parameters
        const query = req.query.query || (req.body && req.body.query);

        if (!query) {
            return res.status(400).json({ error: 'Query parameter is required' });
        }

        console.log('Received search request for:', query);

        const results = await YouTube.default.search(query, {
            limit: 20,
            type: 'video',
            safeSearch: true
        });

        const formattedResults = results.map(video => ({
            videoId: video.id,
            title: video.title,
            artist: video.channel?.name || 'Unknown Artist',
            thumbnail: video.thumbnail?.url || video.thumbnails?.[0]?.url || ''
        }));

        // Support different serverless platforms
        if (typeof res.json === 'function') {
            // Express-like response
            return res.status(200).json(formattedResults);
        } else if (typeof res.send === 'function') {
            // Some serverless platforms
            return res.status(200).send(formattedResults);
        } else {
            // Basic response format
            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                },
                body: JSON.stringify(formattedResults)
            };
        }

    } catch (error) {
        console.error('Search error:', error);
        
        // Handle errors consistently across platforms
        const errorResponse = {
            error: 'Internal server error',
            message: error.message
        };

        if (typeof res.json === 'function') {
            return res.status(500).json(errorResponse);
        } else if (typeof res.send === 'function') {
            return res.status(500).send(errorResponse);
        } else {
            return {
                statusCode: 500,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(errorResponse)
            };
        }
    }
}

// Export additional handler for platforms that need it
export const config = {
    api: {
        bodyParser: true,
        externalResolver: true
    }
};

// Support CommonJS for older platforms
if (typeof module !== 'undefined' && module.exports) {
    module.exports = handler;
    module.exports.config = config;
}
