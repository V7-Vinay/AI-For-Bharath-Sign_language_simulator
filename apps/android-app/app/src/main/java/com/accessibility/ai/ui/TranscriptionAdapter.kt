package com.accessibility.ai.ui

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.accessibility.ai.databinding.ItemTranscriptionBinding
import com.accessibility.ai.model.Transcription

class TranscriptionAdapter : RecyclerView.Adapter<TranscriptionAdapter.TranscriptionViewHolder>() {
    
    private val transcriptions = mutableListOf<Transcription>()
    
    fun addTranscription(transcription: Transcription) {
        transcriptions.add(transcription)
        notifyItemInserted(transcriptions.size - 1)
    }
    
    fun clear() {
        transcriptions.clear()
        notifyDataSetChanged()
    }
    
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): TranscriptionViewHolder {
        val binding = ItemTranscriptionBinding.inflate(
            LayoutInflater.from(parent.context),
            parent,
            false
        )
        return TranscriptionViewHolder(binding)
    }
    
    override fun onBindViewHolder(holder: TranscriptionViewHolder, position: Int) {
        holder.bind(transcriptions[position])
    }
    
    override fun getItemCount(): Int = transcriptions.size
    
    class TranscriptionViewHolder(
        private val binding: ItemTranscriptionBinding
    ) : RecyclerView.ViewHolder(binding.root) {
        
        fun bind(transcription: Transcription) {
            binding.transcriptionText.text = transcription.text
            binding.timestampText.text = transcription.timestamp
            binding.languageText.text = transcription.language
        }
    }
}
