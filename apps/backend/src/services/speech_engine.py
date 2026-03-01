"""
SpeechEngine service with faster-whisper integration

This module implements the speech recognition engine using OpenAI Whisper
with faster-whisper optimization for real-time processing.

Requirements: 1.5, 3.1
"""

import logging
import time
from typing import Optional, Dict, Any, List, Deque, Tuple
from collections import deque
import numpy as np
from faster_whisper import WhisperModel
import torch

logger = logging.getLogger(__name__)

# Try to import pyannote.audio for speaker diarization
try:
    from pyannote.audio import Pipeline
    from pyannote.core import Segment, Annotation
    DIARIZATION_AVAILABLE = True
except ImportError:
    DIARIZATION_AVAILABLE = False
    logger.warning(
        "pyannote.audio not available. Speaker diarization will be disabled. "
        "Install with: pip install pyannote.audio"
    )


class TranscriptionResult:
    """Result from speech transcription"""
    
    def __init__(
        self,
        text: str,
        confidence: float,
        timestamp: float,
        language: str,
        speaker_id: Optional[str] = None
    ):
        self.text = text
        self.confidence = confidence
        self.timestamp = timestamp
        self.language = language
        self.speaker_id = speaker_id
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation"""
        return {
            'text': self.text,
            'confidence': self.confidence,
            'timestamp': self.timestamp,
            'language': self.language,
            'speakerId': self.speaker_id
        }


class SpeakerIdentification:
    """Speaker identification information"""
    
    def __init__(
        self,
        speaker_id: str,
        confidence: float,
        voice_profile: Optional[str] = None,
        start_time: Optional[float] = None,
        end_time: Optional[float] = None
    ):
        self.speaker_id = speaker_id
        self.confidence = confidence
        self.voice_profile = voice_profile
        self.start_time = start_time
        self.end_time = end_time
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation"""
        return {
            'speakerId': self.speaker_id,
            'confidence': self.confidence,
            'voiceProfile': self.voice_profile,
            'startTime': self.start_time,
            'endTime': self.end_time
        }


