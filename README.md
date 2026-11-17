# CodeArcade

A personal gallery of small web projects you can play in the browser.

## Folder layout

```
CodeArcade/
├── projects/              <- all your web projects go here
│   ├── projects.json      <- list of projects shown on the homepage
│   ├── BottleFlip/        <- one folder per project, named after it
│   │   ├── index.html
│   │   └── thumb.svg
│   └── DodgeTheDots/
│       ├── index.html
│       └── thumb.svg
└── src/                   <- the CodeArcade homepage (React)
```

## Run locally

```
npm install
npm run dev
```

## Add a project

1. Create `projects/<ProjectName>/` and put the project's code inside, with an `index.html`
   as the entry point. Reference its own JS/CSS/images with **relative** paths
   (e.g. `src="game.js"`, not `src="/game.js"`).
2. Add a thumbnail image in that folder (e.g. `thumb.png`).
3. Add an entry to `projects/projects.json`:

```json
{
  "id": "project-name",
  "title": "Project Name",
  "description": "One line about it.",
  "folder": "ProjectName",
  "thumbnail": "thumb.png",
  "tags": ["game"]
}
```

## Deploy (Firebase Hosting)

One-time setup: `firebase login`, then `firebase use --add` to pick or create your Firebase project.

After that, deploy with:

```
npm run deploy
```
