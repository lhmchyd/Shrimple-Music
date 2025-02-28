import { initDB, getFavorites, addFavorite, removeFavorite } from '/src/js/db.js';

let tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
let firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

let player;
let currentVideoId = '';
let isPlayerReady = false;
let isShuffleOn = false;
let repeatMode = 0; // 0: no repeat, 1: repeat all, 2: repeat one
let playlist = [];
let currentIndex = -1;
let queue = [];
let favorites = [];

// Add this to initialize favorites from IndexedDB
async function initializeFavorites() {
    try {
        favorites = await getFavorites();
        updateQueue(); // Refresh the UI with loaded favorites
        // Add this: Initialize empty playlist if not already set
        if (!playlist) {
            playlist = [];
        }
    } catch (error) {
        console.error('Error loading favorites:', error);
        favorites = [];
    }
}

function onYouTubeIframeAPIReady() {
    // Remove any existing player element
    const oldPlayer = document.getElementById('player');
    if (oldPlayer) {
        oldPlayer.remove();
    }

    // Create a new player container
    const playerContainer = document.createElement('div');
    playerContainer.id = 'player';
    playerContainer.style.position = 'fixed';
    playerContainer.style.bottom = '-9999px';
    document.body.appendChild(playerContainer);

    // Initialize the player
    player = new YT.Player('player', {
        height: '360',
        width: '640',
        videoId: '',
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
}

function onPlayerReady(event) {
    isPlayerReady = true;
    console.log('Player is ready');
}

async function search() {
    try {
        const query = document.getElementById('searchInput').value.trim();
        const resultsDiv = document.getElementById('searchResults');
        
        if (!query) {
            resultsDiv.innerHTML = '<p>Please enter a search term</p>';
            return;
        }

        // Show loading cards
        resultsDiv.style.display = 'grid';
        const loadingCards = Array(8).fill(0).map(() => `
            <div class="skeleton-card">
                <div class="skeleton-thumbnail"></div>
                <div class="skeleton-title"></div>
                <div class="skeleton-artist"></div>
            </div>
        `).join('');
        resultsDiv.innerHTML = loadingCards;
        
        // Fetch search results
        const response = await fetch(`/api/search?query=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error('Search request failed');
        
        const results = await response.json();
        playlist = results;
        
        if (!Array.isArray(results) || results.length === 0) {
            resultsDiv.innerHTML = '<p>No results found</p>';
            return;
        }

        // Hide hero section and show container with results
        const heroSection = document.querySelector('.hero-section');
        const container = document.querySelector('.container');
        heroSection.style.display = 'none';
        container.classList.add('has-results');

        // Update search results with new structure
        resultsDiv.innerHTML = results.map(song => `
            <div class="search-result" onclick="playSong('${song.videoId}', '${encodeURIComponent(song.title)}', '${encodeURIComponent(song.artist)}', '${song.thumbnail}')">
                <div class="thumbnail-container">
                    <img src="${song.thumbnail}" alt="${song.title}">
                </div>
                <div class="info">
                    <h3>${decodeURIComponent(song.title)}</h3>
                    <div class="artist">${decodeURIComponent(song.artist)}</div>
                </div>
                <button class="favorite-btn ${isFavorite(song) ? 'active' : ''}" 
                    onclick="toggleFavorite(event, '${song.videoId}', '${encodeURIComponent(song.title)}', '${encodeURIComponent(song.artist)}', '${song.thumbnail}')">
                    <span class="material-icons">${isFavorite(song) ? 'favorite' : 'favorite_border'}</span>
                </button>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Search error:', error);
        document.getElementById('searchResults').innerHTML = 
            `<p class="search-error">Error searching: ${error.message}. Please try again.</p>`;
    }
}

function searchFromHero() {
    const heroInput = document.getElementById('heroSearchInput');
    const mainInput = document.getElementById('searchInput');
    const heroSection = document.querySelector('.hero-section');
    const container = document.querySelector('.container');
    
    // Copy search term to main search input
    mainInput.value = heroInput.value;
    
    // Hide hero section and show main content
    heroSection.style.display = 'none';
    container.classList.add('active');
    
    // Perform search
    search();
}

function playSong(videoId, title, artist, thumbnail) {
    if (!isPlayerReady) {
        console.log('Player not ready, retrying in 1 second...');
        setTimeout(() => playSong(videoId, title, artist, thumbnail), 1000);
        return;
    }

    try {
        currentVideoId = videoId;
        // Add this: Add the song to playlist if it doesn't exist
        if (!playlist.some(song => song.videoId === videoId)) {
            playlist.push({ videoId, title, artist, thumbnail });
        }
        currentIndex = playlist.findIndex(song => song.videoId === videoId);
        
        // Update player and UI
        player.loadVideoById(videoId);
        updatePlayerUI(title, artist, thumbnail);
        document.getElementById('playPauseBtn').innerHTML = '<i class="fas fa-pause"></i>';
        
        // Reset time display and progress bar
        document.getElementById('currentTime').textContent = '0:00';
        document.getElementById('duration').textContent = '0:00';
        document.getElementById('progressBar').value = 0;
        
        // Force play
        player.playVideo();
        console.log('Playing:', title, 'by', artist);
        
        // Auto-expand player on mobile when new song starts
        if (window.innerWidth <= 768) {
            expandPlayer();
        }
        updateQueue();
    } catch (error) {
        console.error('Error playing song:', error);
    }
}

function updatePlayerUI(title, artist, thumbnail) {
    // Desktop UI - decode the encoded strings
    document.getElementById('nowPlayingTitle').textContent = decodeURIComponent(title);
    document.getElementById('nowPlayingArtist').textContent = decodeURIComponent(artist);
    document.getElementById('currentThumbnail').src = thumbnail;

    // Mobile UI - decode the encoded strings
    document.getElementById('mobileTitle').textContent = decodeURIComponent(title);
    document.getElementById('mobileArtist').textContent = decodeURIComponent(artist);
    document.getElementById('mobileThumbnail').src = thumbnail;
}

function onPlayerStateChange(event) {
    const btn = document.getElementById('playPauseBtn');
    const mobileBtn = document.querySelector('.mini-play-button .material-icons');
    
    switch(event.data) {
        case YT.PlayerState.PLAYING:
            btn.innerHTML = '<i class="fas fa-pause"></i>';
            mobileBtn.textContent = 'pause'; // Update mini button
            updateProgressBar();
            break;
        case YT.PlayerState.PAUSED:
            btn.innerHTML = '<i class="fas fa-play"></i>';
            mobileBtn.textContent = 'play_arrow'; // Update mini button
            break;
        case YT.PlayerState.ENDED:
            btn.innerHTML = '<i class="fas fa-play"></i>';
            mobileBtn.textContent = 'play_arrow'; // Update mini button
            document.getElementById('progressBar').value = 100;
            if (repeatMode === 2) {
                player.playVideo();
            } else if (repeatMode === 1 || isShuffleOn) {
                playNext();
            }
            break;
    }
}

function togglePlay(event) {
    if (event) event.stopPropagation(); // Prevent expansion when clicking play button
    if (!currentVideoId) return; // Don't do anything if no song is selected
    
    const mobileBtn = document.querySelector('.mini-play-button .material-icons');
    
    if (player.getPlayerState() === YT.PlayerState.PLAYING) {
        player.pauseVideo();
        mobileBtn.textContent = 'play_arrow';
    } else {
        player.playVideo();
        mobileBtn.textContent = 'pause';
    }
}

function updateProgressBar() {
    if (player.getPlayerState() === YT.PlayerState.PLAYING) {
        const duration = player.getDuration();
        const current = player.getCurrentTime();
        const progress = (current / duration) * 100;
        
        // Update both desktop and mobile progress bars
        const progressBars = ['progressBar', 'mobileProgress'];
        progressBars.forEach(id => {
            const bar = document.getElementById(id);
            if (!bar.getAttribute('data-seeking')) {
                bar.value = progress;
                bar.style.setProperty('--progress', `${progress}%`);
            }
        });
        
        // Update both time displays
        const currentTime = formatTime(current);
        const durationTime = formatTime(duration);
        document.getElementById('currentTime').textContent = currentTime;
        document.getElementById('duration').textContent = durationTime;
        document.getElementById('mobileCurrent').textContent = currentTime;
        document.getElementById('mobileDuration').textContent = durationTime;
        
        setTimeout(updateProgressBar, 1000);
    }
}

// Add these new functions for progress bar handling
function initializeProgressBar() {
    const progressBar = document.getElementById('progressBar');
    
    progressBar.addEventListener('mousedown', () => {
        progressBar.setAttribute('data-seeking', 'true');
    });

    progressBar.addEventListener('mouseup', () => {
        progressBar.removeAttribute('data-seeking');
        const time = (player.getDuration() * progressBar.value) / 100;
        player.seekTo(time, true);
    });

    progressBar.addEventListener('input', (e) => {
        const progress = e.target.value;
        progressBar.style.setProperty('--progress', `${progress}%`);
        const duration = player.getDuration();
        const seekTime = (duration * progress) / 100;
        document.getElementById('currentTime').textContent = formatTime(seekTime);
    });
}

function shuffleArray(array) {
    // Create a copy of the array to preserve original
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function toggleShuffle() {
    isShuffleOn = !isShuffleOn;
    const shuffleBtn = document.getElementById('shuffleBtn');
    const mobileShuffleBtn = document.getElementById('mobileShuffleBtn');
    
    shuffleBtn.classList.toggle('active-control');
    mobileShuffleBtn.classList.toggle('active-control');

    if (isShuffleOn) {
        // Save current song
        const currentSong = playlist[currentIndex];
        
        // Shuffle the remaining songs in playlist
        const remainingPlaylist = playlist.filter((_, index) => index !== currentIndex);
        const shuffledRemaining = shuffleArray(remainingPlaylist);
        
        // Put current song at the beginning and shuffled songs after
        playlist = [currentSong, ...shuffledRemaining];
        currentIndex = 0;
        
        // Shuffle favorites separately
        if (favorites.length > 0) {
            const currentFavIndex = favorites.findIndex(f => f.videoId === currentVideoId);
            if (currentFavIndex !== -1) {
                const currentFav = favorites[currentFavIndex];
                const remainingFavs = favorites.filter((_, index) => index !== currentFavIndex);
                favorites = [currentFav, ...shuffleArray(remainingFavs)];
            } else {
                favorites = shuffleArray(favorites);
            }
        }
    } else {
        // When turning shuffle off, sort both lists by title
        playlist.sort((a, b) => a.title.localeCompare(b.title));
        favorites.sort((a, b) => a.title.localeCompare(b.title));
        // Update currentIndex to match current song's new position
        currentIndex = playlist.findIndex(song => song.videoId === currentVideoId);
    }
    
    // Update the UI
    updateQueue();
}

function toggleRepeat() {
    repeatMode = (repeatMode + 1) % 3;
    const repeatBtn = document.getElementById('repeatBtn');
    const icon = repeatBtn.querySelector('.material-icons');
    
    repeatBtn.classList.toggle('active-control', repeatMode > 0);
    icon.textContent = repeatMode === 2 ? 'repeat_one' : 'repeat';
}

// Modify the playNext function to prioritize favorites
function playNext() {
    if (favorites.length > 0) {
        // Find current song index in favorites
        const currentFavIndex = favorites.findIndex(f => f.videoId === currentVideoId);
        let nextIndex;

        if (isShuffleOn) {
            // Play random favorite
            nextIndex = Math.floor(Math.random() * favorites.length);
        } else {
            // Play next favorite or loop back to first
            nextIndex = currentFavIndex === -1 ? 0 : (currentFavIndex + 1) % favorites.length;
        }

        const nextSong = favorites[nextIndex];
        playSong(nextSong.videoId, nextSong.title, nextSong.artist, nextSong.thumbnail);
    } else {
        // Default behavior when no favorites
        if (playlist.length === 0) return;
        
        if (isShuffleOn) {
            currentIndex = Math.floor(Math.random() * playlist.length);
        } else {
            currentIndex = (currentIndex + 1) % playlist.length;
        }
        
        const song = playlist[currentIndex];
        playSong(song.videoId, song.title, song.artist, song.thumbnail);
    }
    updateQueue();
}

// Modify the playPrevious function to prioritize favorites
function playPrevious() {
    if (player.getCurrentTime() > 3) {
        player.seekTo(0);
        return;
    }

    if (favorites.length > 0) {
        const currentFavIndex = favorites.findIndex(f => f.videoId === currentVideoId);
        let prevIndex;

        if (isShuffleOn) {
            prevIndex = Math.floor(Math.random() * favorites.length);
        } else {
            prevIndex = currentFavIndex === -1 ? 
                favorites.length - 1 : 
                (currentFavIndex - 1 + favorites.length) % favorites.length;
        }

        const prevSong = favorites[prevIndex];
        playSong(prevSong.videoId, prevSong.title, prevSong.artist, prevSong.thumbnail);
    } else {
        if (playlist.length === 0) return;
        currentIndex = (currentIndex - 1 + playlist.length) % playlist.length;
        const song = playlist[currentIndex];
        playSong(song.videoId, song.title, song.artist, song.thumbnail);
    }
    updateQueue();
}

function toggleMute() {
    const volumeIcon = document.getElementById('volumeIcon');
    if (player.isMuted()) {
        player.unMute();
        volumeIcon.textContent = 'volume_up';
    } else {
        player.mute();
        volumeIcon.textContent = 'volume_off';
    }
}

document.getElementById('volumeBar').addEventListener('input', (e) => {
    const volume = e.target.value;
    player.setVolume(volume);
    
    // Update volume bar progress
    e.target.style.setProperty('--volume', `${volume}%`);
    
    const volumeIcon = document.getElementById('volumeIcon');
    if (volume === '0') {
        volumeIcon.textContent = 'volume_off';
    } else if (volume < 50) {
        volumeIcon.textContent = 'volume_down';
    } else {
        volumeIcon.textContent = 'volume_up';
    }
});

// Add player expansion handling
function expandPlayer(event) {
    if (event) event.stopPropagation();
    const playerControls = document.querySelector('.player-controls');
    const closeButton = document.querySelector('.close-button');
    const expandedControls = document.querySelector('.expanded-controls');
    
    playerControls.classList.remove('minimized');
    playerControls.classList.add('expanded');
    closeButton.style.display = 'block';
    expandedControls.style.display = 'flex';
    
    // Add history state when expanding
    history.pushState(null, null, window.location.pathname);

    // Sync progress with desktop player
    const mobileProgress = document.getElementById('mobileProgress');
    const desktopProgress = document.getElementById('progressBar');
    mobileProgress.value = desktopProgress.value;
    mobileProgress.style.setProperty('--progress', `${desktopProgress.value}%`);
    
    // Update mobile time display
    document.getElementById('mobileCurrent').textContent = document.getElementById('currentTime').textContent;
    document.getElementById('mobileDuration').textContent = document.getElementById('duration').textContent;
}

function minimizePlayer() {
    const playerControls = document.querySelector('.player-controls');
    const closeButton = document.querySelector('.close-button');
    const expandedControls = document.querySelector('.expanded-controls');
    
    playerControls.classList.remove('expanded');
    playerControls.classList.add('minimized');
    closeButton.style.display = 'none';
    expandedControls.style.display = 'none';
}

// Add click outside handler to minimize player
document.addEventListener('click', (event) => {
    if (window.innerWidth <= 768) {
        const playerControls = document.querySelector('.player-controls');
        const isExpanded = playerControls.classList.contains('expanded');
        
        if (isExpanded && !event.target.closest('.player-controls')) {
            minimizePlayer();
        }
    }
});

// Add ESC key handler
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        const playerControls = document.querySelector('.player-controls');
        if (playerControls.classList.contains('expanded')) {
            event.preventDefault();
            minimizePlayer();
        }
    }
});

// Add back button handler
window.addEventListener('popstate', (event) => {
    const playerControls = document.querySelector('.player-controls');
    if (playerControls.classList.contains('expanded')) {
        event.preventDefault();
        minimizePlayer();
        history.pushState(null, null, window.location.pathname);
    }
});

// Add a page load handler
window.addEventListener('load', function() {
    if (typeof YT === 'undefined' || !YT.Player) {
        // If YouTube API isn't loaded yet, it will call onYouTubeIframeAPIReady automatically
        return;
    }
    // If YouTube API is already loaded, initialize manually
    onYouTubeIframeAPIReady();
});

function updateQueue() {
    // Update Now Playing
    const nowPlayingQueue = document.getElementById('nowPlayingQueue');
    if (currentIndex !== -1 && playlist[currentIndex]) {
        const current = playlist[currentIndex];
        nowPlayingQueue.innerHTML = `
            <img src="${current.thumbnail}" alt="${current.title}">
            <div class="queue-info">
                <div class="queue-title">${current.title}</div>
                <div class="queue-artist">${current.artist}</div>
            </div>
            <button class="favorite-btn ${isFavorite(current) ? 'active' : ''}" 
                onclick="toggleFavorite(event, '${current.videoId}', '${encodeURIComponent(current.title)}', '${encodeURIComponent(current.artist)}', '${current.thumbnail}')">
                <span class="material-icons">${isFavorite(current) ? 'favorite' : 'favorite_border'}</span>
            </button>
        `;
    }

    // Update section header
    const sectionTitle = document.querySelector('.next-up-section h2');
    sectionTitle.textContent = shouldShowFavorites() ? 'Favorites' : 'Next Up';
    
    // Hide the toggle button since we don't need it anymore
    const viewBtn = document.getElementById('viewToggleBtn');
    if (viewBtn) viewBtn.style.display = 'none';

    // Update Queue List based on favorites presence
    const queueList = document.getElementById('queueList');
    const displayList = shouldShowFavorites() ? favorites : playlist.slice(currentIndex + 1);
    let queueHtml = '';
    
    if (displayList.length === 0) {
        queueHtml = '<div class="empty-message">No songs in ' + (shouldShowFavorites() ? 'favorites' : 'queue') + '</div>';
    } else {
        displayList.forEach((song, index) => {
            const actualIndex = shouldShowFavorites() ? index : currentIndex + 1 + index;
            queueHtml += `
                <div class="queue-item" 
                    draggable="true" 
                    data-index="${actualIndex}"
                    data-video-id="${song.videoId}"
                    onclick="playQueueItem('${song.videoId}', '${encodeURIComponent(song.title)}', '${encodeURIComponent(song.artist)}', '${song.thumbnail}')"
                    ondragstart="handleDragStart(event)"
                    ondragover="handleDragOver(event)"
                    ondragleave="handleDragLeave(event)"
                    ondrop="handleDrop(event)">
                    <div class="thumbnail-container">
                        <img src="${song.thumbnail}" alt="${song.title}">
                        <button class="favorite-btn ${isFavorite(song) ? 'active' : ''}" 
                            onclick="toggleFavorite(event, '${song.videoId}', '${encodeURIComponent(song.title)}', '${encodeURIComponent(song.artist)}', '${song.thumbnail}')">
                            <span class="material-icons">${isFavorite(song) ? 'favorite' : 'favorite_border'}</span>
                        </button>
                    </div>
                    <div class="queue-info">
                        <div class="queue-title">${song.title}</div>
                        <div class="queue-artist">${song.artist}</div>
                    </div>
                </div>
            `;
        });
    }
    queueList.innerHTML = queueHtml;

    // Update mobile queue if panel is active
    const mobileQueuePanel = document.querySelector('.mobile-queue-panel');
    if (mobileQueuePanel.classList.contains('active')) {
        updateMobileQueue();
    }
}

// Add new function to play from queue/favorites
function playQueueItem(videoId, encodedTitle, encodedArtist, thumbnail) {
    const title = decodeURIComponent(encodedTitle);
    const artist = decodeURIComponent(encodedArtist);
    // Add this: Check if the song is from favorites
    const isFromFavorites = favorites.some(f => f.videoId === videoId);
    
    if (isFromFavorites) {
        // If playing from favorites, update the current index in favorites
        currentIndex = favorites.findIndex(f => f.videoId === videoId);
    } else {
        // If playing from search results, update the current index in playlist
        currentIndex = playlist.findIndex(song => song.videoId === videoId);
    }
    
    playSong(videoId, title, artist, thumbnail);
}

// Update removeFromFavorites function to refresh all favorite buttons
function removeFromFavorites(event, index) {
    event.stopPropagation(); // Prevent playing the song when removing
    const removedSong = favorites[index];
    favorites.splice(index, 1);
    
    // Update all favorite buttons for this song
    if (removedSong) {
        const allFavoriteButtons = document.querySelectorAll(`button[onclick*="${removedSong.videoId}"]`);
        allFavoriteButtons.forEach(btn => {
            btn.classList.remove('active');
            btn.querySelector('.material-icons').textContent = 'favorite_border';
        });
    }
    
    updateQueue();
}

// Replace the toggleFavorite function
async function toggleFavorite(event, videoId, encodedTitle, encodedArtist, thumbnail) {
    event.stopPropagation();
    const title = decodeURIComponent(encodedTitle);
    const artist = decodeURIComponent(encodedArtist);
    const song = { videoId, title, artist, thumbnail };
    
    try {
        const index = favorites.findIndex(f => f.videoId === videoId);
        if (index === -1) {
            await addFavorite(song);
            favorites.push(song);
        } else {
            await removeFavorite(videoId);
            favorites.splice(index, 1);
        }
        
        // Update all favorite buttons for this song
        const allFavoriteButtons = document.querySelectorAll(`button[onclick*="${videoId}"]`);
        allFavoriteButtons.forEach(btn => {
            btn.classList.toggle('active');
            btn.querySelector('.material-icons').textContent = 
                index === -1 ? 'favorite' : 'favorite_border';
        });
        
        updateQueue();
    } catch (error) {
        console.error('Error updating favorite:', error);
    }
}

function isFavorite(song) {
    return favorites.some(f => f.videoId === song.videoId);
}

// Add these new drag and drop handler functions
let draggedItem = null;

function handleDragStart(event) {
    const item = event.target.closest('.queue-item');
    if (!item) return;
    
    draggedItem = item;
    event.target.classList.add('dragging');
    event.dataTransfer.setData('text/plain', event.target.dataset.index);
    event.dataTransfer.setData('source', shouldShowFavorites() ? 'favorites' : 'queue');
}

function handleDragOver(event) {
    event.preventDefault();
    const item = event.target.closest('.queue-item');
    if (item && item !== draggedItem) {
        item.classList.add('drag-over');
    }
}

function handleDragLeave(event) {
    const item = event.target.closest('.queue-item');
    if (item) {
        item.classList.remove('drag-over');
    }
}

function handleDrop(event) {
    event.preventDefault();
    const dropTarget = event.target.closest('.queue-item');
    
    if (dropTarget && draggedItem) {
        const fromIndex = parseInt(draggedItem.dataset.index);
        const toIndex = parseInt(dropTarget.dataset.index);
        
        if (fromIndex !== toIndex) {
            if (shouldShowFavorites()) {
                // Reorder favorites
                const [movedItem] = favorites.splice(fromIndex, 1);
                favorites.splice(toIndex, 0, movedItem);
            } else {
                // Reorder queue
                const [movedItem] = playlist.splice(fromIndex, 1);
                playlist.splice(toIndex, 0, movedItem);
            }
            updateQueue();
        }
    }
    
    // Clean up
    if (dropTarget) dropTarget.classList.remove('drag-over');
    if (draggedItem) draggedItem.classList.remove('dragging');
    draggedItem = null;
}

function removeFromQueue(index) {
    if (index > currentIndex) {
        playlist.splice(index, 1);
        updateQueue();
    }
}

function shouldShowFavorites() {
    return favorites.length > 0;
}

// Expose functions to global scope
window.search = search;
window.searchFromHero = searchFromHero;
window.playSong = playSong;
window.toggleFavorite = toggleFavorite;
window.togglePlay = togglePlay;
window.playNext = playNext;
window.playPrevious = playPrevious;
window.toggleShuffle = toggleShuffle;
window.toggleRepeat = toggleRepeat;
window.toggleMute = toggleMute;
window.expandPlayer = expandPlayer;
window.minimizePlayer = minimizePlayer;
window.playQueueItem = playQueueItem;
window.handleDragStart = handleDragStart;
window.handleDragOver = handleDragOver;
window.handleDragLeave = handleDragLeave;
window.handleDrop = handleDrop;

// Add this function to initialize event listeners
function initializeEventListeners() {
    // Search functionality
    const heroInput = document.getElementById('heroSearchInput');
    const searchInput = document.getElementById('searchInput');

    // Handle keyboard events for hero search
    heroInput.addEventListener('keydown', e => {
        if(e.key === 'Enter' || e.keyCode === 13) {
            e.preventDefault();
            searchFromHero();
        }
    });

    // Handle form submission for hero search (mobile)
    heroInput.addEventListener('search', e => {
        e.preventDefault();
        searchFromHero();
    });

    // Handle keyboard events for main search
    searchInput.addEventListener('keydown', e => {
        if(e.key === 'Enter' || e.keyCode === 13) {
            e.preventDefault();
            search();
        }
    });

    // Handle form submission for main search (mobile)
    searchInput.addEventListener('search', e => {
        e.preventDefault();
        search();
    });

    // Player controls
    document.getElementById('shuffleBtn').addEventListener('click', toggleShuffle);
    document.getElementById('prevBtn').addEventListener('click', playPrevious);
    document.getElementById('playPauseBtn').addEventListener('click', togglePlay);
    document.getElementById('nextBtn').addEventListener('click', playNext);
    document.getElementById('repeatBtn').addEventListener('click', toggleRepeat);
    document.getElementById('volumeIcon').addEventListener('click', toggleMute);

    // Mobile controls
    document.getElementById('mobileShuffleBtn').addEventListener('click', toggleShuffle);
    document.getElementById('mobilePrevBtn').addEventListener('click', playPrevious);
    document.getElementById('mobilePlayPauseBtn').addEventListener('click', togglePlay);
    document.getElementById('mobileNextBtn').addEventListener('click', playNext);
    document.getElementById('mobileRepeatBtn').addEventListener('click', toggleRepeat);
}

// Update document ready handler
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initializeFavorites();
        initializeProgressBar();
        initializeEventListeners(); // Add this line
        // Add swipe down to minimize
        let touchStartY = 0;
        const playerControls = document.querySelector('.player-controls');
        
        playerControls.addEventListener('touchstart', (e) => {
            touchStartY = e.touches[0].clientY;
        });
        
        playerControls.addEventListener('touchmove', (e) => {
            if (!playerControls.classList.contains('expanded')) return;
            
            const touchDiff = e.touches[0].clientY - touchStartY;
            if (touchDiff > 50) { // Threshold for minimize gesture
                minimizePlayer();
            }
        });

        // Add drop zone for the queue list container
        const queueList = document.getElementById('queueList');
        queueList.addEventListener('dragover', (e) => {
            e.preventDefault();
        });

        // Initialize volume bar progress
        const volumeBar = document.getElementById('volumeBar');
        volumeBar.style.setProperty('--volume', `${volumeBar.value}%`);
    } catch (error) {
        console.error('Error initializing app:', error);
    }
});

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    seconds = Math.floor(seconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Add functions to handle the mobile queue
function toggleMobileQueue(event) {
    if (event) event.stopPropagation();
    const queuePanel = document.querySelector('.mobile-queue-panel');
    queuePanel.classList.toggle('active');
    
    if (queuePanel.classList.contains('active')) {
        updateMobileQueue();
    }
}

function updateMobileQueue() {
    const mobileNowPlayingQueue = document.getElementById('mobileNowPlayingQueue');
    if (currentIndex !== -1 && playlist[currentIndex]) {
        const current = playlist[currentIndex];
        mobileNowPlayingQueue.innerHTML = `
            <div class="thumbnail-container">
                <img src="${current.thumbnail}" alt="${current.title}">
            </div>
            <div class="info">
                <div class="title">${current.title}</div>
                <div class="artist">${current.artist}</div>
            </div>
            <button class="favorite-btn ${isFavorite(current) ? 'active' : ''}" 
                onclick="toggleFavorite(event, '${current.videoId}', '${encodeURIComponent(current.title)}', '${encodeURIComponent(current.artist)}', '${current.thumbnail}')">
                <span class="material-icons">${isFavorite(current) ? 'favorite' : 'favorite_border'}</span>
            </button>
        `;
        mobileNowPlayingQueue.classList.add('queue-item', 'current');
    }

    // Update Queue List
    const mobileQueueList = document.getElementById('mobileQueueList');
    const displayList = shouldShowFavorites() ? favorites : playlist.slice(currentIndex + 1);
    
    if (displayList.length === 0) {
        mobileQueueList.innerHTML = '<div class="empty-message">No songs in ' + 
            (shouldShowFavorites() ? 'favorites' : 'queue') + '</div>';
    } else {
        mobileQueueList.innerHTML = displayList.map((song, index) => `
            <div class="queue-item" 
                onclick="playQueueItem('${song.videoId}', '${encodeURIComponent(song.title)}', '${encodeURIComponent(song.artist)}', '${song.thumbnail}')">
                <div class="thumbnail-container">
                    <img src="${song.thumbnail}" alt="${song.title}">
                </div>
                <div class="queue-info">
                    <div class="queue-title">${song.title}</div>
                    <div class="queue-artist">${song.artist}</div>
                </div>
                <button class="favorite-btn ${isFavorite(song) ? 'active' : ''}" 
                    onclick="toggleFavorite(event, '${song.videoId}', '${encodeURIComponent(song.title)}', '${encodeURIComponent(song.artist)}', '${song.thumbnail}')">
                    <span class="material-icons">${isFavorite(song) ? 'favorite' : 'favorite_border'}</span>
                </button>
            </div>
        `).join('');
    }
}

// Add to the global scope
window.toggleMobileQueue = toggleMobileQueue;

// Add click outside handler for mobile queue
document.addEventListener('click', (event) => {
    const queuePanel = document.querySelector('.mobile-queue-panel');
    if (queuePanel.classList.contains('active') && 
        !event.target.closest('.mobile-queue-panel') && 
        !event.target.closest('.queue-toggle-button')) {
        queuePanel.classList.remove('active');
    }
});
