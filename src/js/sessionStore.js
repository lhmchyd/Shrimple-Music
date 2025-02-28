import fs from 'fs';
import path from 'path';

const SESSION_FILE = '/tmp/sessions.json';

// Initialize session store
function initSessionStore() {
    try {
        if (!fs.existsSync(SESSION_FILE)) {
            fs.writeFileSync(SESSION_FILE, JSON.stringify({}));
        }
    } catch (error) {
        console.error('Error initializing session store:', error);
    }
}

// Get session data
function getSession(token) {
    try {
        const sessions = JSON.parse(fs.readFileSync(SESSION_FILE));
        return sessions[token];
    } catch (error) {
        console.error('Error reading session:', error);
        return null;
    }
}

// Save session data
function saveSession(token, data) {
    try {
        const sessions = JSON.parse(fs.readFileSync(SESSION_FILE));
        sessions[token] = data;
        fs.writeFileSync(SESSION_FILE, JSON.stringify(sessions));
    } catch (error) {
        console.error('Error saving session:', error);
    }
}

// Clean old sessions
function cleanOldSessions() {
    try {
        const sessions = JSON.parse(fs.readFileSync(SESSION_FILE));
        const now = Date.now();
        const oneHourAgo = now - 3600000;

        Object.keys(sessions).forEach(token => {
            if (sessions[token].lastRequest < oneHourAgo) {
                delete sessions[token];
            }
        });

        fs.writeFileSync(SESSION_FILE, JSON.stringify(sessions));
    } catch (error) {
        console.error('Error cleaning sessions:', error);
    }
}

export { initSessionStore, getSession, saveSession, cleanOldSessions };
