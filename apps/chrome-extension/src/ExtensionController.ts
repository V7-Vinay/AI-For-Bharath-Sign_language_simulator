/**
 * Main Extension Controller
 * 
 * Orchestrates all extension components:
 * - Audio capture and preprocessing
 * - WebSocket communication
 * - UI management
 * - Storage and caching
 * - Latency monitoring
 */

import { AudioCapture } from './audio/AudioCapture';
import { UIController } from './ui/UIController';
import { StorageManager } from './storage/StorageManager';
import { IndexedDBCache } from './storage/IndexedDBCache';
import { WebSocketClient } from './websocket/WebSocketClient';
import { LatencyMonitor } from './monitoring/LatencyMonitor';

export class ExtensionController {
  private audioCapture: Audi