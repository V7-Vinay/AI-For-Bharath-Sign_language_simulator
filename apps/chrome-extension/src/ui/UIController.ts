/**
 * UI Controller for Browser Extension
 * 
 * Manages overlay windows and user interactions:
 * - Transcription overlay (resizable)
 * - Avatar window (draggable)
 * - Control panel (start/stop, settings)
 * 
 * Requirements: 3.2, 3.3, 3.4
 */

export interface UserSettings {
  language: string;
  signLanguage: 'ASL' | 'BSL';
  avatarId: string;
  displaySettings: {
    fontSize: number;
    fontColor: string;
    backgroundColor: string;
    position: 'top' | 'bottom' | 'custom';
    customPosition?: { x: number; y: number };
  };
}

export class UIController {
  private transcriptionOverlay: HTMLDivElement | null = null;
  private avatarWindow: HTMLDivElement | null = null;
  private controlPanel: HTMLDivElement | null = null;
  private isActive: boolean = false;

  /**
   * Initialize UI components
   */
  initialize(): void {
    this.createTranscriptionOverlay();
    this.createAvatarWindow();
    this.createControlPanel();
  }

  /**
   * Show transcription overlay with text
   * Requirement: 3.2
   */
  showTranscriptionOverlay(text: string): void {
    if (!this.transcriptionOverlay) {
      this.createTranscriptionOverlay();
    }

    const contentDiv = this.transcriptionOverlay!.querySelector('.transcription-content') as HTMLDivElement;
    if (contentDiv) {
      contentDiv.textContent = text;
    }

    this.transcriptionOverlay!.style.display = 'block';
  }

  /**
   * Show avatar window
   * Requirement: 3.3
   */
  showAvatarWindow(): void {
    if (!this.avatarWindow) {
      this.createAvatarWindow();
    }

    this.avatarWindow!.style.display = 'block';
  }

  /**
   * Show control panel
   * Requirement: 3.4
   */
  showControlPanel(): void {
    if (!this.controlPanel) {
      this.createControlPanel();
    }

    this.controlPanel!.style.display = 'block';
  }

  /**
   * Hide all UI components
   */
  hideAll(): void {
    if (this.transcriptionOverlay) {
      this.transcriptionOverlay.style.display = 'none';
    }
    if (this.avatarWindow) {
      this.avatarWindow.style.display = 'none';
    }
    if (this.controlPanel) {
      this.controlPanel.style.display = 'none';
    }
  }

  /**
   * Update settings and apply to UI
   * Requirement: 3.4
   */
  updateSettings(settings: UserSettings): void {
    if (this.transcriptionOverlay) {
      const contentDiv = this.transcriptionOverlay.querySelector('.transcription-content') as HTMLDivElement;
      if (contentDiv) {
        contentDiv.style.fontSize = `${settings.displaySettings.fontSize}px`;
        contentDiv.style.color = settings.displaySettings.fontColor;
        contentDiv.style.backgroundColor = settings.displaySettings.backgroundColor;
      }

      // Update position
      if (settings.displaySettings.position === 'top') {
        this.transcriptionOverlay.style.top = '10px';
        this.transcriptionOverlay.style.bottom = 'auto';
      } else if (settings.displaySettings.position === 'bottom') {
        this.transcriptionOverlay.style.bottom = '10px';
        this.transcriptionOverlay.style.top = 'auto';
      } else if (settings.displaySettings.position === 'custom' && settings.displaySettings.customPosition) {
        this.transcriptionOverlay.style.left = `${settings.displaySettings.customPosition.x}px`;
        this.transcriptionOverlay.style.top = `${settings.displaySettings.customPosition.y}px`;
      }
    }
  }

  /**
   * Get avatar canvas for rendering
   */
  getAvatarCanvas(): HTMLCanvasElement | null {
    if (!this.avatarWindow) {
      return null;
    }
    return this.avatarWindow.querySelector('canvas');
  }

  /**
   * Set active state
   */
  setActive(active: boolean): void {
    this.isActive = active;
    if (this.controlPanel) {
      const startBtn = this.controlPanel.querySelector('.start-btn') as HTMLButtonElement;
      const stopBtn = this.controlPanel.querySelector('.stop-btn') as HTMLButtonElement;
      if (startBtn && stopBtn) {
        startBtn.disabled = active;
        stopBtn.disabled = !active;
      }
    }
  }

