# Automatic School Bell System MVP

Local web MVP for demonstrating timetable-based school bell control before a real PA integration.

## Run Locally

```bash
npm install
npm run dev
```

Open the local URL printed by Next.js. If port `3000` is busy, Next.js will choose the next available port.

## MVP Scope

- Timetable management
- Automatic bell triggering from the active schedule
- Manual bell override
- Pause and resume schedule control
- Event logs for manual, automatic, and system actions
- Browser JSON mocked storage through `localStorage`
- Local HTML5 Audio playback with generated WAV bell tones

## Notes

This demo does not include authentication, external services, or production PA integration.
