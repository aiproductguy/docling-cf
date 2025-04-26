# Docker to Cloudflare Worker Conversion

This document explains the conversion of Docling Serve from a Docker-based implementation to a Cloudflare Worker implementation.

## Architectural Differences

| Docker Implementation | Cloudflare Worker Implementation |
|----------------------|----------------------------------|
| Containerized Python application | Serverless JavaScript/TypeScript application |
| Runs on self-hosted servers or clouds | Runs on Cloudflare's edge network |
| Scales by adding more containers | Scales automatically with traffic |
| Persistent storage via filesystem | Persistent storage via Cloudflare D1 (SQL) |
| Long-running processes | Limited to execution time constraints |
| Heavy machine learning capabilities | Offloads ML to external services |

## API Compatibility

The Cloudflare Worker implementation maintains API compatibility with the original Docker-based service:

- All endpoints are preserved with the same paths and parameters
- Response formats are kept the same
- Authentication methods remain compatible

## Implementation Details

### Storage

- **Docker**: Uses local filesystem for document storage
- **Cloudflare**: Uses D1 SQL database for document storage
  - Documents are stored directly in SQL tables
  - Large documents are chunked to work within D1 limits
  - Relational database provides better query capabilities

### Processing

- **Docker**: Processes documents locally using Python libraries
- **Cloudflare**: Due to execution time constraints, uses a queuing system for long-running tasks

### ML Models

- **Docker**: Can load models directly into the container
- **Cloudflare**: Cannot load large ML models; must use external APIs or Cloudflare's AI capabilities

## Development Workflow

### Docker Development

1. Modify Python code
2. Build Docker image
3. Run container locally
4. Test
5. Push to container registry
6. Deploy to production

### Cloudflare Worker Development

1. Modify TypeScript code
2. Use Wrangler for local development
3. Test locally
4. Deploy directly to Cloudflare using Wrangler

## Deployment Workflow

### Docker Deployment

```bash
docker build -t docling-serve .
docker push registry.example.com/docling-serve
kubectl apply -f kubernetes/deployment.yaml  # if using Kubernetes
```

### Cloudflare Worker Deployment

```bash
# Create D1 database
npx wrangler d1 create docling_documents

# Initialize database schema
npx wrangler d1 execute docling_documents --file=schema.sql

# Deploy worker and site assets
npx wrangler deploy
```

## Limitations

### Docker Limitations

- Requires server infrastructure
- Needs explicit scaling configuration
- Startup time can be slow
- Cold starts can be an issue

### Cloudflare Worker Limitations

- 30-second execution time limit (50ms CPU time on free tier)
- Memory limit of 128MB (free tier) to 1GB (paid)
- No ability to install binary dependencies
- No direct filesystem access
- Cannot run large ML models directly
- D1 database has size limitations for query results and content

## Configuration Changes

### Docker Configuration

The Docker implementation uses:
- Containerfile for build instructions
- Environment variables for configuration
- Volume mounts for persistent storage

### Cloudflare Configuration

The Cloudflare implementation uses:
- wrangler.toml for configuration
- Environment variables defined in wrangler.toml or Cloudflare dashboard
- D1 database for storage with SQL schema

## Cost Considerations

### Docker Costs

- Server/cloud infrastructure costs
- Container registry costs
- Bandwidth costs
- Storage costs

### Cloudflare Costs

- Workers usage (requests per day)
- D1 database costs
- Bandwidth costs (typically lower due to edge network)
- No egress fees with D1 database

## Migration Checklist

1. ✅ Create wrangler.toml configuration
2. ✅ Create basic Worker script with API endpoints
3. ✅ Set up D1 database for document storage
4. ✅ Design and implement SQL schema for documents and tasks
5. ✅ Implement basic API compatibility
6. ✅ Add static assets for UI (if needed)
7. ❌ Set up Cloudflare Queues for async processing (pending)
8. ❌ Connect to external ML services (pending)
9. ❌ Implement robust error handling (pending)
10. ❌ Add comprehensive testing (pending)
11. ✅ Deploy to production 

## Default Configuration

The Cloudflare Worker implementation of Docling Serve uses the following default configurations:

- **Default embedding model**: `sentence-transformers/all-MiniLM-L6-v2`
- **Default embedding engine**: SentenceTransformers
- **Document storage**: Cloudflare D1 database
- **Environment variables**: Configured in wrangler.toml

The selection of `sentence-transformers/all-MiniLM-L6-v2` as the default model provides a good balance of performance and accuracy while remaining within the size constraints of the Cloudflare Worker environment. 