  /**
   * Create transcription overlay (resizable)
   * Requirement: 3.2
   */
  private createTranscriptionOverlay(): void {
    this.transcriptionOverlay = document.createElement('div');
    this.transcriptionOverlay.className = 'accessibility-ai-transcription-overlay';
    this.transcriptionOverlay.style.cssText = `
      position: fixed;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      width: 600px;
      min-height: 100px;
      max-height: 300px;
      background-color: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 15px;
      border-radius: 8px;
      z-index: 999999;
      display: none;
      resize: both;
      overflow: auto;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    `;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'transcription-content';
    contentDiv.style.cssText = `
      font-size: 16px;
      line-height: 1.5;
      word-wrap: break-word;
    `;

    this.transcriptionOverlay.appendChild(contentDiv);
    document.body.appendChild(this.transcriptionOverlay);
  }

  /**
   * Create avatar window (draggable)
   * Requirement: 3.3
   */
  private createAvatarWindow(): void {
    this.avatarWindow = document.createElement('div');
    this.avatarWindow.className = 'accessibility-ai-avatar-window';
    this.avatarWindow.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 300px;
      height: 400px;
      background-color: rgba(255, 255, 255, 0.95);
      border-radius: 8px;
      z-index: 999998;
      display: none;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
      cursor: move;
    `;

    // Create header for dragging
    const header = document.createElement('div');
    header.className = 'avatar-header';
    header.style.cssText = `
      padding: 10px;
      background-color: rgba(0, 0, 0, 0.1);
      border-radius: 8px 8px 0 0;
      cursor: move;
      user-select: none;
    `;
    header.textContent = 'Sign Language Avatar';

    // Create canvas for avatar rendering
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 350;
    canvas.style.cssText = `
      width: 100%;
      height: calc(100% - 40px);
      display: block;
    `;

    this.avatarWindow.appendChild(header);
    this.avatarWindow.appendChild(canvas);
    document.body.appendChild(this.avatarWindow);

    // Make draggable
    this.makeDraggable(this.avatarWindow, header);
  }

  /**
   * Create control panel
   * Requirement: 3.4
   */
  private createControlPanel(): void {
    this.controlPanel = document.createElement('div');
    this.controlPanel.className = 'accessibility-ai-control-panel';
    this.controlPanel.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      width: 250px;
      background-color: white;
      border-radius: 8px;
      padding: 15px;
      z-index: 999997;
      display: none;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    `;

    // Title
    const title = document.createElement('h3');
    title.textContent = 'Accessibility AI';
    title.style.cssText = `
      margin: 0 0 15px 0;
      font-size: 18px;
      color: #333;
    `;

    // Start button
    const startBtn = document.createElement('button');
    startBtn.className = 'start-btn';
    startBtn.textContent = 'Start';
    startBtn.style.cssText = `
      width: 100%;
      padding: 10px;
      margin-bottom: 10px;
      background-color: #4CAF50;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
    `;
    startBtn.onclick = () => this.onStartClick();

    // Stop button
    const stopBtn = document.createElement('button');
    stopBtn.className = 'stop-btn';
    stopBtn.textContent = 'Stop';
    stopBtn.disabled = true;
    stopBtn.style.cssText = `
      width: 100%;
      padding: 10px;
      margin-bottom: 10px;
      background-color: #f44336;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
    `;
    stopBtn.onclick = () => this.onStopClick();

    // Settings button
    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'settings-btn';
    settingsBtn.textContent = 'Settings';
    settingsBtn.style.cssText = `
      width: 100%;
      padding: 10px;
      background-color: #2196F3;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
    `;
    settingsBtn.onclick = () => this.onSettingsClick();

    this.controlPanel.appendChild(title);
    this.controlPanel.appendChild(startBtn);
    this.controlPanel.appendChild(stopBtn);
    this.controlPanel.appendChild(settingsBtn);
    document.body.appendChild(this.controlPanel);
  }

  /**
   * Make element draggable
   */
  private makeDraggable(element: HTMLElement, handle: HTMLElement): void {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

    handle.onmousedown = dragMouseDown;

    function dragMouseDown(e: MouseEvent) {
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }

    function elementDrag(e: MouseEvent) {
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      element.style.top = (element.offsetTop - pos2) + 'px';
      element.style.left = (element.offsetLeft - pos1) + 'px';
    }

    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
    }
  }

  /**
   * Event handlers (to be connected to main extension logic)
   */
  private onStartClick(): void {
    // Dispatch custom event for extension to handle
    window.dispatchEvent(new CustomEvent('accessibility-ai-start'));
  }

  private onStopClick(): void {
    window.dispatchEvent(new CustomEvent('accessibility-ai-stop'));
  }

  private onSettingsClick(): void {
    window.dispatchEvent(new CustomEvent('accessibility-ai-settings'));
  }
}
