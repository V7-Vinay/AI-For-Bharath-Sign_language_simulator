/**
 * Avatar rendering and animation data models
 */

import { SignSequence } from './sign-language';

export enum AvatarSize {
  SMALL = 'small',
  MEDIUM = 'medium',
  LARGE = 'large',
  FULLSCREEN = 'fullscreen'
}

export enum RenderQuality {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  ULTRA = 'ultra'
}

export enum ClothingStyle {
  CASUAL = 'casual',
  FORMAL = 'formal',
  PROFESSIONAL = 'professional',
  CUSTOM = 'custom'
}

export enum AnimationState {
  IDLE = 'idle',
  PLAYING = 'playing',
  PAUSED = 'paused',
  STOPPED = 'stopped',
  LOADING = 'loading'
}

export interface AvatarAppearance {
  gender: 'male' | 'female' | 'neutral';
  skinTone: string;
  hairStyle?: string;
  facialFeatures?: Record<string, unknown>;
}

export interface AvatarConfig {
  gender: 'male' | 'female' | 'neutral';
  skinTone: string;
  clothing: ClothingStyle;
  size: AvatarSize;
  quality: RenderQuality;
}

export interface Avatar {
  id: string;
  config: AvatarConfig;
  appearance: AvatarAppearance;
  currentState: AnimationState;
}

export interface AvatarRenderer {
  initializeAvatar(config: AvatarConfig): Promise<Avatar>;
  playSignSequence(sequence: SignSequence): Promise<void>;
  updateAvatarAppearance(appearance: AvatarAppearance): void;
  setAnimationSpeed(speed: number): void;
  getAnimationState(): AnimationState;
}
