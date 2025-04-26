// Basic response models
export interface HealthCheckResponse {
  status: string;
  version: string;
}

export enum MessageKind {
  INFO = "info",
  ERROR = "error",
  WARNING = "warning",
  SUCCESS = "success",
}

export interface TaskStatusResponse {
  task_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  message?: string;
  progress?: number;
  error?: string;
}

export interface ConvertDocumentResponse extends TaskStatusResponse {
  result?: {
    document_id: string;
    pages: number;
    format: string;
    content?: any;
    file_keys?: string[];
  };
}

// Request models
export interface ConvertDocumentsOptions {
  format?: string;
  keep_image?: boolean;
  orientation_detection?: boolean;
  enable_ocr?: boolean;
  ocr_engine?: string;
  ocr_languages?: string[];
  max_pages?: number;
  page_ranges?: string[];
  timeout?: number;
  model?: string;
}

export interface DocumentSource {
  url: string;
  headers?: Record<string, string>;
}

export interface ConvertDocumentsRequest {
  sources: (string | DocumentSource)[];
  options?: ConvertDocumentsOptions;
}

export interface ProgressCallbackRequest {
  task_id: string;
  progress: number;
  message?: string;
  error?: string;
  status?: "pending" | "processing" | "completed" | "failed";
}

export interface ProgressCallbackResponse {
  success: boolean;
  task_id: string;
  progress: number;
}

export interface WebsocketMessage {
  kind: MessageKind;
  task_id: string;
  message: string;
  progress?: number;
  status?: "pending" | "processing" | "completed" | "failed";
  result?: any;
} 