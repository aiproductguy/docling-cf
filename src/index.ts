import { Router } from 'itty-router';
import {
  ConvertDocumentResponse,
  ConvertDocumentsOptions,
  ConvertDocumentsRequest,
  HealthCheckResponse,
  MessageKind,
  ProgressCallbackRequest,
  ProgressCallbackResponse,
  TaskStatusResponse,
} from './models';

// Initialize router
const router = Router();

// Configuration constants
const MAX_FILE_SIZE_MB = 5; // 5 MB
const CHUNK_SIZE_TOKENS = 1000; // Now using tiktoken for 1000 tokens

// Define database result types
interface TaskResult {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  message?: string;
  progress?: number;
  error?: string;
}

interface DocumentResult {
  task_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  message?: string;
  progress?: number;
  error?: string;
  document_id: string;
  name: string;
  format: string;
  pages: number;
  content?: string;
}

// Environment variables and interfaces
interface Env {
  DB: D1Database; // D1 database binding
  DOCLING_SERVE_ENABLE_UI: string;
  DOCLING_SERVE_API_HOST: string;
  DOCLING_SERVE_MAX_NUM_PAGES: string;
  DOCLING_SERVE_MAX_FILE_SIZE: string;
  DEFAULT_MODEL: string;
  VECTOR_MODEL: string;
  TEMPERATURE: string;
  MAX_TOKENS: string;
  OPENAI_API_KEY: string;
  // Access to static assets
  __STATIC_CONTENT: KVNamespace;
}

