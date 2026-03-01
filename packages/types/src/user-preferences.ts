/**
 * User preferences and configuration data models
 */

import { SignDialect } from './sign-language';
import { AvatarSize, AvatarAppearance } from './avatar';

export enum DisplayPosition {
  TOP_LEFT = 'top_left',
  TOP_CENTER = 'top_center',
  TOP_RIGHT = 'top_right',
  BOTTOM_LEFT = 'bottom_left',
  BOTTOM_CENTER = 'bottom_center',
  BOTTOM_RIGHT = 'bottom_right',
  CENTER = 'center',
  CUSTOM = 'custom'
}

export interface CaptionPreferences {
  fontSize: number;
  fontFamily: string;
  color: string;
  backgroundColor: string;
  position: DisplayPosition;
  opacity: number;
}

export interface AvatarPreferences {
  size: AvatarSize;
  position: DisplayPosition;
  dialect: SignDialect;
  appearance: AvatarAppearance;
  animationSpeed: number;
}

export interface AudioPreferences {
  noiseReduction: boolean;
  volumeThreshold: number;
  languagePreference: string[];
}

export interface AccessibilityPreferences {
  highContrast: boolean;
  keyboardNavigation: boolean;
  screenReaderCompatible: boolean;
}

export interface UserPreferences {
  captions: CaptionPreferences;
  avatar: AvatarPreferences;
  audio: AudioPreferences;
  accessibility: AccessibilityPreferences;
}

export interface UserProfile {
  id: string;
  name: string;
  preferences: UserPreferences;
  createdAt: number;
  updatedAt: number;
}
