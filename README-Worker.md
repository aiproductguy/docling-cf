# Docling Serve - Cloudflare Worker Implementation

This is a Cloudflare Worker implementation of the Docling Serve API. It provides the same API endpoints as the original Docker-based implementation but runs on Cloudflare's edge network.

## Features

- API compatibility with the original Docling Serve
- Serverless architecture using Cloudflare Workers
- Document storage in Cloudflare D1 SQL database
- Lower latency due to edge deployment
- No egress fees for data access

## Requirements

- Node.js (v16 or later)
- npm or yarn
- Cloudflare account
- Cloudflare Workers subscription
- Cloudflare D1 database access

## Setup

1. Clone this repository
2. Install dependencies:

```bash
npm install
```

3. Configure your Cloudflare account in `wrangler.toml` (the default configuration assumes you've already set up wrangler CLI with your account)

4. Create D1 database:

```bash
npx wrangler d1 create docling_documents
```

5. Update the `database_id` in `wrangler.toml` with the ID returned from the command above

6. Initialize the database schema:

```bash
npx wrangler d1 execute docling_documents --file=schema.sql
```

7. Test locally:

```bash
npm run dev
```

8. Deploy to Cloudflare:

```bash
npx wrangler deploy
```

## Environment Variables

The following environment variables can be configured in the `wrangler.toml` file or in the Cloudflare Dashboard:

- `DOCLING_SERVE_ENABLE_UI`: Enable/disable UI (default: "false")
- `DOCLING_SERVE_API_HOST`: API host (default: "localhost")
- `DOCLING_SERVE_MAX_NUM_PAGES`: Maximum number of pages to process (default: "1000")
- `DOCLING_SERVE_MAX_FILE_SIZE`: Maximum file size in bytes (default: "104857600" - 100MB)
- `DEFAULT_MODEL`: Default model to use (default: "gpt-4o-mini")

## Database Schema

The D1 database includes the following tables:

- `documents`: Stores document metadata and content
- `tasks`: Tracks document processing tasks and their status
- `sources`: Stores document sources (URLs)
- `file_chunks`: Stores chunks of large documents that exceed D1 size limits

## Database Table Stats

| Table | Description | Key Fields |
|-------|-------------|------------|
| `documents` | Main document storage | id, title, content, mime_type, created_at |
| `tasks` | Processing task tracking | task_id, status, progress, document_id, created_at |
| `sources` | Document source URLs | id, url, document_id, created_at |
| `file_chunks` | Large document storage | id, document_id, chunk_index, content, created_at |

## API Endpoints

The API endpoints are compatible with the original Docling Serve API:

- `GET /health`: Health check endpoint
- `GET /api`: API readiness check
- `POST /v1alpha/convert/source`: Convert documents from URLs
- `POST /v1alpha/convert/file`: Convert documents from file uploads
- `POST /v1alpha/convert/source/async`: Asynchronously convert documents from URLs
- `GET /v1alpha/status/poll/:taskId`: Poll for task status
- `GET /v1alpha/result/:taskId`: Get task results
- `POST /v1alpha/callback/task/progress`: Update task progress

## Limitations

- The current implementation provides API compatibility but does not implement the full document processing pipeline
- Cloudflare Workers have execution time limits (30 seconds for paid plans)
- For larger documents or processing that exceeds time limits, consider using Cloudflare Queues and/or Durable Objects
- D1 database has size limitations for query results and content storage

## Differences from Docker Implementation

- **Architecture**: Serverless vs. containerized
- **Storage**: Cloudflare D1 (SQL) vs. local filesystem
- **Compute**: Edge functions vs. containerized Python
- **Scalability**: Automatically scales with Cloudflare Workers vs. manual scaling of containers
- **Model Loading**: Does not include built-in model support - would need to use external API services for ML features
- **Database**: Uses SQL database instead of file storage for documents 