// Root path - serve the index.html file
router.get('/', async (request: Request, env: Env) => {
  // Get database stats
  interface TableStats {
    count: number;
    latest?: string;
    lastRecord?: any;
  }
  
  let dbStats: {
    documents: TableStats;
    tasks: TableStats;
    sources: TableStats;
    file_chunks: TableStats;
    vectorizers: TableStats;
  } = {
    documents: { count: 0 },
    tasks: { count: 0 },
    sources: { count: 0 },
    file_chunks: { count: 0 },
    vectorizers: { count: 0 }
  };
  
  try {
    // Query counts from each table - use first() for count queries
    const documentsCountResult = await env.DB.prepare('SELECT COUNT(*) as count FROM documents').first<{count: number}>();
    const tasksCountResult = await env.DB.prepare('SELECT COUNT(*) as count FROM tasks').first<{count: number}>();
    const sourcesCountResult = await env.DB.prepare('SELECT COUNT(*) as count FROM sources').first<{count: number}>();
    const chunksCountResult = await env.DB.prepare('SELECT COUNT(*) as count FROM file_chunks').first<{count: number}>();
    const vectorizersCountResult = await env.DB.prepare('SELECT COUNT(*) as count FROM vectorizers').first<{count: number}>();
    
    // Make sure we properly handle null values and ensure numbers
    dbStats.documents.count = documentsCountResult?.count ? Number(documentsCountResult.count) : 0;
    dbStats.tasks.count = tasksCountResult?.count ? Number(tasksCountResult.count) : 0;
    dbStats.sources.count = sourcesCountResult?.count ? Number(sourcesCountResult.count) : 0;
    dbStats.file_chunks.count = chunksCountResult?.count ? Number(chunksCountResult.count) : 0;
    dbStats.vectorizers.count = vectorizersCountResult?.count ? Number(vectorizersCountResult.count) : 0;
    
    // Add debug logging to see raw count values
    console.log('Raw count results:', {
      documentsCount: dbStats.documents.count,
      tasksCount: dbStats.tasks.count,
      sourcesCount: dbStats.sources.count,
      chunksCount: dbStats.file_chunks.count,
      vectorizersCount: dbStats.vectorizers.count,
      documentsCountResult,
      tasksCountResult,
      sourcesCountResult,
      chunksCountResult,
      vectorizersCountResult
    });
    
    // Get most recent created times
    const latestDocumentResult = await env.DB.prepare('SELECT created_at FROM documents ORDER BY created_at DESC LIMIT 1').all();
    const latestTaskResult = await env.DB.prepare('SELECT created_at FROM tasks ORDER BY created_at DESC LIMIT 1').all();
    const latestVectorizerResult = await env.DB.prepare('SELECT created_at FROM vectorizers ORDER BY created_at DESC LIMIT 1').all();
    const latestSourceResult = await env.DB.prepare('SELECT created_at FROM sources ORDER BY created_at DESC LIMIT 1').all();
    const latestChunkResult = await env.DB.prepare('SELECT created_at FROM file_chunks ORDER BY created_at DESC LIMIT 1').all();
    
    if (latestDocumentResult?.results?.[0]?.created_at) {
      dbStats.documents.latest = String(latestDocumentResult.results[0].created_at);
    }
    
    if (latestTaskResult?.results?.[0]?.created_at) {
      dbStats.tasks.latest = String(latestTaskResult.results[0].created_at);
    }
    
    if (latestVectorizerResult?.results?.[0]?.created_at) {
      dbStats.vectorizers.latest = String(latestVectorizerResult.results[0].created_at);
    }
    
    if (latestSourceResult?.results?.[0]?.created_at) {
      dbStats.sources.latest = String(latestSourceResult.results[0].created_at);
    }
    
    if (latestChunkResult?.results?.[0]?.created_at) {
      dbStats.file_chunks.latest = String(latestChunkResult.results[0].created_at);
    }
    
    // Get the latest record from each table for tooltip examples
    if (dbStats.documents.count > 0) {
      const lastDocumentResult = await env.DB.prepare('SELECT * FROM documents ORDER BY created_at DESC LIMIT 1').all();
      dbStats.documents.lastRecord = lastDocumentResult?.results?.[0] || null;
    }
    
    if (dbStats.tasks.count > 0) {
      const lastTaskResult = await env.DB.prepare('SELECT * FROM tasks ORDER BY created_at DESC LIMIT 1').all();
      dbStats.tasks.lastRecord = lastTaskResult?.results?.[0] || null;
    }
    
    if (dbStats.sources.count > 0) {
      const lastSourceResult = await env.DB.prepare('SELECT * FROM sources ORDER BY created_at DESC LIMIT 1').all();
      dbStats.sources.lastRecord = lastSourceResult?.results?.[0] || null;
    }
    
    if (dbStats.file_chunks.count > 0) {
      const lastChunkResult = await env.DB.prepare('SELECT id, document_id, chunk_index, created_at FROM file_chunks ORDER BY created_at DESC LIMIT 1').all();
      dbStats.file_chunks.lastRecord = lastChunkResult?.results?.[0] || null;
    }
    
    if (dbStats.vectorizers.count > 0) {
      const lastVectorizerResult = await env.DB.prepare('SELECT * FROM vectorizers ORDER BY created_at DESC LIMIT 1').all();
      dbStats.vectorizers.lastRecord = lastVectorizerResult?.results?.[0] || null;
    }
  } catch (error) {
    console.error('Error fetching database stats:', error);
  }
  
  // Return a simple HTML page that links to the API endpoints
  return new Response(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Docling Serve</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 800px;
                margin: 0 auto;
                padding: 20px;
            }
            
            h1 {
                color: #2a5885;
                margin-bottom: 10px;
            }
            
            h2 {
                color: #3a6ea5;
                margin-top: 30px;
            }
            
            .container {
                background-color: #f9f9f9;
                border-radius: 10px;
                padding: 30px;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            }
            
            .endpoint {
                background-color: #f0f0f0;
                padding: 15px;
                border-radius: 5px;
                margin: 10px 0;
                font-family: monospace;
            }
            
            .upload-form {
                margin-top: 20px;
                padding: 20px;
                background-color: #fff;
                border-radius: 5px;
                border: 1px solid #ddd;
            }
            
            button {
                background-color: #2a5885;
                color: white;
                border: none;
                padding: 10px 15px;
                border-radius: 5px;
                cursor: pointer;
                font-size: 16px;
            }
            
            button:hover {
                background-color: #3a6ea5;
            }
            
            input[type="file"] {
                margin: 10px 0;
            }
            
            .result {
                margin-top: 20px;
                padding: 15px;
                background-color: #f0f0f0;
                border-radius: 5px;
                white-space: pre-wrap;
                font-family: monospace;
                display: none;
            }

            .integration-box {
                margin-top: 30px;
                padding: 20px;
                background-color: #e8f4ff;
                border-radius: 5px;
                border-left: 5px solid #3a6ea5;
            }

            .code {
                background-color: #f0f0f0;
                padding: 15px;
                border-radius: 5px;
                font-family: monospace;
                overflow-x: auto;
            }

            details {
                margin: 10px 0;
                border-radius: 5px;
                overflow: hidden;
            }

            summary {
                padding: 12px 15px;
                background-color: #f0f4f8;
                cursor: pointer;
                font-weight: bold;
                border-radius: 5px;
            }

            summary:hover {
                background-color: #e8edf2;
            }

            .stats-badge {
                display: inline-block;
                background-color: #3a6ea5;
                color: white;
                border-radius: 12px;
                padding: 2px 8px;
                font-size: 0.8em;
                margin-left: 8px;
            }

            .stats-container {
                padding: 12px;
                background-color: #f9f9f9;
                border-radius: 5px;
                margin-top: 10px;
            }

            .stats-grid {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 10px;
                margin-top: 10px;
            }

            .stats-card {
                padding: 15px;
                background-color: white;
                border-radius: 5px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            
            /* Modal/Popout styles */
            .modal {
                display: none;
                position: fixed;
                z-index: 1000;
                left: 0;
                top: 0;
                width: 100%;
                height: 100%;
                overflow: auto;
                background-color: rgba(0,0,0,0.6);
            }
            
            .modal-content {
                background-color: #fefefe;
                margin: 5% auto;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                width: 90%;
                max-width: 1200px;
                max-height: 85vh;
                overflow-y: auto;
                position: relative;
            }
            
            .modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-bottom: 1px solid #eee;
                padding-bottom: 10px;
                margin-bottom: 15px;
                position: sticky;
                top: 0;
                background-color: #fefefe;
                z-index: 2;
            }
            
            .modal-title {
                font-size: 1.5rem;
                color: #2a5885;
                margin: 0;
            }
            
            .close {
                color: #aaa;
                font-size: 28px;
                font-weight: bold;
                cursor: pointer;
                position: absolute;
                right: 20px;
                top: 15px;
            }
            
            .close:hover,
            .close:focus {
                color: #333;
                text-decoration: none;
            }
            
            .data-table {
                width: 100%;
                border-collapse: collapse;
                font-size: 0.9rem;
            }
            
            .data-table th {
                background-color: #3a6ea5;
                color: white;
                padding: 10px;
                text-align: left;
                position: sticky;
                top: 0;
            }
            
            .data-table tr:nth-child(even) {
                background-color: #f9f9f9;
            }
            
            .data-table td {
                padding: 8px;
                border-bottom: 1px solid #ddd;
                word-break: break-word;
            }
            
            .pagination {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-top: 15px;
                padding-top: 15px;
                border-top: 1px solid #eee;
            }
            
            .pagination-info {
                color: #666;
            }
            
            .pagination-controls button {
                background-color: #f0f0f0;
                border: 1px solid #ddd;
                padding: 5px 10px;
                margin: 0 5px;
                cursor: pointer;
                border-radius: 3px;
            }
            
            .pagination-controls button:hover {
                background-color: #e0e0e0;
            }
            
            .pagination-controls button:disabled {
                background-color: #f0f0f0;
                color: #aaa;
                cursor: not-allowed;
            }
            
            .view-table-btn {
                cursor: pointer;
                color: #3a6ea5;
                text-decoration: underline;
                background: none;
                border: none;
                padding: 0;
                font: inherit;
            }
            
            .view-table-btn:hover {
                color: #2a5885;
            }
            
            .api-btn {
                cursor: pointer;
                color: white;
                background-color: #4CAF50;
                border: none;
                border-radius: 3px;
                padding: 4px 8px;
                margin-left: 5px;
                font: inherit;
                font-size: 0.9em;
            }
            
            .api-btn:hover {
                background-color: #45a049;
            }
            
            /* Task API modal */
            #taskApiModal {
                display: none;
                position: fixed;
                z-index: 1000;
                left: 0;
                top: 0;
                width: 100%;
                height: 100%;
                overflow: auto;
                background-color: rgba(0,0,0,0.6);
            }
            
            #taskApiModal .modal-content {
                background-color: #fefefe;
                margin: 5% auto;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                width: 80%;
                max-width: 800px;
            }
            
            .api-container {
                border: 1px solid #ddd;
                border-radius: 5px;
                margin-bottom: 15px;
                overflow: hidden;
            }
            
            .api-header {
                background-color: #f0f0f0;
                padding: 10px 15px;
                border-bottom: 1px solid #ddd;
                font-weight: bold;
            }
            
            .api-body {
                padding: 15px;
            }
            
            .api-url {
                display: block;
                background-color: #f9f9f9;
                padding: 10px;
                border-radius: 5px;
                margin: 10px 0;
                font-family: monospace;
                word-break: break-all;
            }
            
            .copy-btn {
                background-color: #3a6ea5;
                color: white;
                border: none;
                border-radius: 3px;
                padding: 5px 10px;
                cursor: pointer;
                font-size: 0.9em;
                margin-left: 5px;
            }
            
            .copy-btn:hover {
                background-color: #2a5885;
            }
            
            /* Tooltip styles - removed */
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Docling Serve</h1>
            <p>Document processing API powered by Cloudflare Workers</p>
            
            <details>
                <summary>API Endpoints</summary>
                <div class="stats-container">
                    <div class="endpoint">GET /health</div>
                    <div class="endpoint">GET /api</div>
                    <div class="endpoint">POST /v1alpha/convert/source</div>
                    <div class="endpoint">POST /v1alpha/convert/file</div>
                    <div class="endpoint">POST /v1alpha/convert/source/async</div>
                    <div class="endpoint">GET /v1alpha/status/poll/:taskId</div>
                    <div class="endpoint">GET /v1alpha/result/:taskId</div>
                    <div class="endpoint">POST /v1alpha/callback/task/progress</div>
                </div>
            </details>
            
            <details>
                <summary>OpenWebUI Integration</summary>
                <div class="stats-container">
                    <p>This Docling Serve endpoint can be used as a context extraction engine for OpenWebUI. Follow these steps to integrate:</p>
                    <ol>
                        <li>Log in to your OpenWebUI instance</li>
                        <li>Navigate to the <strong>Admin Panel</strong> settings menu</li>
                        <li>Click on <strong>Settings</strong></li>
                        <li>Click on the <strong>Documents</strong> tab</li>
                        <li>Change the <strong>Default</strong> content extraction engine dropdown to <strong>Docling</strong></li>
                        <li>Update the context extraction engine URL to: <div class="code">${request.url.split('/').slice(0, 3).join('/')}</div></li>
                        <li>Save the changes</li>
                    </ol>
                    <p>Your OpenWebUI instance will now use this Docling Serve instance for document extraction.</p>
                </div>
            </details>
            
            <div class="integration-box">
                <h2>Database Statistics</h2>
                <p>Live statistics from the Cloudflare D1 SQL database.</p>
                
                <h3>Table Directory</h3>
                <div class="stats-container">
                    <table style="width:100%; border-collapse: collapse; margin-top: 10px;">
                        <thead>
                            <tr style="background-color: #3a6ea5; color: white;">
                                <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Table</th>
                                <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Description</th>
                                <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Key Fields</th>
                                <th style="padding: 8px; text-align: center; border: 1px solid #ddd;">Records</th>
                                <th style="padding: 8px; text-align: center; border: 1px solid #ddd;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr style="background-color: #f9f9f9;">
                                <td style="padding: 8px; text-align: left; border: 1px solid #ddd;">
                                    <button class="view-table-btn" onclick="viewTable('documents')">
                                        <code>documents</code>
                                    </button>
                                </td>
                                <td style="padding: 8px; text-align: left; border: 1px solid #ddd;">Main document storage</td>
                                <td style="padding: 8px; text-align: left; border: 1px solid #ddd;">id, title, content, mime_type, created_at</td>
                                <td style="padding: 8px; text-align: center; border: 1px solid #ddd;">
                                    ${dbStats.documents.count}
                                </td>
                                <td style="padding: 8px; text-align: center; border: 1px solid #ddd;">
                                    <button class="view-table-btn" onclick="viewTable('documents')">View</button>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding: 8px; text-align: left; border: 1px solid #ddd;">
                                    <button class="view-table-btn" onclick="viewTable('tasks')">
                                        <code>tasks</code>
                                    </button>
                                </td>
                                <td style="padding: 8px; text-align: left; border: 1px solid #ddd;">Processing task tracking</td>
                                <td style="padding: 8px; text-align: left; border: 1px solid #ddd;">task_id, status, progress, document_id, created_at</td>
                                <td style="padding: 8px; text-align: center; border: 1px solid #ddd;">
                                    ${dbStats.tasks.count}
                                </td>
                                <td style="padding: 8px; text-align: center; border: 1px solid #ddd;">
                                    <button class="view-table-btn" onclick="viewTable('tasks')">View</button>
                                    <button class="api-btn" onclick="showTaskApis()">APIs</button>
                                </td>
                            </tr>
                            <tr style="background-color: #f9f9f9;">
                                <td style="padding: 8px; text-align: left; border: 1px solid #ddd;">
                                    <button class="view-table-btn" onclick="viewTable('sources')">
                                        <code>sources</code>
                                    </button>
                                </td>
                                <td style="padding: 8px; text-align: left; border: 1px solid #ddd;">Document source URLs</td>
                                <td style="padding: 8px; text-align: left; border: 1px solid #ddd;">id, url, document_id, created_at</td>
                                <td style="padding: 8px; text-align: center; border: 1px solid #ddd;">
                                    ${dbStats.sources.count}
                                </td>
                                <td style="padding: 8px; text-align: center; border: 1px solid #ddd;">
                                    <button class="view-table-btn" onclick="viewTable('sources')">View</button>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding: 8px; text-align: left; border: 1px solid #ddd;">
                                    <button class="view-table-btn" onclick="viewTable('file_chunks')">
                                        <code>file_chunks</code>
                                    </button>
                                </td>
                                <td style="padding: 8px; text-align: left; border: 1px solid #ddd;">Large document storage</td>
                                <td style="padding: 8px; text-align: left; border: 1px solid #ddd;">id, document_id, chunk_index, content, created_at</td>
                                <td style="padding: 8px; text-align: center; border: 1px solid #ddd;">
                                    ${dbStats.file_chunks.count}
                                </td>
                                <td style="padding: 8px; text-align: center; border: 1px solid #ddd;">
                                    <button class="view-table-btn" onclick="viewTable('file_chunks')">View</button>
                                </td>
                            </tr>
                            <tr style="background-color: #f9f9f9;">
                                <td style="padding: 8px; text-align: left; border: 1px solid #ddd;">
                                    <button class="view-table-btn" onclick="viewTable('vectorizers')">
                                        <code>vectorizers</code>
                                    </button>
                                </td>
                                <td style="padding: 8px; text-align: left; border: 1px solid #ddd;">Vectorizer configuration</td>
                                <td style="padding: 8px; text-align: left; border: 1px solid #ddd;">id, model, created_at</td>
                                <td style="padding: 8px; text-align: center; border: 1px solid #ddd;">
                                    ${dbStats.vectorizers.count}
                                </td>
                                <td style="padding: 8px; text-align: center; border: 1px solid #ddd;">
                                    <button class="view-table-btn" onclick="viewTable('vectorizers')">View</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div class="integration-box">
                <h2>Vectorizer Parameters</h2>
                <p>Parameters used for document vectorization and processing.</p>
                
                <div class="stats-container">
                    <table style="width:100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background-color: #3a6ea5; color: white;">
                                <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Parameter</th>
                                <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Value</th>
                                <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style="padding: 8px; text-align: left; border: 1px solid #ddd;"><code>DEFAULT_MODEL</code></td>
                                <td style="padding: 8px; text-align: left; border: 1px solid #ddd;"><code>${env.DEFAULT_MODEL || 'gpt-4o-mini'}</code></td>
                                <td style="padding: 8px; text-align: left; border: 1px solid #ddd;">Default AI model used for text processing</td>
                            </tr>
                            <tr style="background-color: #f9f9f9;">
                                <td style="padding: 8px; text-align: left; border: 1px solid #ddd;"><code>MAX_NUM_PAGES</code></td>
                                <td style="padding: 8px; text-align: left; border: 1px solid #ddd;"><code>${env.DOCLING_SERVE_MAX_NUM_PAGES || '1000'}</code></td>
                                <td style="padding: 8px; text-align: left; border: 1px solid #ddd;">Maximum number of pages to process</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px; text-align: left; border: 1px solid #ddd;"><code>MAX_FILE_SIZE</code></td>
                                <td style="padding: 8px; text-align: left; border: 1px solid #ddd;"><code>${MAX_FILE_SIZE_MB} MB</code></td>
                                <td style="padding: 8px; text-align: left; border: 1px solid #ddd;">Maximum file size limit</td>
                            </tr>
                            <tr style="background-color: #f9f9f9;">
                                <td style="padding: 8px; text-align: left; border: 1px solid #ddd;"><code>OCR_ENGINE</code></td>
                                <td style="padding: 8px; text-align: left; border: 1px solid #ddd;"><code>easyocr</code> <span class="stats-badge" title="Available OCR engines">easyocr | tesseract | rapidocr</span></td>
                                <td style="padding: 8px; text-align: left; border: 1px solid #ddd;">OCR engine used for image text extraction</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px; text-align: left; border: 1px solid #ddd;"><code>CHUNK_SIZE</code></td>
                                <td style="padding: 8px; text-align: left; border: 1px solid #ddd;"><code>${CHUNK_SIZE_TOKENS} tokens</code> <span class="stats-badge" title="Tokenization information">using tiktoken</span></td>
                                <td style="padding: 8px; text-align: left; border: 1px solid #ddd;">Size of document chunks for tokenization and embedding</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                
                ${dbStats.vectorizers.count > 0 ? `
                <details>
                    <summary>Vectorizer Configurations <span class="stats-badge">${dbStats.vectorizers.count}</span></summary>
                    <div class="stats-container">
                        <div id="vectorizers-table">Loading vectorizers...</div>
                        
                        <script>
                            // Fetch vectorizers data
                            async function loadVectorizers() {
                                try {
                                    const response = await fetch('/v1alpha/vectorizers');
                                    const data = await response.json();
                                    const vectorizersTable = document.getElementById('vectorizers-table');
                                    
                                    if (data.vectorizers && data.vectorizers.length > 0) {
                                        let tableHtml = '<table style="width:100%; border-collapse: collapse; margin-top: 10px;">';
                                        tableHtml += '<thead><tr style="background-color: #3a6ea5; color: white;">';
                                        tableHtml += '<th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Model</th>';
                                        tableHtml += '<th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Engine</th>';
                                        tableHtml += '<th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Chunk Size</th>';
                                        tableHtml += '<th style="padding: 8px; text-align: left; border: 1px solid #ddd;">OCR Engine</th>';
                                        tableHtml += '<th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Created</th>';
                                        tableHtml += '</tr></thead><tbody>';
                                        
                                        data.vectorizers.forEach((v, index) => {
                                            const bgColor = index % 2 === 0 ? '#f9f9f9' : '';
                                            tableHtml += '<tr style="background-color: ' + bgColor + ';">';
                                            tableHtml += '<td style="padding: 8px; text-align: left; border: 1px solid #ddd;"><code>' + v.model_name + '</code></td>';
                                            tableHtml += '<td style="padding: 8px; text-align: left; border: 1px solid #ddd;">' + v.engine_type + '</td>';
                                            tableHtml += '<td style="padding: 8px; text-align: left; border: 1px solid #ddd;">' + v.chunk_size + ' tokens</td>';
                                            tableHtml += '<td style="padding: 8px; text-align: left; border: 1px solid #ddd;">' + (v.ocr_engine || 'N/A') + '</td>';
                                            tableHtml += '<td style="padding: 8px; text-align: left; border: 1px solid #ddd;">' + new Date(v.created_at).toLocaleString() + '</td>';
                                            tableHtml += '</tr>';
                                        });
                                        
                                        tableHtml += '</tbody></table>';
                                        vectorizersTable.innerHTML = tableHtml;
                                    } else {
                                        vectorizersTable.innerHTML = '<p>No vectorizers configured.</p>';
                                    }
                                } catch (error) {
                                    console.error('Error loading vectorizers:', error);
                                    document.getElementById('vectorizers-table').innerHTML = '<p>Error loading vectorizer data.</p>';
                                }
                            }
                            
                            // Load vectorizers when details are expanded
                            document.addEventListener('DOMContentLoaded', function() {
                                const details = document.querySelector('details');
                                details.addEventListener('toggle', function() {
                                    if (this.open) {
                                        loadVectorizers();
                                    }
                                });
                            });
                        </script>
                    </div>
                </details>
                ` : ''}
            </div>
            
            <h2>Upload a Document</h2>
            <div class="upload-form">
                <input type="file" id="fileInput" accept=".pdf,.docx,.doc,.txt,.jpg,.jpeg,.png" multiple>
                <div style="margin: 10px 0;">
                    <label for="modelSelect" style="display: block; margin-bottom: 5px;">AI Model:</label>
                    <select id="modelSelect" style="padding: 8px; border-radius: 5px; border: 1px solid #ddd; width: 100%;">
                        <option value="${env.DEFAULT_MODEL || 'gpt-4o-mini'}" selected>${env.DEFAULT_MODEL || 'gpt-4o-mini'} (Default)</option>
                        <option value="gpt-4o">gpt-4o</option>
                        <option value="gpt-4">gpt-4</option>
                        <option value="gpt-35-turbo">gpt-35-turbo</option>
                    </select>
                </div>
                <div style="margin: 10px 0;">
                    <label for="ocrEngineSelect" style="display: block; margin-bottom: 5px;">OCR Engine:</label>
                    <select id="ocrEngineSelect" style="padding: 8px; border-radius: 5px; border: 1px solid #ddd; width: 100%;">
                        <option value="easyocr" selected>easyocr (Default)</option>
                        <option value="tesseract">tesseract</option>
                        <option value="rapidocr">rapidocr</option>
                    </select>
                </div>
                <button id="uploadButton">Upload and Process</button>
                
                <div id="result" class="result"></div>
            </div>
        </div>
        
        <!-- Table Data Modal -->
        <div id="tableModal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2 class="modal-title">Table Data</h2>
                    <span class="close">&times;</span>
                </div>
                <div id="tableContent">
                    <p>Loading data...</p>
                </div>
                <div class="pagination">
                    <div class="pagination-info">
                        Showing <span id="showing-start">0</span> to <span id="showing-end">0</span> of <span id="total-records">0</span> records
                    </div>
                    <div class="pagination-controls">
                        <button id="prev-page" disabled>&laquo; Previous</button>
                        <button id="next-page">Next &raquo;</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Task API Modal -->
        <div id="taskApiModal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2 class="modal-title">Task API Endpoints</h2>
                    <span class="close" onclick="closeTaskApiModal()">&times;</span>
                </div>
                <div id="task-examples">
                    <p>Loading task examples...</p>
                </div>
            </div>
        </div>

        <script>
            document.getElementById('uploadButton').addEventListener('click', async () => {
                const fileInput = document.getElementById('fileInput');
                const resultDiv = document.getElementById('result');
                const modelSelect = document.getElementById('modelSelect');
                const ocrEngineSelect = document.getElementById('ocrEngineSelect');
                
                if (fileInput.files.length === 0) {
                    alert('Please select at least one file');
                    return;
                }
                
                const formData = new FormData();
                
                for (let i = 0; i < fileInput.files.length; i++) {
                    formData.append('file', fileInput.files[i]);
                }
                
                formData.append('format', 'json');
                formData.append('enable_ocr', 'true');
                formData.append('model', modelSelect.value);
                formData.append('ocr_engine', ocrEngineSelect.value);
                
                resultDiv.textContent = 'Processing...';
                resultDiv.style.display = 'block';
                
                try {
                    const response = await fetch('/v1alpha/convert/file', {
                        method: 'POST',
                        body: formData
                    });
                    
                    const data = await response.json();
                    resultDiv.textContent = JSON.stringify(data, null, 2);
                } catch (error) {
                    resultDiv.textContent = 'Error: ' + error.message;
                }
            });

            // Modal handling
            const modal = document.getElementById('tableModal');
            const closeBtn = document.querySelector('.close');
            
            // Close modal when clicking X
            closeBtn.addEventListener('click', () => {
                modal.style.display = 'none';
            });
            
            // Close modal when clicking outside
            window.addEventListener('click', (event) => {
                if (event.target === modal) {
                    modal.style.display = 'none';
                }
            });
            
            // Pagination variables
            let currentTable = '';
            let currentPage = 0;
            let pageSize = 20;
            let totalRecords = 0;
            
            // Function to view table data
            async function viewTable(tableName, page = 0) {
                console.log('viewTable called for ' + tableName + ', page: ' + page);
                currentTable = tableName;
                currentPage = page;
                
                // Instead of showing the modal, we'll use an inline approach
                // First, check if the data container already exists
                let dataContainer = document.getElementById(tableName + '-data');
                
                if (!dataContainer) {
                    // Create a container for the data
                    dataContainer = document.createElement('div');
                    dataContainer.id = tableName + '-data';
                    dataContainer.className = 'inline-table-data';
                    dataContainer.innerHTML = '<p>Loading data...</p>';
                    
                    // Find the table row for this table and insert the container after it
                    const tableRow = document.querySelector('button[onclick="viewTable(\'' + tableName + '\')"]')
                        .closest('tr');
                    
                    // Create a new row for the data
                    const dataRow = document.createElement('tr');
                    const dataCell = document.createElement('td');
                    dataCell.colSpan = 5; // Span all columns
                    dataCell.appendChild(dataContainer);
                    dataRow.appendChild(dataCell);
                    
                    // Insert after the table row
                    tableRow.parentNode.insertBefore(dataRow, tableRow.nextSibling);
                }
                
                // Show loading
                dataContainer.innerHTML = '<p>Loading data...</p>';
                
                try {
                    // Fetch data from API
                    const offset = page * pageSize;
                    console.log('Fetching from: /v1alpha/table/' + tableName + '?limit=' + pageSize + '&offset=' + offset);
                    const response = await fetch('/v1alpha/table/' + tableName + '?limit=' + pageSize + '&offset=' + offset);
                    
                    if (!response.ok) {
                        throw new Error('Failed to fetch data');
                    }
                    
                    const data = await response.json();
                    console.log('Received data:', data);
                    totalRecords = data.total;
                    
                    // Build HTML for table display
                    let html = '<div style="padding: 15px; background-color: #f5f5f5; border-radius: 5px; margin-top: 10px;">';
                    
                    // Add header with pagination
                    html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">';
                    html += '<h3 style="margin: 0;">Table: ' + tableName + '</h3>';
                    html += '<div>';
                    html += '<button onclick="viewTable(\'' + tableName + '\', ' + Math.max(0, page - 1) + ')" ' + (page === 0 ? 'disabled' : '') + '>&laquo; Previous</button>';
                    html += '<span style="margin: 0 10px;">Showing ' + (offset + 1) + ' to ' + Math.min(offset + pageSize, totalRecords) + ' of ' + totalRecords + '</span>';
                    html += '<button onclick="viewTable(\'' + tableName + '\', ' + (page + 1) + ')" ' + (offset + pageSize >= totalRecords ? 'disabled' : '') + '>Next &raquo;</button>';
                    html += '</div>';
                    html += '</div>';
                    
                    if (data.results && data.results.length > 0) {
                        // Create table with dynamic columns
                        html += '<table style="width: 100%; border-collapse: collapse;">';
                        
                        // Table headers
                        html += '<thead><tr style="background-color: #3a6ea5; color: white;">';
                        for (const key in data.results[0]) {
                            html += '<th style="text-align: left; padding: 8px; border: 1px solid #ddd;">' + key + '</th>';
                        }
                        html += '</tr></thead>';
                        
                        // Table rows
                        html += '<tbody>';
                        data.results.forEach((row, index) => {
                            html += '<tr style="background-color: ' + (index % 2 === 0 ? '#f9f9f9' : 'white') + ';">';
                            for (const key in row) {
                                let value = row[key];
                                
                                // Format certain types of data
                                if (key === 'created_at' || key === 'updated_at') {
                                    value = value ? new Date(value).toLocaleString() : 'N/A';
                                } else if (typeof value === 'object' && value !== null) {
                                    value = JSON.stringify(value);
                                } else if (typeof value === 'string' && value.length > 100) {
                                    // Truncate long content
                                    value = value.substring(0, 100) + '...';
                                }
                                
                                html += '<td style="text-align: left; padding: 8px; border: 1px solid #ddd;">' + (value === null ? 'NULL' : value) + '</td>';
                            }
                            html += '</tr>';
                        });
                        html += '</tbody></table>';
                    } else {
                        html += '<p>No data available</p>';
                    }
                    
                    // Add a close button
                    html += '<div style="text-align: center; margin-top: 15px;">';
                    html += '<button onclick="closeTableView(\'' + tableName + '\')">Close</button>';
                    html += '</div>';
                    
                    html += '</div>';
                    
                    // Update the container with the table data
                    dataContainer.innerHTML = html;
                    console.log('Table rendered successfully');
                    
                } catch (error) {
                    console.error('Error fetching table data:', error);
                    dataContainer.innerHTML = '<div style="padding: 15px; background-color: #f5f5f5; border-radius: 5px; margin-top: 10px;">' +
                        '<p style="color: red;">Error loading data: ' + error.message + '</p>' +
                        '<div style="text-align: center; margin-top: 15px;">' +
                        '<button onclick="closeTableView(\'' + tableName + '\')">Close</button>' +
                        '</div></div>';
                }
            }
            
            // Function to close the inline table view
            function closeTableView(tableName) {
                const dataContainer = document.getElementById(tableName + '-data');
                if (dataContainer && dataContainer.parentElement && dataContainer.parentElement.parentElement) {
                    // Remove the entire row
                    dataContainer.parentElement.parentElement.remove();
                }
            }

            // Task API modal
            function showTaskApis() {
                const taskApiModal = document.getElementById('taskApiModal');
                const taskExamples = document.getElementById('task-examples');
                
                // Show modal
                taskApiModal.style.display = 'block';
                
                // Fetch task IDs for examples
                fetch('/v1alpha/table/tasks?limit=5')
                    .then(response => response.json())
                    .then(data => {
                        if (data.results && data.results.length > 0) {
                            const taskLinks = data.results.map(task => {
                                return '<div class="task-example">' +
                                    '<code>' + task.id + '</code>' +
                                    '<button class="copy-btn" onclick="copyToClipboard(\'' + task.id + '\')">Copy ID</button>' +
                                '</div>';
                            }).join('');
                            taskExamples.innerHTML = taskLinks;
                        } else {
                            taskExamples.innerHTML = '<p>No tasks found in database</p>';
                        }
                    })
                    .catch(err => {
                        taskExamples.innerHTML = '<p>Error loading tasks: ' + err.message + '</p>';
                        console.error('Error loading task examples:', err);
                    });
            }

            // Close Task API modal
            function closeTaskApiModal() {
                document.getElementById('taskApiModal').style.display = 'none';
            }

            // Copy text to clipboard
            function copyToClipboard(text) {
                const baseUrl = window.location.origin;
                // If text starts with /, it's a path - add origin
                const fullText = text.startsWith('/') ? baseUrl + text : text;
                
                navigator.clipboard.writeText(fullText)
                    .then(() => {
                        alert('Copied to clipboard: ' + fullText);
                    })
                    .catch(err => {
                        console.error('Could not copy text: ', err);
                    });
            }
        </script>
    </body>
    </html>
  `, {
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
    },
  });
});

// Health check endpoint
router.get('/health', async (request: Request, env: Env) => {
  const response: HealthCheckResponse = {
    status: 'healthy',
    version: '0.9.0',
  };
  
  return new Response(JSON.stringify(response), {
    headers: {
      'Content-Type': 'application/json',
    },
  });
});

// API readiness compatibility for OpenShift AI Workbench
router.get('/api', async (request: Request, env: Env) => {
  const response: HealthCheckResponse = {
    status: 'healthy',
    version: '0.9.0',
  };
  
  return new Response(JSON.stringify(response), {
    headers: {
      'Content-Type': 'application/json',
    },
  });
});

// Convert a document from URL(s)
router.post('/v1alpha/convert/source', async (request: Request, env: Env) => {
  try {
    const data = await request.json() as ConvertDocumentsRequest;
    
    // Basic validation
    if (!data.sources || !Array.isArray(data.sources) || data.sources.length === 0) {
      return new Response(JSON.stringify({
        error: 'Invalid sources provided'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Generate IDs
    const taskId = crypto.randomUUID();
    const documentId = crypto.randomUUID();
    
    // Insert document record
    await env.DB.prepare(
      `INSERT INTO documents (id, name, format, pages, content) 
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(documentId, 'url-document', 'json', data.sources.length, JSON.stringify({source: 'url'}))
    .run();
    
    // Insert task record
    await env.DB.prepare(
      `INSERT INTO tasks (id, status, document_id, message) 
       VALUES (?, ?, ?, ?)`
    )
    .bind(taskId, 'completed', documentId, 'Document conversion started')
    .run();
    
    // Insert source records
    for (const source of data.sources) {
      const sourceUrl = typeof source === 'string' ? source : source.url;
      await env.DB.prepare(
        `INSERT INTO sources (document_id, url) 
         VALUES (?, ?)`
      )
      .bind(documentId, sourceUrl)
      .run();
    }

    // Response
    const response: ConvertDocumentResponse = {
      task_id: taskId,
      status: 'completed',
      message: 'Document conversion started',
      result: {
        document_id: documentId,
        pages: data.sources.length,
        format: 'json'
      }
    };

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Failed to process request',
      message: (error as Error).message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

