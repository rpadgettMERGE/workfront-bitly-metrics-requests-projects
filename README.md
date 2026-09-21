# Workfront UI Extension: Bitly Analytics

An Adobe App Builder custom UI extension (UIX) that embeds real-time Bitly Shortlink and QR Code analytics directly into Adobe Workfront Project and Issue tabs. This application extracts Bitly asset IDs from Workfront custom fields and fetches deep engagement metrics and metadata from the Bitly v4 API.

## Features

* **Context-Aware Rendering:** Uses `@adobe/uix-guest` to dynamically pull the Workfront `objID`, `objCode`, and `imsToken` from the active user session.
* **Unified Engagement Dashboard:** Renders interactive Line and Bar charts via `recharts` to track Shortlink clicks and QR Code scans over time.
* **Granular Analytics:** Aggregates scan and click data by Country, City, Referrer, Browser, and Operating System. Safely processes Bitly's long-tail `other_metrics` to ensure 100% data accuracy.
* **Rich Asset Details:** Fetches and displays specific Bitly asset metadata, including Creation Date, Destination URL (hyperlinked), Title, Tags, and dynamically renders the Base64 PNG image of the tracked QR Code.
* **Smart Conditional UI:** Automatically evaluates the presence of Shortlink IDs vs. QR Code IDs and only mounts the relevant React components.

## Prerequisites

1. **Adobe I/O CLI (`aio`)** installed and authenticated.
2. A valid **Bitly API Access Token**.
3. **Workfront Custom Fields** attached to the target Projects/Issues. The backend recognizes the following keys:
   * `DE:Bitly Shortlink ID` (or `Bitly Shortlink ID`)
   * `DE:Bitly QR Code ID` (or `Bitly QR Code ID`)

## Architecture

* **Frontend (`web-src/src/components/App.js`):** A React SPA utilizing Recharts for data visualization. Evaluates payloads to render KPIs, asset details, and time-series charts.
* **Backend (`actions/generic/index.js`):** An Adobe I/O Runtime serverless action. Extracts Workfront custom parameters, calls Bitly endpoints (`/v4/bitlinks/{id}`, `/v4/qr-codes/{id}`, and `/v4/qr-codes/{id}/image`), and chunks API requests to manage concurrency.

## Deployment

To deploy this application to your Adobe I/O Runtime environment, ensure your `.env` file is populated with your `BITLY_TOKEN` and run the following command to purge the local Parcel cache and push the build:

```bash
rm -rf dist .parcel-cache && aio app deploy
