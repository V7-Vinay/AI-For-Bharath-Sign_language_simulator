package com.accessibility.ai.ui

import android.content.Context
import android.opengl.GLSurfaceView
import android.util.AttributeSet
import com.accessibility.ai.model.AnimationSequence
import com.accessibility.ai.renderer.AvatarRenderer

/**
 * Custom view for rendering sign language avatar
 */
class AvatarView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : GLSurfaceView(context, attrs) {
    
    private val renderer: AvatarRenderer
    
    init {
        // Set OpenGL ES 2.0 context
        setEGLContextClientVersion(2)
        
        // Create renderer
        renderer = AvatarRenderer(context)
        setRenderer(renderer)
        
        // Render on demand
        renderMode = RENDERMODE_WHEN_DIRTY
    }
    
    fun renderAnimation(animation: AnimationSequence) {
        renderer.setAnimation(animation)
        requestRender()
    }
    
    fun setAvatarCustomization(skinTone: String, clothing: String, size: String) {
        renderer.setCustomization(skinTone, clothing, size)
        requestRender()
    }
    
    fun stopAnimation() {
        renderer.stopAnimation()
    }
}
