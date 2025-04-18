export default {
  
  async fetch(request, env) {
    // Define allowed origins
    const allowedOrigins = [
      'https://grangefixtures.pages.dev',
      'https://ardmhacha24.github.io/',
      'http://localhost:3000' // For local development
    ];
    
    // Get the request origin
    const origin = request.headers.get('Origin');
    const corsHeaders = {
      'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    };

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
      const events = await fetchCalendarEvents(env.CALENDAR_ID, token);
      return new Response(JSON.stringify(events), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
          // Add cache control if desired
          'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
        },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
  },
};

async function getAccessToken(clientEmail, privateKey) {
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
      maxResults: '1000',
      orderBy: 'startTime',
      singleEvents: 'true',
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
  
  return {
    items: data.items.map(event => {
      // For debugging
      console.log('Processing event:', {
        summary: event.summary,
        start: event.start.dateTime,
        end: event.end.dateTime
      });

      // Simply extract the hour and minute from the ISO string
      // The time in the ISO string is already in the correct timezone (+01:00)
      const getTimeFromDateTime = (dateTimeStr) => {
        if (!dateTimeStr) return 'All Day';
        // Example: 2025-04-18T18:00:00+01:00 -> extract 18:00
        const match = dateTimeStr.match(/T(\d{2}):(\d{2})/);
        return match ? `${match[1]}:${match[2]}` : 'All Day';
      };

      // Determine location based on summary
      let location = "Training Pitch"; // Default location
      if (event.summary) {
        const summary = event.summary.toLowerCase(); // Convert to lowercase for case-insensitive matching
        if (summary.includes("main pitch")) {
          location = "Main Pitch";
        } else if (summary.includes("maghery")) {
          location = "Maghery";
        } else if (summary.includes("training pitch")) {
          location = "Training Pitch";
        }
      }

      return {
        id: event.id,
        summary: event.summary,
        location: location,
        description: event.description,
        start: {
          dateTime: event.start.dateTime,
          date: event.start.date,
          formattedTime: getTimeFromDateTime(event.start.dateTime)
        },
        end: {
          dateTime: event.end.dateTime,
          date: event.end.date,
          formattedTime: getTimeFromDateTime(event.end.dateTime)
        }
      };
    })
  };
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