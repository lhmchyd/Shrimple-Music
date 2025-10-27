const fs = require('fs').promises;
const https = require('https');
const http = require('http');
const { URL } = require('url');

function checkWebsiteStatus(url, timeout = 10000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const urlObj = new URL(url);
    
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Website Status Checker (GitHub Actions)'
      }
    };
    
    const request = client.request(options, (res) => {
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      resolve({
        url,
        status: res.statusCode,
        statusText: res.statusMessage || '',
        responseTime,
        error: null,
        timestamp: new Date().toISOString()
      });
      
      // Consume response to free memory
      res.resume();
    });
    
    request.on('error', (error) => {
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      resolve({
        url,
        status: null,
        statusText: 'Error',
        responseTime,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    });
    
    const timeoutId = setTimeout(() => {
      request.destroy();
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      resolve({
        url,
        status: null,
        statusText: 'Timeout',
        responseTime,
        error: 'Request timed out',
        timestamp: new Date().toISOString()
      });
    }, timeout);
    
    request.on('close', () => clearTimeout(timeoutId));
    request.end();
  });
}

// Function to get date string in YYYY-MM-DD format (using UTC to avoid timezone issues)
function getDateString(date) {
  const d = new Date(date);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function runStatusCheck() {
  console.log('Starting website status check...');
  
  // Load configuration to get websites to monitor
  let config;
  try {
    const configData = await fs.readFile('config.json', 'utf-8');
    config = JSON.parse(configData);
  } catch (error) {
    console.log('No config.json found, using default websites');
    // Use default websites if config is not found
    config = {
      services: [
        { name: "AniList", url: "https://anilist.co" },
        { name: "Giscus", url: "https://giscus.app" }
      ]
    };
  }
  
  const websitesToMonitor = config.services ? config.services.map(service => service.url) : [
    'https://anilist.co',
    'https://giscus.app'
  ];
  
  const results = [];
  
  for (const url of websitesToMonitor) {
    console.log(`Checking ${url}...`);
    const result = await checkWebsiteStatus(url);
    results.push(result);
    console.log(`${url}: Status ${result.status || 'ERROR'} (${result.responseTime}ms)`);
  }
  
  const currentCheck = {
    lastChecked: new Date().toISOString(),
    results
  };
  
  // Load existing detailed history
  let detailedHistory = [];
  try {
    const historyData = await fs.readFile('status-history.json', 'utf-8');
    detailedHistory = JSON.parse(historyData);
  } catch (error) {
    console.log('No existing detailed history found, creating new file');
  }
  
  // Current date (when this check is running)
  const today = getDateString(new Date());
  
  // Before adding the current check, look for completed days in the existing history
  // A "completed day" is a calendar day that has no more entries coming in the current run
  // In our newest-first array, if we find entries from an old day after entries from more recent days,
  // that indicates those old-day entries are "completed" and ready for daily snapshot
  
  // First, let's find dates that might have their last entry ready to be moved
  // Get all unique dates and find the last (chronologically) entry for each date
  const dateEntriesMap = new Map(); // date string -> array of entries from that date
  
  for (const entry of detailedHistory) {
    const dateStr = getDateString(new Date(entry.lastChecked));
    if (!dateEntriesMap.has(dateStr)) {
      dateEntriesMap.set(dateStr, []);
    }
    dateEntriesMap.get(dateStr).push(entry);
  }
  
  // For each date, the chronologically last entry is the last one in the array
  // (since detailedHistory is newest-first, the chronologically last entry from a date is the last occurrence in the array)
  for (const [dateStr, entries] of dateEntriesMap) {
    if (dateStr !== today) {
      // Get the chronologically last entry for this date (the last occurrence in the newest-first array)
      const lastEntryForDate = entries[entries.length - 1];
      
      // Add this as a daily snapshot if not already present
      let dailyStatus = [];
      try {
        const dailyData = await fs.readFile('status-day.json', 'utf-8');
        dailyStatus = JSON.parse(dailyData);
      } catch (error) {
        console.log('No existing daily status history found, creating new file');
      }
      
      // Check if this date already exists in daily status to avoid duplicates
      const existingIndex = dailyStatus.findIndex(item => 
        getDateString(new Date(item.lastChecked)) === dateStr
      );
      
      if (existingIndex === -1) {
        // Add the chronologically last check from this date as the daily snapshot
        dailyStatus.unshift({
          lastChecked: lastEntryForDate.lastChecked,
          results: lastEntryForDate.results
        });
        
        // Keep only the last 60 days of daily data
        dailyStatus = dailyStatus.slice(0, 60);
        
        // Save daily status history
        await fs.writeFile('status-day.json', JSON.stringify(dailyStatus, null, 2));
        console.log(`Daily snapshot added to status-day.json from ${dateStr}'s last check`);
      }
    }
  }
  
  // Add current check to detailed history
  detailedHistory.unshift(currentCheck);
  
  // Keep only last 100 detailed checks to manage file size
  detailedHistory = detailedHistory.slice(0, 100);
  
  // Save detailed history (for recent checks at 5-minute intervals)
  await fs.writeFile('status-history.json', JSON.stringify(detailedHistory, null, 2));
  console.log(`Detailed history updated in status-history.json (${detailedHistory.length} entries)`);
  
  // Save current status (for the main page)
  await fs.writeFile('status-results.json', JSON.stringify(currentCheck, null, 2));
  console.log('Current status saved to status-results.json');
  
  return results;
}

runStatusCheck()
  .then(() => {
    console.log('Status check completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error during status check:', error);
    process.exit(0);
  });
