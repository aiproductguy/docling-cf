-- Create documents table to store document metadata
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  format TEXT NOT NULL,
  pages INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  content TEXT, -- Stores document content or reference to content
  vectorizer_id TEXT, -- Reference to vectorizer used for this document
  FOREIGN KEY (vectorizer_id) REFERENCES vectorizers(id)
);

-- Create tasks table to track document processing tasks
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL, -- 'pending', 'processing', 'completed', 'failed'
  document_id TEXT,
  progress REAL DEFAULT 0,
  message TEXT,
  error TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES documents(id)
);

-- Create sources table to store document sources (URLs)
CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES documents(id)
);

-- Create file_chunks table to store file content in chunks
-- (for larger documents that exceed D1 size limits)
CREATE TABLE IF NOT EXISTS file_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES documents(id),
  UNIQUE (document_id, chunk_index)
);

-- Create vectorizers table to track Docling parameters
CREATE TABLE IF NOT EXISTS vectorizers (
  id TEXT PRIMARY KEY,
  model_name TEXT NOT NULL,
  engine_type TEXT NOT NULL,
  chunk_size INTEGER NOT NULL,
  ocr_engine TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  parameters TEXT -- JSON string for additional parameters
); 