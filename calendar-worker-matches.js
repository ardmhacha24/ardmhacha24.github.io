// Define allowed origins for CORS - defined once at the top level
const ALLOWED_ORIGINS = [
      'https://grangefixtures.pages.dev',
      'https://ardmhacha24.github.io/',
      'http://localhost:3000' // For local development
    ];
    
// Default values for season date range
const DEFAULT_START_MONTH = 3; // March
const DEFAULT_START_DAY = 1;
const DEFAULT_END_MONTH = 11; // November
const DEFAULT_END_DAY = 1;

// Helper function to get CORS headers
function getCorsHeaders(request) {
  const origin = request?.headers?.get('Origin');
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json'
  };
}

export default {
  async fetch(request, env) {
    // Get CORS headers
    const corsHeaders = getCorsHeaders(request);

    // Handle OPTIONS request (preflight)
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders
      });
    }

    // Only allow GET requests
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const token = await getAccessToken(env.CLIENT_EMAIL, env.PRIVATE_KEY);
      const response = await fetchCalendarEvents(env.CALENDAR_ID, token, env, request);
      
      // Return the response directly since fetchCalendarEvents already returns a Response object
      return response;
    } catch (err) {
      console.error('Error in main handler:', err);
      return new Response(JSON.stringify({ 
        success: false,
        error: err.message,
        details: err.stack
      }), {
        status: 500,
        headers: corsHeaders
      });
    }
  },
};

async function getAccessToken(clientEmail, privateKey) {
  try {
  const now = Math.floor(Date.now() / 1000);
  const jwtHeader = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const jwtClaimSet = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const jwt = await createJWT(jwtHeader, jwtClaimSet, privateKey);
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error('Failed to get access token');
  return tokenData.access_token;
  } catch (error) {
    console.error('Error getting access token:', error);
    throw new Error(`Failed to get access token: ${error.message}`);
  }
}

