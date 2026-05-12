# Automatic School Bell System MVP

A local web-based MVP for demonstrating timetable-based school bell control before connecting to a real PA system.

The system is branded for Childrens International School Lekki and is intended to look credible enough for school IT/admin and management review while still staying safely in demo mode.

## What This MVP Proves

- Timetable management for school bell periods
- Automatic bell triggering from the active schedule
- Manual bell override from the dashboard
- Pause, resume, and emergency stop controls
- Event logs for manual, automatic, and system actions
- Local settings and schedule storage using browser `localStorage`
- Local HTML5 Audio playback from this computer only

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Browser `localStorage` mocked storage
- HTML5 Audio for local bell playback
- No authentication
- No external services
- No real PA system integration yet

## First-Time Setup

Install Node.js first if it is not already on the computer. Use the LTS version from the official Node.js website.

Then clone and start the project:

```bash
git clone https://github.com/sxmuel-py/alarm-sys.git
cd alarm-sys
npm install
npm run dev
```

Open the local URL printed by Next.js, usually:

```text
http://localhost:3000
```

If port `3000` is busy, Next.js may use another port such as `3001`.

## Running It Again Later

After the first setup, you do not need to run `npm install` every time.

To rerun the project:

```bash
cd alarm-sys
npm run dev
```

Run `npm install` again only when:

- `node_modules` was deleted
- `package.json` or `package-lock.json` changed after pulling updates
- the app complains that a package is missing

## Updating an Existing Clone

If the project is already cloned on a Windows 10 desktop, open Command Prompt or PowerShell inside the project folder and run:

```bash
git pull
npm run dev
```

If dependencies changed, run this once before starting the app:

```bash
npm install
```

## Custom Bell Sound

The app first tries to play this file:

```text
public/sounds/bell.mp3
```

On Windows, create the folder if it does not exist:

```bash
mkdir public\sounds
```

Then place the audio file here:

```text
public\sounds\bell.mp3
```

Restart `npm run dev` after adding or replacing the file. If the MP3 is missing or cannot play, the app falls back to a generated browser bell tone.

## Bell Duration and Volume

Bell duration and volume are controlled from the Settings page.

- Volume controls the playback level for local browser audio.
- Bell duration controls how long the bell is allowed to play, from 1 to 60 seconds.
- Emergency Stop immediately stops any current bell audio and disables automatic triggers.
- Manual Ring Bell still works during Emergency Stop only after a confirmation prompt.

Settings are saved in the browser using `localStorage`, so they stay on the same computer and browser after refresh.

## Demo Mode and PA Notes

This MVP plays audio from the local computer only. It does not connect directly to the school PA system yet.

For a real deployment, the dedicated PC audio output would need to connect to the existing PA mixer or amplifier input. Before doing that, the existing PA system must be inspected, building zones must be confirmed, microphone override behavior must be understood, and the first test should be limited to one building or one audio zone.

## Troubleshooting

If the bell does not play:

- Click anywhere on the page once, then try again. Some browsers block audio until the user interacts with the page.
- Confirm the MP3 is named exactly `bell.mp3`.
- Confirm it is inside `public/sounds`.
- Restart `npm run dev` after replacing the audio file.
- Check that the computer volume and browser tab volume are not muted.

If the app starts on a different port, use the URL shown in the terminal.

If settings look wrong, they may be coming from browser `localStorage`. Use the Reset Demo Data control in the app to return to default demo data.