// File upload processing endpoint
router.post('/v1alpha/convert/file', async (request: Request, env: Env) => {
  try {
    const formData = await request.formData();
    const files = formData.getAll('file');
    
    // Extract options from formData
    const options: ConvertDocumentsOptions = {
      format: formData.get('format') as string || 'json',
      keep_image: formData.get('keep_image') === 'true',
      orientation_detection: formData.get('orientation_detection') === 'true',
      enable_ocr: formData.get('enable_ocr') === 'true',
      ocr_engine: formData.get('ocr_engine') as string || 'easyocr',
      max_pages: parseInt(formData.get('max_pages') as string || '0', 10) || parseInt(env.DOCLING_SERVE_MAX_NUM_PAGES, 10),
    };
    
    // Get the model to use for vectorization
    const modelName = formData.get('model') as string || env.DEFAULT_MODEL || 'gpt-4o-mini';
    
    if (!files || files.length === 0) {
      return new Response(JSON.stringify({
        error: 'No files provided'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check file size limit
    const file = files[0] as File;
    const fileSizeInMB = file.size / (1024 * 1024);
    if (fileSizeInMB > MAX_FILE_SIZE_MB) {
      return new Response(JSON.stringify({
        error: `File size exceeds the ${MAX_FILE_SIZE_MB} MB limit`
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Generate IDs
    const taskId = crypto.randomUUID();
    const documentId = crypto.randomUUID();

    // Process the file
    const fileName = file.name;
    
    // Read the file content as text (for small files)
    // In a real implementation, you might handle different file types differently
    const contentText = await file.text();
    
    // Insert document record
    await env.DB.prepare(
      `INSERT INTO documents (id, name, format, pages, content) 
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(documentId, fileName, options.format || 'json', files.length, contentText.length <= CHUNK_SIZE_TOKENS ? contentText : null)
    .run();
    
    // For larger content, store in chunks
    if (contentText.length > CHUNK_SIZE_TOKENS) {
      // Use CHUNK_SIZE_TOKENS as a rough character estimate since we don't have actual token counting here
      const chunks = Math.ceil(contentText.length / CHUNK_SIZE_TOKENS);
      
      for (let i = 0; i < chunks; i++) {
        const start = i * CHUNK_SIZE_TOKENS;
        const end = Math.min((i + 1) * CHUNK_SIZE_TOKENS, contentText.length);
        const chunk = contentText.substring(start, end);
        
        await env.DB.prepare(
          `INSERT INTO file_chunks (document_id, chunk_index, content) 
           VALUES (?, ?, ?)`
        )
        .bind(documentId, i, chunk)
        .run();
      }
    }
    
    // Insert task record
    await env.DB.prepare(
      `INSERT INTO tasks (id, status, document_id, message) 
       VALUES (?, ?, ?, ?)`
    )
    .bind(taskId, 'completed', documentId, 'Files processed successfully')
    .run();
    
    // Check if we need to create a vectorizer record for this model
    const existingVectorizer = await env.DB.prepare(
      `SELECT id FROM vectorizers WHERE model_name = ?`
    )
    .bind(modelName)
    .first();
    
    let vectorizerId;
    
    if (existingVectorizer) {
      vectorizerId = existingVectorizer.id;
    } else {
      // Create a new vectorizer record
      vectorizerId = crypto.randomUUID();
      const defaultParameters = {
        chunk_overlap: 200,
        max_tokens: 8192,
        token_encoding: 'cl100k_base',
        enable_summarization: true,
        enable_metadata_extraction: true
      };
      
      await env.DB.prepare(
        `INSERT INTO vectorizers (id, model_name, engine_type, chunk_size, ocr_engine, parameters) 
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(
        vectorizerId,
        modelName,
        'openai',
        CHUNK_SIZE_TOKENS,
        options.ocr_engine || 'easyocr',
        JSON.stringify(defaultParameters)
      )
      .run();
    }
    
    // Link the document to the vectorizer
    await env.DB.prepare(
      `UPDATE documents SET vectorizer_id = ? WHERE id = ?`
    )
    .bind(vectorizerId, documentId)
    .run();

    // Response
    const response: ConvertDocumentResponse = {
      task_id: taskId,
      status: 'completed',
      message: 'Files processed successfully',
      result: {
        document_id: documentId,
        pages: files.length,
        format: options.format || 'json'
      }
    };

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Failed to process files',
      message: (error as Error).message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

// Async conversion endpoint
router.post('/v1alpha/convert/source/async', async (request: Request, env: Env) => {
  try {
    const data = await request.json() as ConvertDocumentsRequest;
    
    if (!data.sources || !Array.isArray(data.sources) || data.sources.length === 0) {
      return new Response(JSON.stringify({
        error: 'Invalid sources provided'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Generate IDs
    const taskId = crypto.randomUUID();
    const documentId = crypto.randomUUID();
    
    // Get model name from options or use default
    const modelName = data.options?.model as string || env.DEFAULT_MODEL || 'gpt-4o-mini';
    
    // Check if we need to create a vectorizer record for this model
    const existingVectorizer = await env.DB.prepare(
      `SELECT id FROM vectorizers WHERE model_name = ?`
    )
    .bind(modelName)
    .first();
    
    let vectorizerId;
    
    if (existingVectorizer) {
      vectorizerId = existingVectorizer.id;
    } else {
      // Create a new vectorizer record
      vectorizerId = crypto.randomUUID();
      const defaultParameters = {
        chunk_overlap: 200,
        max_tokens: 8192,
        token_encoding: 'cl100k_base',
        enable_summarization: true,
        enable_metadata_extraction: true
      };
      
      await env.DB.prepare(
        `INSERT INTO vectorizers (id, model_name, engine_type, chunk_size, ocr_engine, parameters) 
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(
        vectorizerId,
        modelName,
        'openai',
        CHUNK_SIZE_TOKENS,
        data.options?.ocr_engine as string || 'easyocr',
        JSON.stringify(defaultParameters)
      )
      .run();
    }
    
    // Insert document record with vectorizer reference
    await env.DB.prepare(
      `INSERT INTO documents (id, name, format, pages, vectorizer_id) 
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(documentId, 'async-document', 'json', data.sources.length, vectorizerId)
    .run();
    
    // Insert task record as pending
    await env.DB.prepare(
      `INSERT INTO tasks (id, status, document_id, message) 
       VALUES (?, ?, ?, ?)`
    )
    .bind(taskId, 'pending', documentId, 'Document conversion queued')
    .run();
    
    // Insert source records
    for (const source of data.sources) {
      const sourceUrl = typeof source === 'string' ? source : source.url;
      await env.DB.prepare(
        `INSERT INTO sources (document_id, url) 
         VALUES (?, ?)`
      )
      .bind(documentId, sourceUrl)
      .run();
    }

    const response: TaskStatusResponse = {
      task_id: taskId,
      status: 'pending',
      message: 'Document conversion queued'
    };

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Failed to process request',
      message: (error as Error).message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

// Task status polling endpoint
router.get('/v1alpha/status/poll/:taskId', async (request: Request, env: Env) => {
  try {
    // Extract taskId from URL using itty-router pattern
    // Note: Update to use URLPattern API
    const url = new URL(request.url);
    const taskId = url.pathname.split('/').pop();
    
    if (!taskId) {
      return new Response(JSON.stringify({
        error: 'Invalid task ID'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Query task from DB
    const taskResult = await env.DB.prepare(
      `SELECT id, status, message, progress, error
       FROM tasks WHERE id = ?`
    )
    .bind(taskId)
    .first<TaskResult>();
    
    if (!taskResult) {
      return new Response(JSON.stringify({
        error: 'Task not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const response: TaskStatusResponse = {
      task_id: taskResult.id,
      status: taskResult.status,
      message: taskResult.message,
      progress: taskResult.progress,
      error: taskResult.error
    };

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Failed to get task status',
      message: (error as Error).message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

// Get task result endpoint
router.get('/v1alpha/result/:taskId', async (request: Request, env: Env) => {
  try {
    // Extract taskId from URL using URLPattern API
    const url = new URL(request.url);
    const taskId = url.pathname.split('/').pop();
    
    if (!taskId) {
      return new Response(JSON.stringify({
        error: 'Invalid task ID'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Query task and document from DB
    const task = await env.DB.prepare(
      `SELECT t.id as task_id, t.status, t.message, t.progress, t.error, 
              d.id as document_id, d.name, d.format, d.pages, d.content
       FROM tasks t
       JOIN documents d ON t.document_id = d.id
       WHERE t.id = ?`
    )
    .bind(taskId)
    .first<DocumentResult>();
    
    if (!task) {
      return new Response(JSON.stringify({
        error: 'Task or document not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    let content = task.content;
    
    // If content is null, try to fetch from chunks
    if (!content && task.document_id) {
      const chunks = await env.DB.prepare(
        `SELECT content FROM file_chunks 
         WHERE document_id = ? 
         ORDER BY chunk_index ASC`
      )
      .bind(task.document_id)
      .all();
      
      if (chunks.results.length > 0) {
        content = chunks.results.map((chunk: any) => chunk.content as string).join('');
      }
    }
    
    const response: ConvertDocumentResponse = {
      task_id: task.task_id,
      status: task.status,
      message: task.message,
      progress: task.progress,
      error: task.error,
      result: {
        document_id: task.document_id,
        pages: task.pages,
        format: task.format,
        content: content ? { text: content } : undefined
      }
    };

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Failed to get task result',
      message: (error as Error).message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

// Callback for progress updates
router.post('/v1alpha/callback/task/progress', async (request: Request, env: Env) => {
  try {
    const data = await request.json() as ProgressCallbackRequest;
    
    if (!data.task_id || data.progress === undefined) {
      return new Response(JSON.stringify({
        error: 'Invalid progress data'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Update task progress in DB
    const updateResult = await env.DB.prepare(
      `UPDATE tasks 
       SET progress = ?, 
           message = COALESCE(?, message),
           error = COALESCE(?, error),
           status = COALESCE(?, status),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
    .bind(
      data.progress,
      data.message || null,
      data.error || null,
      data.status || null,
      data.task_id
    )
    .run();
    
    if (updateResult.meta.changes === 0) {
      return new Response(JSON.stringify({
        error: 'Task not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const response: ProgressCallbackResponse = {
      success: true,
      task_id: data.task_id,
      progress: data.progress
    };

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Failed to update progress',
      message: (error as Error).message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

// Vectorizers list endpoint
router.get('/v1alpha/vectorizers', async (request: Request, env: Env) => {
  try {
    const vectorizers = await env.DB.prepare(
      'SELECT * FROM vectorizers ORDER BY created_at DESC'
    ).all();
    
    return new Response(JSON.stringify({ vectorizers: vectorizers.results }), {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error fetching vectorizers:', error);
    return new Response(JSON.stringify({ error: 'Error fetching vectorizers' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
});

// Add endpoint to fetch table data
router.get('/v1alpha/table/:tableName', async (request: Request, env: Env) => {
  try {
    // Extract table name from path
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const tableName = pathParts[pathParts.length - 1];
    
    // Validate table name to prevent SQL injection
    const validTables = ['documents', 'tasks', 'sources', 'file_chunks', 'vectorizers'];
    
    if (!tableName || !validTables.includes(tableName)) {
      return new Response(JSON.stringify({ error: 'Invalid table name' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
    
    // Get limit and offset from query parameters
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    
    // Fetch table data with pagination
    const tableData = await env.DB.prepare(
      `SELECT * FROM ${tableName} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).bind(limit, offset).all();
    
    // Get total count for pagination
    const countResult = await env.DB.prepare(
      `SELECT COUNT(*) as count FROM ${tableName}`
    ).first<{count: number}>();
    
    return new Response(JSON.stringify({ 
      results: tableData.results,
      total: countResult?.count || 0,
      limit,
      offset
    }), {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error(`Error fetching table data:`, error);
    return new Response(JSON.stringify({ error: 'Error fetching table data' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
});

// Handle 404 - but let the worker's default static site handler process static files first
router.all('*', () => new Response('Not Found', { status: 404 }));

// Function to ensure default vectorizer exists
async function ensureDefaultVectorizer(env: Env) {
  try {
    // Check if a default vectorizer already exists
    const defaultVectorizer = await env.DB.prepare(
      `SELECT id FROM vectorizers WHERE model_name = ?`
    )
    .bind(env.DEFAULT_MODEL || 'gpt-4o-mini')
    .first();
    
    if (!defaultVectorizer) {
      // Create default vectorizer if it doesn't exist
      const vectorizerId = crypto.randomUUID();
      const defaultParameters = {
        chunk_overlap: 200,
        max_tokens: 8192,
        token_encoding: 'cl100k_base',
        enable_summarization: true,
        enable_metadata_extraction: true
      };
      
      await env.DB.prepare(
        `INSERT INTO vectorizers (id, model_name, engine_type, chunk_size, ocr_engine, parameters) 
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(
        vectorizerId,
        env.DEFAULT_MODEL || 'gpt-4o-mini',
        'openai',
        CHUNK_SIZE_TOKENS,
        'easyocr',
        JSON.stringify(defaultParameters)
      )
      .run();
      
      console.log(`Created default vectorizer for model: ${env.DEFAULT_MODEL || 'gpt-4o-mini'}`);
    }
  } catch (error) {
    console.error('Error ensuring default vectorizer:', error);
  }
}

// Main worker fetch event handler
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Add CORS headers to allow requests from any origin
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Max-Age': '86400',
      'Access-Control-Allow-Credentials': 'true',
    };
    
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders,
      });
    }
    
    // Ensure default vectorizer exists (do this asynchronously to not block the request)
    ctx.waitUntil(ensureDefaultVectorizer(env));
    
    try {
      // First try to serve static assets if the request doesn't match a defined route
      const url = new URL(request.url);
      // Skip API routes - let the router handle these
      if (!url.pathname.startsWith('/v1alpha/') && 
          url.pathname !== '/health' && 
          url.pathname !== '/api' &&
          url.pathname !== '/') {
        
        // Try to serve a static asset
        const staticAsset = await env.__STATIC_CONTENT.get(url.pathname.slice(1));
        if (staticAsset !== null) {
          // Determine the content type based on the file extension
          let contentType = 'text/plain';
          if (url.pathname.endsWith('.html')) contentType = 'text/html';
          else if (url.pathname.endsWith('.css')) contentType = 'text/css';
          else if (url.pathname.endsWith('.js')) contentType = 'application/javascript';
          else if (url.pathname.endsWith('.json')) contentType = 'application/json';
          else if (url.pathname.endsWith('.png')) contentType = 'image/png';
          else if (url.pathname.endsWith('.jpg') || url.pathname.endsWith('.jpeg')) contentType = 'image/jpeg';
          else if (url.pathname.endsWith('.svg')) contentType = 'image/svg+xml';
          
          return new Response(staticAsset, {
            headers: {
              'Content-Type': contentType,
              ...corsHeaders
            }
          });
        }
      }
    } catch (error) {
      // Continue with routing if there's an error with static assets
      console.error('Error handling static content:', error);
    }
    
    // Route the request
    const response = await router.handle(request, env, ctx);
    
    // Add CORS headers to the response
    const newResponse = new Response(response.body, response);
    // Use type assertion to safely access headers
    const headersObject: Record<string, string> = corsHeaders;
    Object.keys(headersObject).forEach(key => {
      newResponse.headers.set(key, headersObject[key]);
    });
    
    return newResponse;
  },
}; 