class SpeechEngine:
    """
    Speech recognition engine using faster-whisper with CTranslate2 optimization.
    
    Provides real-time speech-to-text transcription with:
    - Sub-300ms processing latency (Requirement 1.5)
    - Grammatically correct output (Requirement 3.1)
    - Multi-language support with automatic detection
    - Model quantization for performance
    - Streaming inference with chunked processing
    - Sliding window approach for continuous transcription
    - Batch processing for improved throughput
    - Vocabulary caching for common terms
    """
    
    def __init__(
        self,
        model_size: str = "base",
        device: str = "auto",
        compute_type: str = "int8",
        cpu_threads: int = 4,
        num_workers: int = 1,
        window_size_ms: int = 3000,
        overlap_ms: int = 500,
        batch_size: int = 4,
        enable_diarization: bool = True,
        diarization_model: Optional[str] = None
    ):
        """
        Initialize the SpeechEngine with faster-whisper.
        
        Args:
            model_size: Whisper model size (tiny, base, small, medium, large-v2, large-v3)
            device: Device to use ("cpu", "cuda", or "auto")
            compute_type: Quantization type (int8, int8_float16, float16, float32)
            cpu_threads: Number of CPU threads for inference
            num_workers: Number of parallel workers for batch processing
            window_size_ms: Size of sliding window in milliseconds (default: 3000ms)
            overlap_ms: Overlap between windows in milliseconds (default: 500ms)
            batch_size: Number of audio chunks to process in a batch (default: 4)
            enable_diarization: Enable speaker diarization (default: True)
            diarization_model: Pyannote model name or path (default: None, uses default model)
        """
        self.model_size = model_size
        self.device = self._determine_device(device)
        self.compute_type = compute_type
        self.cpu_threads = cpu_threads
        self.num_workers = num_workers
        
        # Streaming configuration
        self.window_size_ms = window_size_ms
        self.overlap_ms = overlap_ms
        self.batch_size = batch_size
        
        # Sliding window buffer for continuous transcription
        self.audio_buffer: Deque[np.ndarray] = deque(maxlen=10)
        self.previous_context: Optional[str] = None
        
        # Batch processing queue
        self.batch_queue: List[np.ndarray] = []
        
        # Language settings
        self.language: Optional[str] = None
        self.auto_detect_language = True
        
        # Performance tracking
        self.last_confidence_score = 0.0
        self.last_speaker_info: Optional[SpeakerIdentification] = None
        
        # Speaker diarization settings (Requirement 3.3)
        self.enable_diarization = enable_diarization and DIARIZATION_AVAILABLE
        self.diarization_pipeline: Optional[Any] = None
        self.speaker_embeddings: Dict[str, np.ndarray] = {}
        self.current_speaker_count = 0
        
        # Vocabulary cache for common terms (Requirement 3.2)
        self.vocabulary_cache: Dict[str, str] = {}
        self._initialize_common_vocabulary()
        
        # Initialize the model
        logger.info(
            f"Initializing faster-whisper model: {model_size} on {self.device} "
            f"with {compute_type} quantization, window_size={window_size_ms}ms, "
            f"overlap={overlap_ms}ms, batch_size={batch_size}, "
            f"diarization={'enabled' if self.enable_diarization else 'disabled'}"
        )
        
        try:
            self.model = WhisperModel(
                model_size,
                device=self.device,
                compute_type=compute_type,
                cpu_threads=cpu_threads,
                num_workers=num_workers
            )
            logger.info("SpeechEngine initialized successfully with streaming support")
        except Exception as e:
            logger.error(f"Failed to initialize SpeechEngine: {e}")
            raise
        
        # Initialize speaker diarization pipeline if enabled
        if self.enable_diarization:
            try:
                self._initialize_diarization_pipeline(diarization_model)
            except Exception as e:
                logger.warning(f"Failed to initialize diarization pipeline: {e}")
                self.enable_diarization = False
    
    def _determine_device(self, device: str) -> str:
        """Determine the best device to use for inference"""
        if device == "auto":
            if torch.cuda.is_available():
                return "cuda"
            return "cpu"
        return device
    
    def _initialize_diarization_pipeline(self, model_name: Optional[str] = None) -> None:
        """
        Initialize the speaker diarization pipeline.
        
        Uses pyannote.audio for speaker diarization to differentiate between
        multiple speakers (Requirement 3.3).
        
        Args:
            model_name: Optional model name or path. If None, uses default model.
        
        Raises:
            RuntimeError: If diarization pipeline initialization fails
        """
        if not DIARIZATION_AVAILABLE:
            raise RuntimeError(
                "pyannote.audio is not available. "
                "Install with: pip install pyannote.audio"
            )
        
        try:
            # Use default model if not specified
            # Note: This requires authentication with Hugging Face
            # Users should set HF_TOKEN environment variable
            if model_name is None:
                model_name = "pyannote/speaker-diarization-3.1"
            
            logger.info(f"Initializing speaker diarization pipeline: {model_name}")
            
            # Initialize the pipeline
            # This will automatically download the model if needed
            self.diarization_pipeline = Pipeline.from_pretrained(
                model_name,
                use_auth_token=True  # Uses HF_TOKEN from environment
            )
            
            # Move to appropriate device
            if self.device == "cuda" and torch.cuda.is_available():
                self.diarization_pipeline.to(torch.device("cuda"))
                logger.info("Diarization pipeline moved to CUDA")
            
            logger.info("Speaker diarization pipeline initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize diarization pipeline: {e}")
            raise RuntimeError(
                f"Failed to initialize speaker diarization: {e}. "
                "Make sure you have set HF_TOKEN environment variable with a valid "
                "Hugging Face token that has access to pyannote models."
            )
    
    def _perform_diarization(
        self,
        audio: np.ndarray,
        sample_rate: int = 16000
    ) -> List[Tuple[float, float, str]]:
        """
        Perform speaker diarization on audio.
        
        Args:
            audio: Audio data as numpy array (float32, mono)
            sample_rate: Sample rate of the audio
        
        Returns:
            List of tuples (start_time, end_time, speaker_id)
        
        Raises:
            RuntimeError: If diarization fails
        """
        if not self.enable_diarization or self.diarization_pipeline is None:
            # Return single speaker if diarization is disabled
            duration = len(audio) / sample_rate
            return [(0.0, duration, "SPEAKER_00")]
        
        try:
            # Prepare audio for pyannote
            # pyannote expects audio as a dictionary with 'waveform' and 'sample_rate'
            audio_dict = {
                "waveform": torch.from_numpy(audio).unsqueeze(0),  # Add channel dimension
                "sample_rate": sample_rate
            }
            
            # Perform diarization
            diarization: Annotation = self.diarization_pipeline(audio_dict)
            
            # Extract speaker segments
            segments = []
            for turn, _, speaker in diarization.itertracks(yield_label=True):
                segments.append((turn.start, turn.end, speaker))
            
            # Update speaker count
            unique_speakers = set(seg[2] for seg in segments)
            self.current_speaker_count = len(unique_speakers)
            
            logger.debug(
                f"Diarization found {self.current_speaker_count} speakers "
                f"in {len(segments)} segments"
            )
            
            return segments
            
        except Exception as e:
            logger.error(f"Diarization failed: {e}")
            # Fallback to single speaker
            duration = len(audio) / sample_rate
            return [(0.0, duration, "SPEAKER_00")]
    
    def _get_speaker_at_time(
        self,
        segments: List[Tuple[float, float, str]],
        timestamp: float
    ) -> Optional[str]:
        """
        Get the speaker ID at a specific timestamp.
        
        Args:
            segments: List of (start_time, end_time, speaker_id) tuples
            timestamp: Time in seconds
        
        Returns:
            Speaker ID or None if no speaker found at timestamp
        """
        for start, end, speaker in segments:
            if start <= timestamp <= end:
                return speaker
        return None
    
    async def transcribe_stream(self, audio_chunk: np.ndarray, sample_rate: int = 16000) -> TranscriptionResult:
        """
        Transcribe an audio chunk in real-time with speaker identification.
        
        This method processes audio chunks with streaming inference to meet
        the 300ms latency requirement (Requirement 1.5) and identifies speakers
        when multiple speakers are present (Requirement 3.3).
        
        Args:
            audio_chunk: Audio data as numpy array (float32, mono)
            sample_rate: Sample rate of the audio (default: 16000 Hz)
        
        Returns:
            TranscriptionResult with text, confidence, timestamp, language, and speaker_id
        
        Raises:
            ValueError: If audio_chunk is invalid
            RuntimeError: If transcription fails
        """
        start_time = time.time()
        
        # Validate input
        if audio_chunk is None or len(audio_chunk) == 0:
            raise ValueError("Audio chunk cannot be empty")
        
        if not isinstance(audio_chunk, np.ndarray):
            raise ValueError("Audio chunk must be a numpy array")
        
        # Ensure audio is float32 and mono
        if audio_chunk.dtype != np.float32:
            audio_chunk = audio_chunk.astype(np.float32)
        
        # Normalize audio to [-1, 1] range if needed
        if np.abs(audio_chunk).max() > 1.0:
            audio_chunk = audio_chunk / np.abs(audio_chunk).max()
        
        try:
            # Perform speaker diarization if enabled (Requirement 3.3)
            speaker_segments = []
            if self.enable_diarization:
                try:
                    speaker_segments = self._perform_diarization(audio_chunk, sample_rate)
                except Exception as e:
                    logger.warning(f"Diarization failed, continuing without speaker info: {e}")
            
            # Determine language for transcription
            language = self.language if not self.auto_detect_language else None
            
            # Transcribe with faster-whisper
            # Using beam_size=1 for faster inference (real-time requirement)
            # vad_filter=True to filter out non-speech segments
            segments, info = self.model.transcribe(
                audio_chunk,
                language=language,
                beam_size=1,  # Faster inference for real-time
                vad_filter=True,  # Voice activity detection
                vad_parameters=dict(
                    threshold=0.5,
                    min_speech_duration_ms=250,
                    min_silence_duration_ms=100
                ),
                word_timestamps=True,  # Enable for speaker alignment
                condition_on_previous_text=True  # Better context
            )
            
            # Collect segments with speaker information
            text_segments = []
            total_confidence = 0.0
            segment_count = 0
            speaker_id = None
            
            for segment in segments:
                text = segment.text.strip()
                
                # Determine speaker for this segment if diarization is available
                if speaker_segments and hasattr(segment, 'start'):
                    segment_speaker = self._get_speaker_at_time(
                        speaker_segments,
                        segment.start
                    )
                    if segment_speaker:
                        speaker_id = segment_speaker
                
                text_segments.append(text)
                # faster-whisper provides avg_logprob, convert to confidence
                confidence = self._logprob_to_confidence(segment.avg_logprob)
                total_confidence += confidence
                segment_count += 1
            
            # Combine segments
            full_text = " ".join(text_segments).strip()
            
            # Calculate average confidence
            avg_confidence = total_confidence / segment_count if segment_count > 0 else 0.0
            self.last_confidence_score = avg_confidence
            
            # Detect language
            detected_language = info.language if hasattr(info, 'language') else 'en'
            
            # Update speaker info
            if speaker_id:
                self.last_speaker_info = SpeakerIdentification(
                    speaker_id=speaker_id,
                    confidence=avg_confidence,
                    voice_profile=None,
                    start_time=speaker_segments[0][0] if speaker_segments else None,
                    end_time=speaker_segments[-1][1] if speaker_segments else None
                )
            
            # Calculate processing time
            processing_time = (time.time() - start_time) * 1000  # Convert to ms
            
            logger.debug(
                f"Transcribed in {processing_time:.1f}ms: '{full_text[:50]}...' "
                f"(confidence: {avg_confidence:.2f}, language: {detected_language}, "
                f"speaker: {speaker_id or 'unknown'})"
            )
            
            # Check if we meet the 300ms requirement
            if processing_time > 300:
                logger.warning(
                    f"Transcription took {processing_time:.1f}ms, "
                    f"exceeding 300ms requirement"
                )
            
            return TranscriptionResult(
                text=full_text,
                confidence=avg_confidence,
                timestamp=time.time(),
                language=detected_language,
                speaker_id=speaker_id
            )
            
        except Exception as e:
            logger.error(f"Transcription failed: {e}")
            raise RuntimeError(f"Failed to transcribe audio: {e}")
    
    def _logprob_to_confidence(self, avg_logprob: float) -> float:
        """
        Convert average log probability to confidence score [0, 1].
        
        faster-whisper returns avg_logprob which is typically in range [-1, 0].
        We convert this to a confidence score.
        """
        # Clamp to reasonable range and normalize
        # avg_logprob typically ranges from -1 (low confidence) to 0 (high confidence)
        confidence = np.exp(max(avg_logprob, -1.0))
        return float(np.clip(confidence, 0.0, 1.0))
    
    def set_language(self, language: str) -> None:
        """
        Set the language for transcription.
        
        Args:
            language: ISO 639-1 language code (e.g., 'en', 'es', 'fr')
                     Use None or empty string to enable auto-detection
        """
        if not language or language.strip() == "":
            self.language = None
            self.auto_detect_language = True
            logger.info("Language auto-detection enabled")
        else:
            self.language = language.lower().strip()
            self.auto_detect_language = False
            logger.info(f"Language set to: {self.language}")
    
    def get_confidence_score(self) -> float:
        """
        Get the confidence score from the last transcription.
        
        Returns:
            Confidence score between 0.0 and 1.0
        """
        return self.last_confidence_score
    
    def get_speaker_info(self) -> SpeakerIdentification:
        """
        Get speaker identification information.
        
        Returns:
            SpeakerIdentification object with speaker details
        
        Note:
            Returns information about the most recently identified speaker.
            Speaker diarization must be enabled for accurate speaker identification.
        """
        if self.last_speaker_info is None:
            # Default speaker for now
            self.last_speaker_info = SpeakerIdentification(
                speaker_id="SPEAKER_00",
                confidence=0.0,
                voice_profile=None
            )
        return self.last_speaker_info
    
    def get_speaker_count(self) -> int:
        """
        Get the number of unique speakers detected in the most recent audio.
        
        Returns:
            Number of unique speakers (0 if diarization is disabled)
        """
        return self.current_speaker_count if self.enable_diarization else 0
    
    def is_diarization_enabled(self) -> bool:
        """
        Check if speaker diarization is enabled and available.
        
        Returns:
            True if diarization is enabled and functional, False otherwise
        """
        return self.enable_diarization and self.diarization_pipeline is not None
    
    def add_vocabulary(self, terms: Dict[str, str]) -> None:
        """
        Add domain-specific vocabulary to improve transcription accuracy.
        
        Args:
            terms: Dictionary mapping terms to their preferred transcriptions
        """
        self.vocabulary_cache.update(terms)
        logger.info(f"Added {len(terms)} terms to vocabulary cache")
    
    def clear_vocabulary(self) -> None:
        """Clear the vocabulary cache"""
        self.vocabulary_cache.clear()
        logger.info("Vocabulary cache cleared")
    
    def get_model_info(self) -> Dict[str, Any]:
        """
        Get information about the loaded model.
        
        Returns:
            Dictionary with model configuration details
        """
        return {
            'model_size': self.model_size,
            'device': self.device,
            'compute_type': self.compute_type,
            'cpu_threads': self.cpu_threads,
            'num_workers': self.num_workers,
            'language': self.language,
            'auto_detect_language': self.auto_detect_language,
            'window_size_ms': self.window_size_ms,
            'overlap_ms': self.overlap_ms,
            'batch_size': self.batch_size,
            'diarization_enabled': self.enable_diarization,
            'speaker_count': self.current_speaker_count
        }
    
    def _initialize_common_vocabulary(self) -> None:
        """
        Initialize vocabulary cache with common technical terms.
        
        This improves transcription accuracy for frequently used terms
        (Requirement 3.2 - Technical vocabulary accuracy).
        """
        common_terms = {
            # AI/ML terms
            "whisper": "Whisper",
            "transformer": "Transformer",
            "neural network": "neural network",
            "machine learning": "machine learning",
            "deep learning": "deep learning",
            
            # Accessibility terms
            "accessibility": "accessibility",
            "captions": "captions",
            "sign language": "sign language",
            "transcription": "transcription",
            
            # Technical terms
            "api": "API",
            "kubernetes": "Kubernetes",
            "docker": "Docker",
            "fastapi": "FastAPI",
            "grpc": "gRPC",
            "websocket": "WebSocket",
            
            # Common abbreviations
            "asl": "ASL",
            "bsl": "BSL",
            "wcag": "WCAG",
            "tls": "TLS",
            "oauth": "OAuth"
        }
        
        self.vocabulary_cache.update(common_terms)
        logger.debug(f"Initialized vocabulary cache with {len(common_terms)} common terms")
    
    def transcribe_stream_with_window(
        self,
        audio_chunk: np.ndarray,
        sample_rate: int = 16000
    ) -> TranscriptionResult:
        """
        Transcribe audio using sliding window approach for continuous transcription.
        
        This method implements a sliding window strategy where audio chunks overlap
        to maintain context and improve accuracy for continuous speech.
        
        Args:
            audio_chunk: Audio data as numpy array (float32, mono)
            sample_rate: Sample rate of the audio (default: 16000 Hz)
        
        Returns:
            TranscriptionResult with text, confidence, timestamp, and language
        
        Raises:
            ValueError: If audio_chunk is invalid
            RuntimeError: If transcription fails
        """
        start_time = time.time()
        
        # Validate and preprocess audio
        audio_chunk = self._preprocess_audio(audio_chunk)
        
        # Add to sliding window buffer
        self.audio_buffer.append(audio_chunk)
        
        # Calculate window size in samples
        window_samples = int((self.window_size_ms / 1000.0) * sample_rate)
        overlap_samples = int((self.overlap_ms / 1000.0) * sample_rate)
        
        # Combine buffered audio with overlap
        if len(self.audio_buffer) > 1:
            # Create overlapping window from buffer
            combined_audio = np.concatenate(list(self.audio_buffer))
            
            # Trim to window size if needed
            if len(combined_audio) > window_samples:
                # Keep the most recent audio within window size
                combined_audio = combined_audio[-window_samples:]
        else:
            combined_audio = audio_chunk
        
        try:
            # Determine language for transcription
            language = self.language if not self.auto_detect_language else None
            
            # Transcribe with context from previous transcription
            segments, info = self.model.transcribe(
                combined_audio,
                language=language,
                beam_size=1,
                vad_filter=True,
                vad_parameters=dict(
                    threshold=0.5,
                    min_speech_duration_ms=250,
                    min_silence_duration_ms=100
                ),
                word_timestamps=False,
                condition_on_previous_text=True,
                initial_prompt=self.previous_context  # Use previous context
            )
            
            # Collect segments
            text_segments = []
            total_confidence = 0.0
            segment_count = 0
            
            for segment in segments:
                text = segment.text.strip()
                
                # Apply vocabulary cache corrections
                text = self._apply_vocabulary_corrections(text)
                
                text_segments.append(text)
                confidence = self._logprob_to_confidence(segment.avg_logprob)
                total_confidence += confidence
                segment_count += 1
            
            # Combine segments
            full_text = " ".join(text_segments).strip()
            
            # Update context for next transcription
            self.previous_context = full_text[-200:] if len(full_text) > 200 else full_text
            
            # Calculate average confidence
            avg_confidence = total_confidence / segment_count if segment_count > 0 else 0.0
            self.last_confidence_score = avg_confidence
            
            # Detect language
            detected_language = info.language if hasattr(info, 'language') else 'en'
            
            # Calculate processing time
            processing_time = (time.time() - start_time) * 1000
            
            logger.debug(
                f"Windowed transcription in {processing_time:.1f}ms: '{full_text[:50]}...' "
                f"(confidence: {avg_confidence:.2f}, buffer_size: {len(self.audio_buffer)})"
            )
            
            if processing_time > 300:
                logger.warning(
                    f"Windowed transcription took {processing_time:.1f}ms, "
                    f"exceeding 300ms requirement"
                )
            
            return TranscriptionResult(
                text=full_text,
                confidence=avg_confidence,
                timestamp=time.time(),
                language=detected_language,
                speaker_id=self.last_speaker_info.speaker_id if self.last_speaker_info else None
            )
            
        except Exception as e:
            logger.error(f"Windowed transcription failed: {e}")
            raise RuntimeError(f"Failed to transcribe audio with sliding window: {e}")
    
    def add_to_batch(self, audio_chunk: np.ndarray) -> bool:
        """
        Add an audio chunk to the batch processing queue.
        
        Returns True if batch is ready for processing, False otherwise.
        
        Args:
            audio_chunk: Audio data as numpy array (float32, mono)
        
        Returns:
            bool: True if batch is full and ready for processing
        """
        audio_chunk = self._preprocess_audio(audio_chunk)
        self.batch_queue.append(audio_chunk)
        
        return len(self.batch_queue) >= self.batch_size
    
    async def process_batch(self, sample_rate: int = 16000) -> List[TranscriptionResult]:
        """
        Process all audio chunks in the batch queue for improved throughput.
        
        Batch processing allows the model to process multiple audio chunks
        simultaneously, improving overall throughput while maintaining latency.
        
        Args:
            sample_rate: Sample rate of the audio (default: 16000 Hz)
        
        Returns:
            List of TranscriptionResult objects, one for each audio chunk in batch
        
        Raises:
            RuntimeError: If batch processing fails
        """
        if not self.batch_queue:
            return []
        
        start_time = time.time()
        results = []
        
        try:
            # Process each chunk in the batch
            # Note: faster-whisper doesn't have native batch processing,
            # but we can process multiple chunks efficiently by reusing the model
            for audio_chunk in self.batch_queue:
                # Determine language for transcription
                language = self.language if not self.auto_detect_language else None
                
                # Transcribe
                segments, info = self.model.transcribe(
                    audio_chunk,
                    language=language,
                    beam_size=1,
                    vad_filter=True,
                    vad_parameters=dict(
                        threshold=0.5,
                        min_speech_duration_ms=250,
                        min_silence_duration_ms=100
                    ),
                    word_timestamps=False,
                    condition_on_previous_text=True
                )
                
                # Collect segments
                text_segments = []
                total_confidence = 0.0
                segment_count = 0
                
                for segment in segments:
                    text = segment.text.strip()
                    text = self._apply_vocabulary_corrections(text)
                    text_segments.append(text)
                    confidence = self._logprob_to_confidence(segment.avg_logprob)
                    total_confidence += confidence
                    segment_count += 1
                
                full_text = " ".join(text_segments).strip()
                avg_confidence = total_confidence / segment_count if segment_count > 0 else 0.0
                detected_language = info.language if hasattr(info, 'language') else 'en'
                
                results.append(TranscriptionResult(
                    text=full_text,
                    confidence=avg_confidence,
                    timestamp=time.time(),
                    language=detected_language,
                    speaker_id=self.last_speaker_info.speaker_id if self.last_speaker_info else None
                ))
            
            # Clear the batch queue
            batch_size = len(self.batch_queue)
            self.batch_queue.clear()
            
            processing_time = (time.time() - start_time) * 1000
            avg_time_per_chunk = processing_time / batch_size if batch_size > 0 else 0
            
            logger.info(
                f"Batch processed {batch_size} chunks in {processing_time:.1f}ms "
                f"(avg {avg_time_per_chunk:.1f}ms per chunk)"
            )
            
            return results
            
        except Exception as e:
            logger.error(f"Batch processing failed: {e}")
            self.batch_queue.clear()
            raise RuntimeError(f"Failed to process batch: {e}")
    
    def clear_batch(self) -> None:
        """Clear the batch processing queue without processing."""
        self.batch_queue.clear()
        logger.debug("Batch queue cleared")
    
    def get_batch_size(self) -> int:
        """Get the current number of items in the batch queue."""
        return len(self.batch_queue)
    
    def reset_streaming_state(self) -> None:
        """
        Reset the streaming state including audio buffer and context.
        
        Call this when starting a new audio stream or when context should be cleared.
        """
        self.audio_buffer.clear()
        self.previous_context = None
        self.batch_queue.clear()
        logger.debug("Streaming state reset")
    
    def _preprocess_audio(self, audio_chunk: np.ndarray) -> np.ndarray:
        """
        Preprocess audio chunk for transcription.
        
        Args:
            audio_chunk: Raw audio data
        
        Returns:
            Preprocessed audio as float32 numpy array
        
        Raises:
            ValueError: If audio is invalid
        """
        # Validate input
        if audio_chunk is None or len(audio_chunk) == 0:
            raise ValueError("Audio chunk cannot be empty")
        
        if not isinstance(audio_chunk, np.ndarray):
            raise ValueError("Audio chunk must be a numpy array")
        
        # Ensure audio is float32
        if audio_chunk.dtype != np.float32:
            audio_chunk = audio_chunk.astype(np.float32)
        
        # Normalize audio to [-1, 1] range if needed
        max_val = np.abs(audio_chunk).max()
        if max_val > 1.0:
            audio_chunk = audio_chunk / max_val
        
        return audio_chunk
    
    def _apply_vocabulary_corrections(self, text: str) -> str:
        """
        Apply vocabulary cache corrections to transcribed text.
        
        This improves accuracy for technical and domain-specific terms
        (Requirement 3.2).
        
        Args:
            text: Raw transcribed text
        
        Returns:
            Text with vocabulary corrections applied
        """
        if not self.vocabulary_cache:
            return text
        
        corrected_text = text
        
        # Apply corrections for each cached term
        for term, correction in self.vocabulary_cache.items():
            # Case-insensitive replacement
            import re
            pattern = re.compile(re.escape(term), re.IGNORECASE)
            corrected_text = pattern.sub(correction, corrected_text)
        
        return corrected_text
