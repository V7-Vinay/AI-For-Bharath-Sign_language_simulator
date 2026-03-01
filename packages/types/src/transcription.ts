/**
 * Transcription and text processing data models
 */

export enum CorrectionType {
  GRAMMAR = 'grammar',
  PUNCTUATION = 'punctuation',
  SPELLING = 'spelling',
  CONTEXT = 'context'
}

export interface TextCorrection {
  original: string;
  corrected: string;
  type: CorrectionType;
  confidence: number;
}

export interface TranscriptionSegment {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  confidence: number;
  speakerId?: string;
  language: string;
  corrections: TextCorrection[];
}

export interface TranscriptionResult {
  text: string;
  confidence: number;
  timestamp: number;
  speakerId?: string;
  language: string;
}

export interface SpeakerIdentification {
  speakerId: string;
  confidence: number;
  voiceProfile?: string;
}

export interface SentimentAnalysis {
  polarity: number;
  subjectivity: number;
  emotion?: string;
}

export interface Context {
  previousText?: string;
  domain?: string;
  speakerHistory?: string[];
}

export interface EnhancedText {
  correctedText: string;
  confidence: number;
  corrections: TextCorrection[];
  sentiment?: SentimentAnalysis;
}

export interface SpeechEngine {
  transcribeStream(audioChunk: AudioBuffer): Promise<TranscriptionResult>;
  setLanguage(language: string): void;
  getConfidenceScore(): number;
  getSpeakerInfo(): SpeakerIdentification;
}

export interface NLPEngine {
  enhanceText(rawText: string, context?: Context): Promise<EnhancedText>;
  correctGrammar(text: string): Promise<string>;
  addPunctuation(text: string): Promise<string>;
  segmentSentences(text: string): string[];
}