async function fetchCalendarEvents(calendarId, accessToken, env, request) {
  try {
    // Safely get environment variables with fallbacks
    let seasonStartMonth, seasonStartDay, seasonEndMonth, seasonEndDay;
    
    try {
      // Check if env exists and has the properties
      if (env && typeof env === 'object') {
        seasonStartMonth = parseInt(env.SEASON_START_MONTH || DEFAULT_START_MONTH, 10) - 1;
        seasonStartDay = parseInt(env.SEASON_START_DAY || DEFAULT_START_DAY, 10);
        seasonEndMonth = parseInt(env.SEASON_END_MONTH || DEFAULT_END_MONTH, 10) - 1;
        seasonEndDay = parseInt(env.SEASON_END_DAY || DEFAULT_END_DAY, 10);
      } else {
        // Use defaults if env is not available
        console.warn('Environment variables not available, using default values');
        seasonStartMonth = DEFAULT_START_MONTH - 1;
        seasonStartDay = DEFAULT_START_DAY;
        seasonEndMonth = DEFAULT_END_MONTH - 1;
        seasonEndDay = DEFAULT_END_DAY;
      }
    } catch (envError) {
      // Handle any errors in accessing env variables
      console.error('Error accessing environment variables:', envError);
      seasonStartMonth = DEFAULT_START_MONTH - 1;
      seasonStartDay = DEFAULT_START_DAY;
      seasonEndMonth = DEFAULT_END_MONTH - 1;
      seasonEndDay = DEFAULT_END_DAY;
    }
    
    // Get current year
    const currentYear = new Date().getFullYear();
    
    // Create date objects
    const startDate = new Date(currentYear, seasonStartMonth, seasonStartDay);
    const endDate = new Date(currentYear, seasonEndMonth, seasonEndDay);
    
    // If we're past the end date, use next year's dates
    if (new Date() > endDate) {
      startDate.setFullYear(currentYear + 1);
      endDate.setFullYear(currentYear + 1);
    }
    
    console.log(`Using GAA season date range: ${seasonStartMonth + 1}/${seasonStartDay} to ${seasonEndMonth + 1}/${seasonEndDay}`);
    console.log(`Fetching events from ${startDate.toISOString()} to ${endDate.toISOString()}`);
    
    // Fix: Use proper authorization header instead of key parameter
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${encodeURIComponent(
      startDate.toISOString()
    )}&timeMax=${encodeURIComponent(
      endDate.toISOString()
    )}&maxResults=1000&fields=items(id,summary,description,start,end,location)&singleEvents=true&orderBy=startTime`;
    
    console.log(`Request URL: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error Response:', errorText);
      throw new Error(`HTTP error! status: ${response.status}, details: ${errorText}`);
    }

    const data = await response.json();
    console.log(`Total events fetched: ${data.items ? data.items.length : 0}`);
    
    // Log the first few events to help with debugging
    if (data.items && data.items.length > 0) {
      console.log('Sample events:');
      data.items.slice(0, 3).forEach((event, index) => {
        console.log(`Event ${index + 1}:`, {
          id: event.id,
        summary: event.summary,
          start: event.start,
          end: event.end
        });
      });
    }

    if (!data.items || !Array.isArray(data.items)) {
      throw new Error('Invalid response format: items array not found');
    }

    // Improved match filtering logic
    const matchEvents = data.items
      .filter(event => {
        // Check if the event has a summary
        if (!event.summary) {
          console.log(`Event ${event.id} has no summary, skipping`);
          return false;
        }
        
        // Log the summary for debugging
        console.log(`Checking event: "${event.summary}"`);
        
        // Check if the summary contains "vs" or "v" which indicates a match
        const isMatch = event.summary.includes(' vs ') || 
                        event.summary.includes(' v ');
        
        if (!isMatch) {
          console.log(`Event "${event.summary}" is not a match, skipping`);
        } else {
          console.log(`Event "${event.summary}" is a match, including`);
        }
        return isMatch;
      })
      .map(event => {
        // Parse match details from summary
        // Expected format: "Team Name [HOME/AWAY] **RESULT** vs Opponent"
        // or "Team Name [HOME/AWAY] vs Opponent @ TIME"
        const summary = event.summary;
        console.log(`Processing match: "${summary}"`);
        
        // Extract team names and match details
        let homeTeam = '', awayTeam = '', where = '', result = '';
        
        // Check if it's a home or away match
        if (summary.includes('[HOME]')) {
          where = 'HOME';
        } else if (summary.includes('[AWAY]')) {
          where = 'AWAY';
        }
        
        // Check for result in summary (WIN, LOSS, DRAW)
        const resultMatch = summary.match(/\*([^*]+)\*/);
        if (resultMatch && resultMatch[1]) {
          result = resultMatch[1].trim();
          console.log(`Found result: "${result}"`);
        }
        
        // Extract team names
        // First, try to extract from the Teams field in the description
        const description = event.description || '';
        const teamsMatch = description.match(/Teams:\s*([^vs]+)\s*(?:vs|v)\s*([^\n]+)/i);
        
        if (teamsMatch && teamsMatch[1] && teamsMatch[2]) {
          homeTeam = teamsMatch[1].trim();
          awayTeam = teamsMatch[2].trim();
          console.log(`Extracted teams from description: Home: "${homeTeam}", Away: "${awayTeam}"`);
        } else {
          // If not found in description, try to extract from summary
          // Remove the result part if it exists (e.g., *WIN*, *LOSS*, *DRAW*)
          const cleanSummary = summary.replace(/\*[^*]+\*/, '').trim();
          
          // Split by "vs" or "v"
          const parts = cleanSummary.split(/\s+(?:vs|v)\s+/);
          
          if (parts.length >= 2) {
            // Extract team names from the parts
            // First part contains the team name and [HOME/AWAY]
            const firstPart = parts[0];
            const teamMatch = firstPart.match(/^([^(]+)\s*\[(?:HOME|AWAY)\]/);
            
            if (teamMatch && teamMatch[1]) {
              homeTeam = teamMatch[1].trim();
            } else {
              // If no match, just use the first part
              homeTeam = firstPart.replace(/\[(?:HOME|AWAY)\]/, '').trim();
            }
            
            // Second part contains the opponent
            awayTeam = parts[1].split('@')[0].trim();
            
            console.log(`Extracted teams from summary: Home: "${homeTeam}", Away: "${awayTeam}"`);
          }
        }
        
        // If we still don't have team names, try one more approach
        if (!homeTeam || !awayTeam) {
          // Look for "Grange" in the summary
          if (summary.includes('Grange')) {
            homeTeam = 'Grange';
            // Try to extract the other team name
            const otherTeamMatch = summary.match(/Grange\s+(?:vs|v)\s+([^@]+)/i);
            if (otherTeamMatch && otherTeamMatch[1]) {
              awayTeam = otherTeamMatch[1].trim();
            }
            console.log(`Extracted teams using Grange: Home: "${homeTeam}", Away: "${awayTeam}"`);
          }
        }

        // Parse fields from description
        // Expected format:
        // Competition: League Name
        // Sex: M/F
        // Round: Round Name
        // Team: Team Name
        // Where: Home/Away
        // Venue: Location Name
        // Referee: Referee Name
        // Fixture Src: Source
        // Fixture ID: ID
        
        // Helper function to extract field from description
        const extractField = (fieldName) => {
          const regex = new RegExp(`${fieldName}:\\s*([^\\n]*)`, 'i');
          const match = description.match(regex);
          return match ? match[1].trim() : '';
        };

        // Extract all fields
        const competition = extractField('Competition');
        const sex = extractField('Sex');
        const round = extractField('Round');
        const team = extractField('Team');
        const venue = extractField('Venue') || event.location || 'TBD';
        const referee = extractField('Referee');
        const fixtureSrc = extractField('Source') || 'Calendar'; // Extract Source field, default to 'Calendar' if not found
        
        // Extract scores if available
        let homeScore = '', awayScore = '';
        if (result) {
          // Look for scores in the description
          // The format in the data is:
          // Teams:
          // Grange Naomh Colmcille CLG [4-0]
          // Wolfe Tones [3-11]
          // or
          // Teams:
          // Na Piarsaigh Eanach Mor [0-10]
          // Grange Naomh Colmcille CLG [2-9]
          
          // First, find the Teams section
          const teamsSection = description.split('Teams:')[1];
          if (teamsSection) {
            console.log('Found Teams section in description');
            // Split by newlines to get each team line
            const teamLines = teamsSection.split('\n')
              .map(line => line.trim())
              .filter(line => line && line.includes('[') && line.includes(']'));
            
            console.log(`Found ${teamLines.length} team lines with scores:`, teamLines);
            
            if (teamLines.length >= 2) {
              // Extract scores from each line
              const scoreRegex = /\[([0-9]-[0-9]+|[0-9]+-[0-9]+)\]/;
              
              // First team line
              const firstTeamMatch = teamLines[0].match(scoreRegex);
              const secondTeamMatch = teamLines[1].match(scoreRegex);
              
              if (firstTeamMatch && firstTeamMatch[1] && secondTeamMatch && secondTeamMatch[1]) {
                const firstTeamScore = firstTeamMatch[1].trim();
                const secondTeamScore = secondTeamMatch[1].trim();
                
                console.log(`Extracted raw scores - First: "${firstTeamScore}", Second: "${secondTeamScore}"`);
                
                // Validate score format
                const isValidScore = (score) => /^\d+-\d+$/.test(score);
                
                if (isValidScore(firstTeamScore) && isValidScore(secondTeamScore)) {
                  // Determine which score belongs to which team
                  if (teamLines[0].toLowerCase().includes('grange')) {
                    homeScore = firstTeamScore;
                    awayScore = secondTeamScore;
                    console.log('First team is Grange (home)');
                  } else if (teamLines[1].toLowerCase().includes('grange')) {
                    awayScore = firstTeamScore;
                    homeScore = secondTeamScore;
                    console.log('Second team is Grange (home)');
                  } else {
                    // If Grange isn't mentioned, use the order in the description
                    homeScore = firstTeamScore;
                    awayScore = secondTeamScore;
                    console.log('No Grange found, using order from description');
                  }
                  
                  console.log(`Final scores - Home: "${homeScore}", Away: "${awayScore}"`);
                } else {
                  console.log(`Invalid score format detected - First: "${firstTeamScore}", Second: "${secondTeamScore}"`);
                }
              } else {
                console.log('Could not extract valid scores from team lines');
              }
            } else {
              console.log('Not enough team lines with scores found');
            }
          } else {
            console.log('No Teams section found in description');
          }
        }

        // Format times
        const startDateTime = new Date(event.start.dateTime);
        const endDateTime = new Date(event.end.dateTime);

        // Format date for CSV compatibility
        const date = startDateTime.toLocaleDateString('en-GB', {
          weekday: 'short',
          day: '2-digit',
          month: 'short',
          year: '2-digit'
        }).replace(/,/g, '');

        // Format time for CSV compatibility
        const time = startDateTime.toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: 'Europe/London'
        });

        // Extract fixture ID from description if available
        let fixtureId = '';
        if (description) {
          const fixtureIdMatch = description.match(/GFAS-Ref:\s*([^\n]+)/i);
          if (fixtureIdMatch && fixtureIdMatch[1]) {
            fixtureId = fixtureIdMatch[1].trim();
            console.log(`Extracted Fixture ID: "${fixtureId}"`);
          } else {
            console.log('No GFAS-Ref found in description');
          }
      }

      return {
        id: event.id,
          // CSV compatible fields
          Date: date,
          Competition: competition,
          Sex: sex,
          Round: round,
          Team: team,
          Where: where,
          Result: result,
          'Home Team': homeTeam,
          'Home Score': homeScore,
          'Away Team': awayTeam,
          'Away Score': awayScore,
          Venue: venue,
          Time: time,
          Referee: referee,
          'Fixture Src': fixtureSrc,
          'Fixture ID': fixtureId || `calendar-${event.id}`, // Use extracted ID or generate one
          'Calendar Sync': 'Yes',
          'Calendar Event ID': event.id,
          
          // Original calendar fields
        summary: event.summary,
          description: description,
        start: {
          dateTime: event.start.dateTime,
            timeZone: event.start.timeZone
        },
        end: {
          dateTime: event.end.dateTime,
            timeZone: event.end.timeZone
          },
          location: event.location || '',
          formattedTime: {
            start: time,
            end: endDateTime.toLocaleTimeString('en-GB', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
              timeZone: 'Europe/London'
            })
          }
        };
      });

    console.log(`Processed ${matchEvents.length} match events`);

    // Get CORS headers
    const corsHeaders = getCorsHeaders(request);
    
    // Add cache control
    corsHeaders['Cache-Control'] = 'public, max-age=300'; // Cache for 5 minutes

    return new Response(JSON.stringify({
      success: true,
      data: matchEvents
    }), {
      headers: corsHeaders
    });

  } catch (error) {
    console.error('Error fetching calendar events:', error);
    
    // Get CORS headers
    const corsHeaders = getCorsHeaders(request);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      details: error.stack
    }), {
      status: 500,
      headers: corsHeaders
    });
  }
}

async function createJWT(header, claimSet, privateKeyPEM) {
  const enc = new TextEncoder();
  const base64url = (str) =>
    btoa(JSON.stringify(str)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const encodedHeader = base64url(header);
  const encodedPayload = base64url(claimSet);
  const toSign = `${encodedHeader}.${encodedPayload}`;

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKeyPEM),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, enc.encode(toSign));
  const sigBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return `${toSign}.${sigBase64}`;
}

function pemToArrayBuffer(pem) {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '');
  const binary = atob(b64);
  const buf = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
  return buf;
} 