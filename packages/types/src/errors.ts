/**
 * Error types and error handling interfaces
 */

export enum ErrorCategory {
  AUDIO_PROCESSING = 'audio_processing',
  SPEECH_RECOGNITION = 'speech_recognition',
  TRANSLATION = 'translation',
  NETWORK = 'network',
  AUTHENTICATION = 'authentication',
  CONFIGURATION = 'configuration'
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum ErrorCode {
  // Audio Processing Errors
  AUDIO_CAPTURE_FAILED = 'AUDIO_CAPTURE_FAILED',
  AUDIO_QUALITY_LOW = 'AUDIO_QUALITY_LOW',
  AUDIO_STREAM_INTERRUPTED = 'AUDIO_STREAM_INTERRUPTED',
  NOISE_LEVEL_HIGH = 'NOISE_LEVEL_HIGH',
  
  // Speech Recognition Errors
  TRANSCRIPTION_FAILED = 'TRANSCRIPTION_FAILED',
  LANGUAGE_DETECTION_FAILED = 'LANGUAGE_DETECTION_FAILED',
  CONFIDENCE_LOW = 'CONFIDENCE_LOW',
  MODEL_LOAD_FAILED = 'MODEL_LOAD_FAILED',
  
  // Translation Errors
  SIGN_TRANSLATION_FAILED = 'SIGN_TRANSLATION_FAILED',
  GESTURE_GENERATION_FAILED = 'GESTURE_GENERATION_FAILED',
  DIALECT_UNSUPPORTED = 'DIALECT_UNSUPPORTED',
  FINGERSPELLING_ERROR = 'FINGERSPELLING_ERROR',
  
  // Network and Infrastructure Errors
  CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  SERVER_OVERLOAD = 'SERVER_OVERLOAD',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED'
}

export interface AccessibilityError extends Error {
  code: ErrorCode;
  category: ErrorCategory;
  severity: ErrorSeverity;
  timestamp: number;
  recoverable: boolean;
  context?: Record<string, unknown>;
}

export interface ErrorRecoveryStrategy {
  retryable: boolean;
  maxRetries: number;
  backoffMs: number;
  fallbackAction?: () => void;
}
