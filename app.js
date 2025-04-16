// Match data utilities
function parseDate(dateStr) {
    const [day, month, year] = dateStr.split('/');
    return new Date(year, month - 1, day);
}

function formatDate(dateStr) {
    const date = parseDate(dateStr);
    return date.toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
}

function groupMatchesByDate(matches) {
    return matches.reduce((groups, match) => {
        const date = match.Date;
        if (!groups[date]) {
            groups[date] = [];
        }
        groups[date].push(match);
        return groups;
    }, {});
}

// Filter utilities
function filterMatches() {
    const searchTerm = document.querySelector('.search-input').value.toLowerCase();
    const teamFilter = document.getElementById('teamFilter').value;
    const competitionFilter = document.getElementById('competitionFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;
    const dateRange = document.getElementById('dateRange').value;

    return matches.filter(match => {
        // Search filter
        const matchText = `${match['Home Team']} ${match['Away Team']} ${match.Competition} ${match.Venue}`.toLowerCase();
        if (!matchText.includes(searchTerm)) return false;

        // Team filter
        if (teamFilter !== 'all' && 
            match['Home Team'] !== teamFilter && 
            match['Away Team'] !== teamFilter) return false;

        // Competition filter
        if (competitionFilter !== 'all' && 
            match.Competition !== competitionFilter) return false;

        // Status filter
        const isResult = match['Home Score'] !== '' && match['Away Score'] !== '';
        if (statusFilter === 'fixture' && isResult) return false;
        if (statusFilter === 'result' && !isResult) return false;

        // Date range filter
        if (dateRange) {
            const [startStr, endStr] = dateRange.split(' to ');
            if (startStr && endStr) {
                const matchDate = parseDate(match.Date);
                const startDate = new Date(startStr);
                const endDate = new Date(endStr);
                if (matchDate < startDate || matchDate > endDate) return false;
            }
        }

        return true;
    });
}

function populateFilters() {
    // Get unique teams
    const teams = new Set();
    matches.forEach(match => {
        teams.add(match['Home Team']);
        teams.add(match['Away Team']);
    });

    // Get unique competitions
    const competitions = new Set(matches.map(match => match.Competition));

    // Populate team filter
    const teamFilter = document.getElementById('teamFilter');
    teams.forEach(team => {
        const option = document.createElement('option');
        option.value = team;
        option.textContent = team;
        teamFilter.appendChild(option);
    });

    // Populate competition filter
    const competitionFilter = document.getElementById('competitionFilter');
    competitions.forEach(competition => {
        const option = document.createElement('option');
        option.value = competition;
        option.textContent = competition;
        competitionFilter.appendChild(option);
    });
}

function updateStats(filteredMatches) {
    // Update total matches
    document.getElementById('totalMatches').textContent = filteredMatches.length;

    // Update upcoming matches
    const upcoming = filteredMatches.filter(match => 
        match['Home Score'] === '' && match['Away Score'] === ''
    ).length;
    document.getElementById('upcomingMatches').textContent = upcoming;

    // Update win/loss count
    const wins = filteredMatches.filter(match => match.Result === 'WIN').length;
    const losses = filteredMatches.filter(match => match.Result === 'LOSS').length;
    document.getElementById('winCount').textContent = wins;
    document.getElementById('lossCount').textContent = losses;
}

// User preferences
const userPreferences = {
    get: (key, defaultValue) => {
        const value = localStorage.getItem(key);
        return value !== null ? JSON.parse(value) : defaultValue;
    },
    set: (key, value) => {
        localStorage.setItem(key, JSON.stringify(value));
    }
};

// Event listeners
document.querySelector('.search-input').addEventListener('input', displayMatches);
document.getElementById('teamFilter').addEventListener('change', displayMatches);
document.getElementById('competitionFilter').addEventListener('change', displayMatches);
document.getElementById('statusFilter').addEventListener('change', displayMatches);

// Load match data
async function loadMatchData() {
    try {
        const response = await fetch('matches.csv');
        const csvText = await response.text();
        
        // Parse CSV
        const lines = csvText.split('\n');
        const headers = lines[0].split(',');
        
        matches = lines.slice(1).map(line => {
            const values = line.split(',');
            return headers.reduce((obj, header, index) => {
                obj[header.trim()] = values[index]?.trim() || '';
                return obj;
            }, {});
        });

        // Initialize the app
        populateFilters();
        displayMatches();
    } catch (error) {
        console.error('Error loading match data:', error);
        document.getElementById('matchContainer').innerHTML = `
            <div style="text-align: center; padding: var(--spacing-xl);">
                <i class="fas fa-exclamation-circle" style="font-size: 2rem; color: var(--danger); margin-bottom: var(--spacing-md);"></i>
                <p>Error loading match data</p>
                <p style="color: var(--text-light);">Please try again later</p>
            </div>
        `;
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    loadMatchData();
});

function displayMatches() {
    const filteredMatches = filterMatches();
    const groupedMatches = groupMatchesByDate(filteredMatches);
    const matchContainer = document.getElementById('matchContainer');
    
    // Update stats
    updateStats(filteredMatches);

    // Clear container
    matchContainer.innerHTML = '';

    if (filteredMatches.length === 0) {
        matchContainer.innerHTML = `
            <div style="text-align: center; padding: var(--spacing-xl);">
                <i class="fas fa-search" style="font-size: 2rem; color: var(--text-light); margin-bottom: var(--spacing-md);"></i>
                <p>No matches found</p>
                <p style="color: var(--text-light);">Try adjusting your filters</p>
            </div>
        `;
        return;
    }

    // Sort dates
    const sortedDates = Object.keys(groupedMatches).sort((a, b) => parseDate(a) - parseDate(b));

    sortedDates.forEach(date => {
        const matches = groupedMatches[date];
        const formattedDate = formatDate(date);
        
        const dateSection = document.createElement('section');
        dateSection.className = 'date-section';
        dateSection.innerHTML = `
            <h2 class="date-header">${formattedDate}</h2>
            <div class="match-list">
                ${matches.map(match => `
                    <div class="match-card ${match['Home Score'] !== '' ? 'is-result' : ''}">
                        <div class="match-header">
                            <span class="competition-tag">${match.Competition}</span>
                            <span class="venue">${match.Venue}</span>
                        </div>
                        <div class="match-teams">
                            <div class="team home-team">
                                <span class="team-name">${match['Home Team']}</span>
                                ${match['Home Score'] !== '' ? `<span class="score">${match['Home Score']}</span>` : ''}
                            </div>
                            <div class="team away-team">
                                <span class="team-name">${match['Away Team']}</span>
                                ${match['Away Score'] !== '' ? `<span class="score">${match['Away Score']}</span>` : ''}
                            </div>
                        </div>
                        ${match.Time ? `
                            <div class="match-footer">
                                <span class="time">
                                    <i class="far fa-clock"></i> ${match.Time}
                                </span>
                            </div>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        `;
        
        matchContainer.appendChild(dateSection);
    });
} 