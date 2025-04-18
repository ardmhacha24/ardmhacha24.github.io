// Cloudflare Worker for Google Calendar API
const CALENDAR_ID = '93e86f000690d251948613ab5ddebf7af6199f80d71ecda06e3f0c4c7d5fb290@group.calendar.google.com';

async function getGoogleAccessToken() {
  // You'll need to set these in your Cloudflare Worker's environment variables
  const clientId = GOOGLE_CLIENT_ID;
  const clientSecret = GOOGLE_CLIENT_SECRET;
  const refreshToken = GOOGLE_REFRESH_TOKEN;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const data = await response.json();
  return data.access_token;
}

async function fetchCalendarEvents(calendarId, accessToken) {
  // Get current date for timeMin
  const timeMin = new Date().toISOString();
  
  // Set timeMax to 30 days from now (or adjust as needed)
  const timeMax = new Date();
  timeMax.setDate(timeMax.getDate() + 210);
  
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?` + 
    new URLSearchParams({
      timeMin: timeMin,
      timeMax: timeMax.toISOString(),
      maxResults: 1000,
      orderBy: 'startTime',
      singleEvents: true,
      fields: 'items(id,summary,location,start,end,description)' // Explicitly request the fields we need
    });

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(`Failed to fetch events: ${errorData.error?.message || res.statusText}`);
  }

  const data = await res.json();
  
  // Format the response to include both start and end times
  return {
    items: data.items.map(event => {
      // Parse dates with timezone consideration
      const startDateTime = event.start.dateTime ? new Date(event.start.dateTime) : null;
      const endDateTime = event.end.dateTime ? new Date(event.end.dateTime) : null;

      return {
        id: event.id,
        summary: event.summary,
        location: event.location,
        description: event.description,
        start: {
          dateTime: event.start.dateTime,
          date: event.start.date,
          // We'll let the client handle the time formatting since it has better timezone context
          formattedTime: startDateTime ? 
            startDateTime.toLocaleTimeString('en-GB', {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'Europe/London'
            }) : 'All Day'
        },
        end: {
          dateTime: event.end.dateTime,
          date: event.end.date,
          formattedTime: endDateTime ? 
            endDateTime.toLocaleTimeString('en-GB', {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'Europe/London'
            }) : 'All Day'
        }
      };
    })
  };
}

async function handleRequest(request) {
  // Handle CORS preflight requests
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  // Only allow GET requests
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const accessToken = await getGoogleAccessToken();
    const calendarData = await fetchCalendarEvents(CALENDAR_ID, accessToken);
    
    return new Response(JSON.stringify(calendarData), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
}); 