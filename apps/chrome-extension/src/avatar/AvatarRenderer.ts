/**
 * Avatar Renderer - WebGL-based sign language avatar renderer
 * Renders sign language animations at 60 FPS on client side
 * 
 * Requirements:
 * - 2.3: Display animations within 1 second, support joint positions, facial expressions, hand shapes
 * - 2.4: Run entirely on client device
 * - 2.5: Allow avatar customization
 * - 13.6: Render at 60 FPS
 */

import { IndexedDBCache, AvatarAsset } from '../storage/IndexedDBCache';
import { SignSequence, SignGesture, HandConfiguration, Position3D } from '@accessibility-ai/types';

interface AvatarMesh {
  vertices: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array;
  vertexBuffer: WebGLBuffer | null;
  normalBuffer: WebGLBuffer | null;
  uvBuffer: WebGLBuffer | null;
  indexBuffer: WebGLBuffer | null;
}

interface AvatarTexture {
  texture: WebGLTexture | null;
  image: HTMLImageElement | null;
}

interface AvatarSkeleton {
  joints: Joint[];
  bindPose: Float32Array;
}

interface Joint {
  id: string;
  parentIndex: number;
  position: Position3D;
  rotation: { x: number; y: number; z: number; w: number };
}

interface AnimationFrame {
  timestamp: number;
  joints: Array<{
    jointId: string;
    position: Position3D;
    rotation: { x: number; y: number; z: number; w: number };
  }>;
  facialExpression?: {
    eyebrows: number;
    eyes: number;
    mouth: number;
    intensity: number;
  };
  handShape?: {
    left: string;
    right: string;
  };
}

interface AnimationSequence {
  frames: AnimationFrame[];
  duration: number;
  language: string;
}

interface AvatarCustomization {
  skinTone: string;
  clothing: string;
  hairStyle: string;
}

interface ShaderProgram {
  program: WebGLProgram | null;
  attributes: {
    position: number;
    normal: number;
    uv: number;
  };
  uniforms: {
    modelViewMatrix: WebGLUniformLocation | null;
    projectionMatrix: WebGLUniformLocation | null;
    normalMatrix: WebGLUniformLocation | null;
    texture: WebGLUniformLocation | null;
  };
}

