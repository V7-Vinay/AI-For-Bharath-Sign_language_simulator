package com.accessibility.ai

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.Menu
import android.view.MenuItem
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.accessibility.ai.databinding.ActivityMainBinding
import com.accessibility.ai.ui.TranscriptionAdapter
import com.accessibility.ai.viewmodel.MainViewModel
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {
    
    private lateinit var binding: ActivityMainBinding
    private lateinit var viewModel: MainViewModel
    private lateinit var transcriptionAdapter: TranscriptionAdapter
    
    companion object {
        private const val REQUEST_RECORD_AUDIO = 1001
    }
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        
        viewModel = ViewModelProvider(this)[MainViewModel::class.java]
        
        setupUI()
        setupObservers()
        checkPermissions()
    }
    
    private fun setupUI() {
        // Setup transcription RecyclerView
        transcriptionAdapter = TranscriptionAdapter()
        binding.transcriptionRecyclerView.apply {
            layoutManager = LinearLayoutManager(this@MainActivity)
            adapter = transcriptionAdapter
        }
        
        // Setup avatar view
        binding.avatarView.setOnClickListener {
            // Toggle avatar visibility or customization
        }
        
        // Setup control buttons
        binding.startButton.setOnClickListener {
            if (checkMicrophonePermission()) {
                startTranscription()
            } else {
                requestMicrophonePermission()
            }
        }
        
        binding.stopButton.setOnClickListener {
            stopTranscription()
        }
        
        binding.settingsButton.setOnClickListener {
            openSettings()
        }
    }
    
    private fun setupObservers() {
        // Observe transcription results
        lifecycleScope.launch {
            viewModel.transcriptionFlow.collect { transcription ->
                transcriptionAdapter.addTranscription(transcription)
                binding.transcriptionRecyclerView.smoothScrollToPosition(
                    transcriptionAdapter.itemCount - 1
                )
            }
        }
        
        // Observe animation sequences
        lifecycleScope.launch {
            viewModel.animationFlow.collect { animation ->
                binding.avatarView.renderAnimation(animation)
            }
        }
        
        // Observe recording state
        lifecycleScope.launch {
            viewModel.isRecording.collect { isRecording ->
                binding.startButton.isEnabled = !isRecording
                binding.stopButton.isEnabled = isRecording
                binding.recordingIndicator.visibility = 
                    if (isRecording) android.view.View.VISIBLE 
                    else android.view.View.GONE
            }
        }
    }
    
    private fun checkPermissions() {
        if (!checkMicrophonePermission()) {
            requestMicrophonePermission()
        }
    }
    
    private fun checkMicrophonePermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
    }
    
    private fun requestMicrophonePermission() {
        ActivityCompat.requestPermissions(
            this,
            arrayOf(Manifest.permission.RECORD_AUDIO),
            REQUEST_RECORD_AUDIO
        )
    }
    
    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        
        when (requestCode) {
            REQUEST_RECORD_AUDIO -> {
                if (grantResults.isNotEmpty() && 
                    grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                    // Permission granted
                } else {
                    // Permission denied
                    showPermissionDeniedDialog()
                }
            }
        }
    }
    
    private fun startTranscription() {
        viewModel.startTranscription()
    }
    
    private fun stopTranscription() {
        viewModel.stopTranscription()
    }
    
    private fun openSettings() {
        val intent = Intent(this, SettingsActivity::class.java)
        startActivity(intent)
    }
    
    private fun showPermissionDeniedDialog() {
        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("Microphone Permission Required")
            .setMessage("This app needs microphone access to provide transcription services.")
            .setPositiveButton("OK") { dialog, _ -> dialog.dismiss() }
            .show()
    }
    
    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menuInflater.inflate(R.menu.main_menu, menu)
        return true
    }
    
    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            R.id.action_settings -> {
                openSettings()
                true
            }
            R.id.action_clear -> {
                transcriptionAdapter.clear()
                true
            }
            else -> super.onOptionsItemSelected(item)
        }
    }
    
    override fun onPause() {
        super.onPause()
        // Pause transcription when app goes to background
        viewModel.pauseTranscription()
    }
    
    override fun onResume() {
        super.onResume()
        // Resume transcription when app comes to foreground
        viewModel.resumeTranscription()
    }
    
    override fun onDestroy() {
        super.onDestroy()
        viewModel.cleanup()
    }
}
