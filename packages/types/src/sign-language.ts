/**
 * Sign language translation and rendering data models
 */

export enum SignDialect {
  ASL = 'asl', // American Sign Language
  BSL = 'bsl', // British Sign Language
  AUSLAN = 'auslan', // Australian Sign Language
  JSL = 'jsl', // Japanese Sign Language
  LSF = 'lsf' // French Sign Language
}

export enum HandShape {
  FLAT = 'flat',
  FIST = 'fist',
  POINT = 'point',
  OK = 'ok',
  THUMB_UP = 'thumb_up',
  CUSTOM = 'custom'
}

export enum BodyLocation {
  HEAD = 'head',
  FACE = 'face',
  CHEST = 'chest',
  WAIST = 'waist',
  NEUTRAL_SPACE = 'neutral_space'
}

export enum ComplexityLevel {
  SIMPLE = 'simple',
  MODERATE = 'moderate',
  COMPLEX = 'complex',
  ADVANCED = 'advanced'
}

export enum SignGrammar {
  ASL_GRAMMAR = 'asl_grammar',
  BSL_GRAMMAR = 'bsl_grammar',
  TOPIC_COMMENT = 'topic_comment',
  SPATIAL = 'spatial'
}

export interface Position3D {
  x: number;
  y: number;
  z: number;
}

export interface Orientation3D {
  pitch: number;
  yaw: number;
  roll: number;
}

export interface FingerPosition {
  fingerId: number;
  flexion: number;
  abduction: number;
}

export interface HandConfiguration {
  handshape: HandShape;
  orientation: Orientation3D;
  position: Position3D;
  fingerPositions: FingerPosition[];
}

export interface MovementPattern {
  path: Position3D[];
  speed: number;
  acceleration: number;
  repetitions: number;
}

export interface SignGesture {
  handShape: HandConfiguration;
  movement: MovementPattern;
  location: BodyLocation;
  duration: number;
  intensity: number;
}

export interface SignMetadata {
  dialect: SignDialect;
  complexity: ComplexityLevel;
  duration: number;
  fingerSpellingCount: number;
}

export interface SignSequence {
  gestures: SignGesture[];
  duration: number;
  metadata: SignMetadata;
}

export interface SignLanguageData {
  sequence: SignGesture[];
  metadata: {
    dialect: SignDialect;
    complexity: ComplexityLevel;
    duration: number;
    fingerSpellingCount: number;
  };
  timing: {
    totalDuration: number;
    gestureTimings: number[];
    transitionTimings: number[];
  };
}

export interface SignTranslator {
  translateToSign(text: string, dialect: SignDialect): Promise<SignSequence>;
  generateFingerspelling(word: string): Promise<SignSequence>;
  adaptGrammar(text: string, targetGrammar: SignGrammar): Promise<string>;
}
