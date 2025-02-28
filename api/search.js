import YouTube from 'youtube-sr';

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

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
