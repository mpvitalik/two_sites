# BackstopJS Visual Diff Studio

Visual regression testing suite using BackstopJS and Playwright.

## Setup

```bash
npm install
npx playwright install chromium
```

## Running Web Interface

```bash
npm start
```
Open `http://localhost:3030` in your browser.

## Running CLI Commands

```bash
# Generate reference images
npm run reference

# Run visual diff test
npm run test

# Open report
npm run open-report
```
