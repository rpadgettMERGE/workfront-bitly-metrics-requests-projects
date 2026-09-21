Workfront UIX Extension: Bitly Analytics (Project & Request Level)
This application is an Adobe Custom UI Extension (UIX) embedded directly into Workfront Projects and Requests. It automatically detects Bitly custom fields on the active record and fetches real-time engagement data for both Shortlinks and QR Codes via the Bitly v4 API.

Core Features
Context-Aware Tracking: Automatically reads custom fields (DE:Bitly Shortlink ID and DE:Bitly QR Code ID) from the active Workfront Project or Issue using the @adobe/uix-guest SDK.

Intelligent Aggregation: When loaded on a Request, it displays data for that specific record. When loaded on a Project, it searches all child tasks/issues for Bitly fields and aggregates the analytics, with a dropdown to filter by specific records.

Asset Details & Metadata: Fetches and displays Bitly asset metadata, including the creation date, Title, Destination/Long URL (hyperlinked), and renders a Base64-encoded PNG image of the QR Code natively inside the Workfront iframe.

Conditional Rendering: Intelligently hides the Shortlink or QR Code sections if the record only contains one type of asset, ensuring a clean, relevant UI.

Comprehensive Metrics: Visualizes engagements via Recharts, including:

Engagements over time (Line Charts).

Geographic distribution (Countries and Cities tables).

Referrer traffic mapping.

Device and Operating System breakdowns (Bar Charts and tables).

Technical Architecture
Frontend: React, Recharts for data visualization, standard CSS for styling.

Backend: Node.js serverless action deployed to Adobe I/O Runtime. Handles chunked parallel requests to Bitly's API endpoints (/clicks, /scans, /image?format=png, etc.) to bypass rate limits and prevent frontend CORS issues.

Authentication: Utilizes the Workfront user's active IMS token passed via the shared context to securely query the Workfront API for custom field values.

Deployment & Cache Management
Adobe Workfront heavily caches iframe extensions. To deploy updates and force a fresh build:

Bash
# Clear Parcel cache and deploy to Adobe I/O
rm -rf dist .parcel-cache && aio app deploy
Note: Ensure you disable the browser cache via the Network tab in Developer Tools and hard refresh Workfront after deploying to view the latest UI.