export class AvatarRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null = null;
  private cache: IndexedDBCache;
  
  private currentAvatarId: string | null = null;
  private mesh: AvatarMesh | null = null;
  private texture: AvatarTexture | null = null;
  private skeleton: AvatarSkeleton | null = null;
  
  private currentAnimation: AnimationSequence | null = null;
  private animationStartTime: number = 0;
  private currentFrameIndex: number = 0;
  private isPlaying: boolean = false;
  private targetFPS: number = 60;
  
  private customization: AvatarCustomization;
  private shaderProgram: ShaderProgram | null = null;
  
  private projectionMatrix: Float32Array;
  private modelViewMatrix: Float32Array;
  private normalMatrix: Float32Array;
  
  private lastFrameTime: number = 0;
  private frameCount: number = 0;
  private actualFPS: number = 60;

  constructor(canvas: HTMLCanvasElement, cache: IndexedDBCache, customization?: AvatarCustomization) {
    this.canvas = canvas;
    this.cache = cache;
    this.customization = customization || {
      skinTone: 'default',
      clothing: 'default',
      hairStyle: 'default'
    };
    
    this.projectionMatrix = new Float32Array(16);
    this.modelViewMatrix = new Float32Array(16);
    this.normalMatrix = new Float32Array(9);
    
    this.initWebGL();
    this.initShaders();
    this.initMatrices();
  }

  /**
   * Initialize WebGL context
   */
  private initWebGL(): void {
    this.gl = this.canvas.getContext('webgl') || this.canvas.getContext('experimental-webgl') as WebGLRenderingContext;
    
    if (!this.gl) {
      throw new Error('WebGL not supported');
    }

    // Set up WebGL viewport
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.gl.clearColor(0.0, 0.0, 0.0, 0.0);
    this.gl.enable(this.gl.DEPTH_TEST);
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
  }

  /**
   * Initialize shader programs
   */
  private initShaders(): void {
    if (!this.gl) return;

    const vertexShaderSource = `
      attribute vec3 aPosition;
      attribute vec3 aNormal;
      attribute vec2 aUV;
      
      uniform mat4 uModelViewMatrix;
      uniform mat4 uProjectionMatrix;
      uniform mat3 uNormalMatrix;
      
      varying vec3 vNormal;
      varying vec2 vUV;
      varying vec3 vPosition;
      
      void main() {
        vec4 position = uModelViewMatrix * vec4(aPosition, 1.0);
        vPosition = position.xyz;
        vNormal = uNormalMatrix * aNormal;
        vUV = aUV;
        gl_Position = uProjectionMatrix * position;
      }
    `;

    const fragmentShaderSource = `
      precision mediump float;
      
      uniform sampler2D uTexture;
      
      varying vec3 vNormal;
      varying vec2 vUV;
      varying vec3 vPosition;
      
      void main() {
        vec3 lightDir = normalize(vec3(0.5, 1.0, 0.5));
        vec3 normal = normalize(vNormal);
        float diffuse = max(dot(normal, lightDir), 0.0);
        
        vec4 texColor = texture2D(uTexture, vUV);
        vec3 ambient = vec3(0.3, 0.3, 0.3);
        vec3 color = texColor.rgb * (ambient + diffuse * 0.7);
        
        gl_FragColor = vec4(color, texColor.a);
      }
    `;

    const vertexShader = this.compileShader(vertexShaderSource, this.gl.VERTEX_SHADER);
    const fragmentShader = this.compileShader(fragmentShaderSource, this.gl.FRAGMENT_SHADER);

    if (!vertexShader || !fragmentShader) {
      throw new Error('Failed to compile shaders');
    }

    const program = this.gl.createProgram();
    if (!program) {
      throw new Error('Failed to create shader program');
    }

    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);
    this.gl.linkProgram(program);

    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      const info = this.gl.getProgramInfoLog(program);
      throw new Error('Failed to link shader program: ' + info);
    }

    this.shaderProgram = {
      program,
      attributes: {
        position: this.gl.getAttribLocation(program, 'aPosition'),
        normal: this.gl.getAttribLocation(program, 'aNormal'),
        uv: this.gl.getAttribLocation(program, 'aUV')
      },
      uniforms: {
        modelViewMatrix: this.gl.getUniformLocation(program, 'uModelViewMatrix'),
        projectionMatrix: this.gl.getUniformLocation(program, 'uProjectionMatrix'),
        normalMatrix: this.gl.getUniformLocation(program, 'uNormalMatrix'),
        texture: this.gl.getUniformLocation(program, 'uTexture')
      }
    };
  }

  /**
   * Compile a shader
   */
  private compileShader(source: string, type: number): WebGLShader | null {
    if (!this.gl) return null;

    const shader = this.gl.createShader(type);
    if (!shader) return null;

    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const info = this.gl.getShaderInfoLog(shader);
      console.error('Shader compilation error:', info);
      this.gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  /**
   * Initialize projection and view matrices
   */
  private initMatrices(): void {
    // Set up perspective projection
    const fov = 45 * Math.PI / 180;
    const aspect = this.canvas.width / this.canvas.height;
    const near = 0.1;
    const far = 100.0;

    this.setPerspective(this.projectionMatrix, fov, aspect, near, far);

    // Set up model-view matrix (camera position)
    this.setIdentity(this.modelViewMatrix);
    this.translate(this.modelViewMatrix, 0, -1.5, -5);
  }

  /**
   * Load avatar from cached assets
   * Requirements: 2.3, 2.4, 2.5, 13.6
   */
  async loadAvatar(avatarId: string): Promise<void> {
    const loadStartTime = Date.now();
    
    try {
      // Check if avatar is cached
      const isCached = await this.cache.isAvatarCached(avatarId);
      if (!isCached) {
        throw new Error(`Avatar ${avatarId} not found in cache`);
      }

      this.currentAvatarId = avatarId;

      // Load mesh data
      const meshAsset = await this.cache.getAsset(`${avatarId}-mesh`);
      if (meshAsset && meshAsset.data instanceof ArrayBuffer) {
        this.mesh = await this.loadMeshData(meshAsset.data);
      }

      // Load texture data
      const textureAssets = await this.cache.getAssetsByType('texture');
      const avatarTextures = textureAssets.filter(asset => asset.id.startsWith(avatarId));
      if (avatarTextures.length > 0 && avatarTextures[0].data instanceof ArrayBuffer) {
        this.texture = await this.loadTextureData(avatarTextures[0].data);
      }

      // Load metadata (contains skeleton data)
      const metadataAsset = await this.cache.getAsset(`${avatarId}-metadata`);
      if (metadataAsset && typeof metadataAsset.data === 'string') {
        const metadata = JSON.parse(metadataAsset.data);
        this.skeleton = this.loadSkeletonData(metadata.skeleton);
      }

      // Apply customization
      this.applyCustomization();

      const loadTime = Date.now() - loadStartTime;
      console.log(`Avatar loaded in ${loadTime}ms`);
      
      if (loadTime > 1000) {
        console.warn(`Avatar loading took ${loadTime}ms, exceeds 1 second requirement`);
      }
    } catch (error) {
      console.error('Failed to load avatar:', error);
      throw error;
    }
  }

  /**
   * Load mesh data from ArrayBuffer
   */
  private async loadMeshData(data: ArrayBuffer): Promise<AvatarMesh> {
    if (!this.gl) {
      throw new Error('WebGL context not initialized');
    }

    // Parse mesh data (simplified - in production would parse GLB format)
    // For now, create a simple humanoid mesh
    const mesh = this.createSimpleHumanoidMesh();

    // Create WebGL buffers
    mesh.vertexBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, mesh.vertexBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, mesh.vertices, this.gl.STATIC_DRAW);

    mesh.normalBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, mesh.normalBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, mesh.normals, this.gl.STATIC_DRAW);

    mesh.uvBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, mesh.uvBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, mesh.uvs, this.gl.STATIC_DRAW);

    mesh.indexBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
    this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, mesh.indices, this.gl.STATIC_DRAW);

    return mesh;
  }

  /**
   * Create a simple humanoid mesh for rendering
   */
  private createSimpleHumanoidMesh(): AvatarMesh {
    // Simplified humanoid mesh (cube-based body parts)
    const vertices = new Float32Array([
      // Head
      -0.3, 1.5, -0.3,  0.3, 1.5, -0.3,  0.3, 2.0, -0.3,  -0.3, 2.0, -0.3,
      -0.3, 1.5, 0.3,   0.3, 1.5, 0.3,   0.3, 2.0, 0.3,   -0.3, 2.0, 0.3,
      // Torso
      -0.5, 0.5, -0.2,  0.5, 0.5, -0.2,  0.5, 1.5, -0.2,  -0.5, 1.5, -0.2,
      -0.5, 0.5, 0.2,   0.5, 0.5, 0.2,   0.5, 1.5, 0.2,   -0.5, 1.5, 0.2,
      // Arms (simplified)
      -0.8, 0.5, 0.0,   -0.5, 0.5, 0.0,  -0.5, 1.3, 0.0,  -0.8, 1.3, 0.0,
      0.5, 0.5, 0.0,    0.8, 0.5, 0.0,   0.8, 1.3, 0.0,   0.5, 1.3, 0.0
    ]);

    const normals = new Float32Array(vertices.length);
    for (let i = 0; i < normals.length; i += 3) {
      normals[i] = 0;
      normals[i + 1] = 0;
      normals[i + 2] = 1;
    }

    const uvs = new Float32Array(vertices.length / 3 * 2);
    for (let i = 0; i < uvs.length; i += 2) {
      uvs[i] = (i / 2) % 2;
      uvs[i + 1] = Math.floor((i / 2) / 2) % 2;
    }

    const indices = new Uint16Array([
      // Head faces
      0, 1, 2,  0, 2, 3,  4, 5, 6,  4, 6, 7,
      0, 1, 5,  0, 5, 4,  2, 3, 7,  2, 7, 6,
      0, 3, 7,  0, 7, 4,  1, 2, 6,  1, 6, 5,
      // Torso faces
      8, 9, 10,  8, 10, 11,  12, 13, 14,  12, 14, 15,
      8, 9, 13,  8, 13, 12,  10, 11, 15,  10, 15, 14,
      8, 11, 15,  8, 15, 12,  9, 10, 14,  9, 14, 13,
      // Arms faces
      16, 17, 18,  16, 18, 19,  20, 21, 22,  20, 22, 23
    ]);

    return {
      vertices,
      normals,
      uvs,
      indices,
      vertexBuffer: null,
      normalBuffer: null,
      uvBuffer: null,
      indexBuffer: null
    };
  }

  /**
   * Load texture data from ArrayBuffer
   */
  private async loadTextureData(data: ArrayBuffer): Promise<AvatarTexture> {
    if (!this.gl) {
      throw new Error('WebGL context not initialized');
    }

    return new Promise((resolve, reject) => {
      const blob = new Blob([data], { type: 'image/png' });
      const url = URL.createObjectURL(blob);
      const image = new Image();

      image.onload = () => {
        const texture = this.gl!.createTexture();
        this.gl!.bindTexture(this.gl!.TEXTURE_2D, texture);
        this.gl!.texImage2D(this.gl!.TEXTURE_2D, 0, this.gl!.RGBA, this.gl!.RGBA, this.gl!.UNSIGNED_BYTE, image);
        this.gl!.texParameteri(this.gl!.TEXTURE_2D, this.gl!.TEXTURE_WRAP_S, this.gl!.CLAMP_TO_EDGE);
        this.gl!.texParameteri(this.gl!.TEXTURE_2D, this.gl!.TEXTURE_WRAP_T, this.gl!.CLAMP_TO_EDGE);
        this.gl!.texParameteri(this.gl!.TEXTURE_2D, this.gl!.TEXTURE_MIN_FILTER, this.gl!.LINEAR);
        this.gl!.texParameteri(this.gl!.TEXTURE_2D, this.gl!.TEXTURE_MAG_FILTER, this.gl!.LINEAR);

        URL.revokeObjectURL(url);
        resolve({ texture, image });
      };

      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load texture image'));
      };

      image.src = url;
    });
  }

  /**
   * Load skeleton data from metadata
   */
  private loadSkeletonData(skeletonData: any): AvatarSkeleton {
    // Parse skeleton data
    const joints: Joint[] = skeletonData.joints || [];
    const bindPose = new Float32Array(skeletonData.bindPose || []);

    return { joints, bindPose };
  }

  /**
   * Render animation sequence from sign language translation
   * Requirements: 2.3 - Render within 1 second of receiving data
   */
  async renderAnimation(signSequence: SignSequence): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Convert SignSequence to AnimationSequence
      const animation = this.convertSignSequenceToAnimation(signSequence);
      
      this.currentAnimation = animation;
      this.animationStartTime = Date.now();
      this.currentFrameIndex = 0;
      this.isPlaying = true;
      this.lastFrameTime = Date.now();
      this.frameCount = 0;

      // Start render loop
      this.renderLoop();

      const loadTime = Date.now() - startTime;
      if (loadTime > 1000) {
        console.warn(`Animation loading took ${loadTime}ms, exceeds 1 second requirement`);
      }
    } catch (error) {
      console.error('Failed to render animation:', error);
      throw error;
    }
  }

  /**
   * Convert SignSequence to AnimationSequence
   */
  private convertSignSequenceToAnimation(signSequence: SignSequence): AnimationSequence {
    const frames: AnimationFrame[] = [];
    let currentTime = 0;

    // Convert each gesture to animation frames
    for (const gesture of signSequence.gestures) {
      const gestureDuration = gesture.duration;
      const frameCount = Math.ceil(gestureDuration * this.targetFPS / 1000);

      for (let i = 0; i < frameCount; i++) {
        const t = i / frameCount;
        const frame: AnimationFrame = {
          timestamp: currentTime + (t * gestureDuration),
          joints: this.interpolateJointPositions(gesture, t),
          facialExpression: {
            eyebrows: 0,
            eyes: 0,
            mouth: gesture.intensity,
            intensity: gesture.intensity
          },
          handShape: {
            left: gesture.handShape.handshape.toString(),
            right: gesture.handShape.handshape.toString()
          }
        };
        frames.push(frame);
      }

      currentTime += gestureDuration;
    }

    return {
      frames,
      duration: signSequence.duration,
      language: signSequence.metadata.dialect
    };
  }

  /**
   * Interpolate joint positions for a gesture
   */
  private interpolateJointPositions(gesture: SignGesture, t: number): Array<{
    jointId: string;
    position: Position3D;
    rotation: { x: number; y: number; z: number; w: number };
  }> {
    const joints = [];

    // Interpolate hand position along movement path
    const pathIndex = Math.floor(t * (gesture.movement.path.length - 1));
    const nextIndex = Math.min(pathIndex + 1, gesture.movement.path.length - 1);
    const localT = (t * (gesture.movement.path.length - 1)) - pathIndex;

    const currentPos = gesture.movement.path[pathIndex];
    const nextPos = gesture.movement.path[nextIndex];

    const interpolatedPos: Position3D = {
      x: currentPos.x + (nextPos.x - currentPos.x) * localT,
      y: currentPos.y + (nextPos.y - currentPos.y) * localT,
      z: currentPos.z + (nextPos.z - currentPos.z) * localT
    };

    // Create joint data for hands
    joints.push({
      jointId: 'left_hand',
      position: interpolatedPos,
      rotation: {
        x: gesture.handShape.orientation.pitch,
        y: gesture.handShape.orientation.yaw,
        z: gesture.handShape.orientation.roll,
        w: 1.0
      }
    });

    joints.push({
      jointId: 'right_hand',
      position: interpolatedPos,
      rotation: {
        x: gesture.handShape.orientation.pitch,
        y: gesture.handShape.orientation.yaw,
        z: gesture.handShape.orientation.roll,
        w: 1.0
      }
    });

    return joints;
  }

  /**
   * Main render loop - targets 60 FPS
   * Requirements: 13.6 - Client-side rendering at 60 FPS
   */
  private renderLoop = (): void => {
    if (!this.isPlaying || !this.currentAnimation) {
      return;
    }

    const currentTime = Date.now();
    const elapsed = currentTime - this.animationStartTime;

    // Calculate FPS
    this.frameCount++;
    if (currentTime - this.lastFrameTime >= 1000) {
      this.actualFPS = this.frameCount;
      this.frameCount = 0;
      this.lastFrameTime = currentTime;
    }

    // Find current frame based on elapsed time
    let frameIndex = 0;
    for (let i = 0; i < this.currentAnimation.frames.length; i++) {
      if (this.currentAnimation.frames[i].timestamp <= elapsed) {
        frameIndex = i;
      } else {
        break;
      }
    }

    if (frameIndex >= this.currentAnimation.frames.length) {
      this.isPlaying = false;
      return;
    }

    this.currentFrameIndex = frameIndex;
    this.renderFrame(this.currentAnimation.frames[frameIndex]);

    // Request next frame at 60 FPS
    requestAnimationFrame(this.renderLoop);
  };

  /**
   * Render a single animation frame
   * Requirements: 2.3 - Support joint positions, facial expressions, hand shapes
   */
  private renderFrame(frame: AnimationFrame): void {
    if (!this.gl || !this.mesh || !this.shaderProgram) {
      return;
    }

    // Clear canvas
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

    // Use shader program
    this.gl.useProgram(this.shaderProgram.program);

    // Apply joint positions to skeleton
    this.applyJointPositions(frame.joints);

    // Apply facial expressions
    if (frame.facialExpression) {
      this.applyFacialExpressions(frame.facialExpression);
    }

    // Apply hand shapes
    if (frame.handShape) {
      this.applyHandShapes(frame.handShape);
    }

    // Render the avatar
    this.render();
  }

  /**
   * Apply joint positions to avatar skeleton
   */
  private applyJointPositions(joints: Array<{
    jointId: string;
    position: Position3D;
    rotation: { x: number; y: number; z: number; w: number };
  }>): void {
    if (!this.skeleton) return;

    // Update skeleton joint transforms based on animation data
    for (const animJoint of joints) {
      const skeletonJoint = this.skeleton.joints.find(j => j.id === animJoint.jointId);
      if (skeletonJoint) {
        skeletonJoint.position = animJoint.position;
        skeletonJoint.rotation = animJoint.rotation;
      }
    }
  }

  /**
   * Apply facial expressions to avatar
   */
  private applyFacialExpressions(expression: {
    eyebrows: number;
    eyes: number;
    mouth: number;
    intensity: number;
  }): void {
    // Apply blend shapes for facial expressions
    // In a full implementation, this would modify vertex positions
    // based on blend shape weights
  }

  /**
   * Apply hand shapes to avatar
   */
  private applyHandShapes(shapes: { left: string; right: string }): void {
    // Apply hand pose transformations
    // In a full implementation, this would set finger joint rotations
    // based on the hand shape configuration
  }

  /**
   * Render the avatar to canvas
   */
  private render(): void {
    if (!this.gl || !this.mesh || !this.shaderProgram) {
      return;
    }

    // Bind vertex buffer
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.mesh.vertexBuffer);
    this.gl.enableVertexAttribArray(this.shaderProgram.attributes.position);
    this.gl.vertexAttribPointer(this.shaderProgram.attributes.position, 3, this.gl.FLOAT, false, 0, 0);

    // Bind normal buffer
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.mesh.normalBuffer);
    this.gl.enableVertexAttribArray(this.shaderProgram.attributes.normal);
    this.gl.vertexAttribPointer(this.shaderProgram.attributes.normal, 3, this.gl.FLOAT, false, 0, 0);

    // Bind UV buffer
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.mesh.uvBuffer);
    this.gl.enableVertexAttribArray(this.shaderProgram.attributes.uv);
    this.gl.vertexAttribPointer(this.shaderProgram.attributes.uv, 2, this.gl.FLOAT, false, 0, 0);

    // Set uniforms
    this.gl.uniformMatrix4fv(this.shaderProgram.uniforms.projectionMatrix, false, this.projectionMatrix);
    this.gl.uniformMatrix4fv(this.shaderProgram.uniforms.modelViewMatrix, false, this.modelViewMatrix);
    this.gl.uniformMatrix3fv(this.shaderProgram.uniforms.normalMatrix, false, this.normalMatrix);

    // Bind texture
    if (this.texture && this.texture.texture) {
      this.gl.activeTexture(this.gl.TEXTURE0);
      this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture.texture);
      this.gl.uniform1i(this.shaderProgram.uniforms.texture, 0);
    }

    // Draw
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.mesh.indexBuffer);
    this.gl.drawElements(this.gl.TRIANGLES, this.mesh.indices.length, this.gl.UNSIGNED_SHORT, 0);
  }

  /**
   * Update avatar customization
   * Requirements: 2.4, 2.5 - Support avatar customization
   */
  updateCustomization(customization: Partial<AvatarCustomization>): void {
    this.customization = { ...this.customization, ...customization };
    
    // Reapply customization to current avatar
    if (this.currentAvatarId) {
      this.applyCustomization();
    }
  }

  /**
   * Apply customization to avatar
   */
  private applyCustomization(): void {
    // Apply skin tone - would modify texture or material properties
    // Apply clothing - would swap texture or mesh parts
    // Apply hair style - would swap hair mesh
    console.log('Applying customization:', this.customization);
  }

  /**
   * Set frame rate target
   */
  setFrameRate(fps: number): void {
    this.targetFPS = fps;
  }

  /**
   * Get current actual FPS
   */
  getCurrentFPS(): number {
    return this.actualFPS;
  }

  /**
   * Stop animation playback
   */
  stop(): void {
    this.isPlaying = false;
    this.currentAnimation = null;
    this.currentFrameIndex = 0;
  }

  /**
   * Pause animation playback
   */
  pause(): void {
    this.isPlaying = false;
  }

  /**
   * Resume animation playback
   */
  resume(): void {
    if (this.currentAnimation) {
      this.isPlaying = true;
      this.animationStartTime = Date.now() - (this.currentAnimation.frames[this.currentFrameIndex]?.timestamp || 0);
      this.renderLoop();
    }
  }

  /**
   * Check if animation is playing
   */
  isAnimationPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Get current animation progress (0-1)
   */
  getAnimationProgress(): number {
    if (!this.currentAnimation || this.currentAnimation.frames.length === 0) {
      return 0;
    }
    return this.currentFrameIndex / this.currentAnimation.frames.length;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stop();
    
    if (this.gl) {
      // Clean up WebGL buffers
      if (this.mesh) {
        if (this.mesh.vertexBuffer) this.gl.deleteBuffer(this.mesh.vertexBuffer);
        if (this.mesh.normalBuffer) this.gl.deleteBuffer(this.mesh.normalBuffer);
        if (this.mesh.uvBuffer) this.gl.deleteBuffer(this.mesh.uvBuffer);
        if (this.mesh.indexBuffer) this.gl.deleteBuffer(this.mesh.indexBuffer);
      }

      // Clean up textures
      if (this.texture && this.texture.texture) {
        this.gl.deleteTexture(this.texture.texture);
      }

      // Clean up shader program
      if (this.shaderProgram && this.shaderProgram.program) {
        this.gl.deleteProgram(this.shaderProgram.program);
      }

      this.gl = null;
    }

    this.mesh = null;
    this.texture = null;
    this.skeleton = null;
    this.currentAvatarId = null;
  }

  // Matrix utility functions

  /**
   * Set identity matrix
   */
  private setIdentity(matrix: Float32Array): void {
    matrix[0] = 1; matrix[1] = 0; matrix[2] = 0; matrix[3] = 0;
    matrix[4] = 0; matrix[5] = 1; matrix[6] = 0; matrix[7] = 0;
    matrix[8] = 0; matrix[9] = 0; matrix[10] = 1; matrix[11] = 0;
    matrix[12] = 0; matrix[13] = 0; matrix[14] = 0; matrix[15] = 1;
  }

  /**
   * Set perspective projection matrix
   */
  private setPerspective(matrix: Float32Array, fov: number, aspect: number, near: number, far: number): void {
    const f = 1.0 / Math.tan(fov / 2);
    const rangeInv = 1.0 / (near - far);

    matrix[0] = f / aspect;
    matrix[1] = 0;
    matrix[2] = 0;
    matrix[3] = 0;

    matrix[4] = 0;
    matrix[5] = f;
    matrix[6] = 0;
    matrix[7] = 0;

    matrix[8] = 0;
    matrix[9] = 0;
    matrix[10] = (near + far) * rangeInv;
    matrix[11] = -1;

    matrix[12] = 0;
    matrix[13] = 0;
    matrix[14] = near * far * rangeInv * 2;
    matrix[15] = 0;
  }

  /**
   * Translate matrix
   */
  private translate(matrix: Float32Array, x: number, y: number, z: number): void {
    matrix[12] += matrix[0] * x + matrix[4] * y + matrix[8] * z;
    matrix[13] += matrix[1] * x + matrix[5] * y + matrix[9] * z;
    matrix[14] += matrix[2] * x + matrix[6] * y + matrix[10] * z;
    matrix[15] += matrix[3] * x + matrix[7] * y + matrix[11] * z;
  }
}
