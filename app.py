from flask import Flask, jsonify
from flask_cors import CORS
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
import json
import os.path
import datetime

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

SCOPES = ['https://www.googleapis.com/auth/calendar.readonly']
CALENDAR_ID = '93e86f000690d251948613ab5ddebf7af6199f80d71ecda06e3f0c4c7d5fb290@group.calendar.google.com'

def get_calendar_service():
    creds = None
    if os.path.exists('credentials.json'):
        creds = Credentials.from_authorized_user_file('credentials.json', SCOPES)
    
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file('credentials.json', SCOPES)
            creds = flow.run_local_server(port=0)
        
        with open('credentials.json', 'w') as token:
            token.write(creds.to_json())

    return build('calendar', 'v3', credentials=creds)

@app.route('/api/training-events')
def get_training_events():
    try:
        service = get_calendar_service()
        events_result = service.events().list(
            calendarId=CALENDAR_ID,
            timeMin=datetime.datetime.utcnow().isoformat() + 'Z',
            maxResults=100,
            singleEvents=True,
            orderBy='startTime'
        ).execute()
        
        events = events_result.get('items', [])
        return jsonify(events)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True) 