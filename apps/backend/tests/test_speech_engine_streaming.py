"""
Unit tests for SpeechEngine streaming inference features

Tests streaming inference with chunked processing, sliding window approach,
batch processing, and vocabulary caching.

Requirements: 1.5, 3.2
"""

import pytest
import numpy as np
import asyncio
from unittest.mock import Mock, patch, MagicMock
import sys
import os

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from services.speech_engine import SpeechEngine, TranscriptionResult


@pytest.fixture
def speech_engine():
    """Create a SpeechEngine instance for testing with streaming features"""
    with patch('services.speech_engine.WhisperModel') as mock_model:
        engine = SpeechEngine(
            model_size="tiny",
            device="cpu",
            compute_type="int8",
            window_size_ms=3000,
            overlap_ms=500,
            batch_size=4
        )
        engine.model = mock_model.return_value
        yield engine


@pytest.fixture
def sample_audio():
    """Generate sample audio data for testing"""
    sample_rate = 16000
    duration = 1.0
    samples = int(sample_rate * duration)
    
    frequency = 440.0
    t = np.linspace(0, duration, samples, dtype=np.float32)
    audio = 0.5 * np.sin(2 * np.pi * frequency * t)
    
    return audio


class TestStreamingConfiguration:
    """Test streaming configuration initialization"""
    
    def test_initialization_with_streaming_params(self):
        """Test initialization with streaming parameters"""
        with patch('services.speech_engine.WhisperModel') as mock_model:
            engine = SpeechEngine(
                window_size_ms=2000,
                overlap_ms=300,
                batch_size=8
            )
            
            assert engine.window_size_ms == 2000
            assert engine.overlap_ms == 300
            assert engine.batch_size == 8
            assert len(engine.audio_buffer) == 0
            assert engine.previous_context is None
            assert len(engine.batch_queue) == 0
    
    def test_vocabulary_cache_initialized(self, speech_engine):
        """Test that vocabulary cache is initialized with common terms"""
        assert len(speech_engine.vocabulary_cache) > 0
        
        # Check for some expected terms
        assert "whisper" in speech_engine.vocabulary_cache
        assert "api" in speech_engine.vocabulary_cache
        assert "accessibility" in speech_engine.vocabulary_cache


class TestSlidingWindowTranscription:
    """Test sliding window approach for continuous transcription"""
    
    def test_transcribe_stream_with_window_basic(self, speech_engine, sample_audio):
        """Test basic windowed transcription"""
        mock_segment = Mock()
        mock_segment.text = "Hello world"
        mock_segment.avg_logprob = -0.2
        
        mock_info = Mock()
        mock_info.language = "en"
        
        speech_engine.model.transcribe.return_value = ([mock_segment], mock_info)
        
        result = speech_engine.transcribe_stream_with_window(sample_audio)
        
        assert isinstance(result, TranscriptionResult)
        assert result.text == "Hello world"
        assert len(speech_engine.audio_buffer) == 1
    
    def test_transcribe_stream_with_window_builds_buffer(self, speech_engine, sample_audio):
        """Test that audio buffer accumulates chunks"""
        mock_segment = Mock()
        mock_segment.text = "Test"
        mock_segment.avg_logprob = -0.2
        
        mock_info = Mock()
        mock_info.language = "en"
        
        speech_engine.model.transcribe.return_value = ([mock_segment], mock_info)
        
        # Process multiple chunks
        for i in range(5):
            result = speech_engine.transcribe_stream_with_window(sample_audio)
            assert len(speech_engine.audio_buffer) == min(i + 1, 10)  # maxlen=10
    
    def test_transcribe_stream_with_window_maintains_context(self, speech_engine, sample_audio):
        """Test that previous context is maintained"""
        mock_segment = Mock()
        mock_segment.text = "This is a test sentence"
        mock_segment.avg_logprob = -0.2
        
        mock_info = Mock()
        mock_info.language = "en"
        
        speech_engine.model.transcribe.return_value = ([mock_segment], mock_info)
        
        result = speech_engine.transcribe_stream_with_window(sample_audio)
        
        assert speech_engine.previous_context is not None
        assert "This is a test sentence" in speech_engine.previous_context
    
    def test_transcribe_stream_with_window_context_truncation(self, speech_engine, sample_audio):
        """Test that context is truncated to 200 characters"""
        long_text = "A" * 300
        
        mock_segment = Mock()
        mock_segment.text = long_text
        mock_segment.avg_logprob = -0.2
        
        mock_info = Mock()
        mock_info.language = "en"
        
        speech_engine.model.transcribe.return_value = ([mock_segment], mock_info)
        
        result = speech_engine.transcribe_stream_with_window(sample_audio)
        
        assert len(speech_engine.previous_context) == 200
    
    def test_transcribe_stream_with_window_applies_vocabulary(self, speech_engine, sample_audio):
        """Test that vocabulary corrections are applied"""
        mock_segment = Mock()
        mock_segment.text = "Using whisper and fastapi"
        mock_segment.avg_logprob = -0.2
        
        mock_info = Mock()
        mock_info.language = "en"
        
        speech_engine.model.transcribe.return_value = ([mock_segment], mock_info)
        
        result = speech_engine.transcribe_stream_with_window(sample_audio)
        
        # Should apply vocabulary corrections
        assert "Whisper" in result.text or "whisper" in result.text
        assert "FastAPI" in result.text or "fastapi" in result.text


class TestBatchProcessing:
    """Test batch processing for improved throughput"""
    
    def test_add_to_batch_single_chunk(self, speech_engine, sample_audio):
        """Test adding a single chunk to batch"""
        is_ready = speech_engine.add_to_batch(sample_audio)
        
        assert speech_engine.get_batch_size() == 1
        assert is_ready is False  # Not ready until batch_size reached
    
    def test_add_to_batch_until_full(self, speech_engine, sample_audio):
        """Test adding chunks until batch is full"""
        for i in range(3):
            is_ready = speech_engine.add_to_batch(sample_audio)
            assert is_ready is False
        
        # Fourth chunk should make it ready
        is_ready = speech_engine.add_to_batch(sample_audio)
        assert is_ready is True
        assert speech_engine.get_batch_size() == 4
    
    @pytest.mark.asyncio
    async def test_process_batch_empty(self, speech_engine):
        """Test processing empty batch returns empty list"""
        results = await speech_engine.process_batch()
        
        assert results == []
    
    @pytest.mark.asyncio
    async def test_process_batch_single_chunk(self, speech_engine, sample_audio):
        """Test processing batch with single chunk"""
        mock_segment = Mock()
        mock_segment.text = "Test"
        mock_segment.avg_logprob = -0.2
        
        mock_info = Mock()
        mock_info.language = "en"
        
        speech_engine.model.transcribe.return_value = ([mock_segment], mock_info)
        
        speech_engine.add_to_batch(sample_audio)
        results = await speech_engine.process_batch()
        
        assert len(results) == 1
        assert results[0].text == "Test"
        assert speech_engine.get_batch_size() == 0  # Queue cleared
    
    @pytest.mark.asyncio
    async def test_process_batch_multiple_chunks(self, speech_engine, sample_audio):
        """Test processing batch with multiple chunks"""
        mock_segment1 = Mock()
        mock_segment1.text = "First"
        mock_segment1.avg_logprob = -0.2
        
        mock_segment2 = Mock()
        mock_segment2.text = "Second"
        mock_segment2.avg_logprob = -0.2
        
        mock_info = Mock()
        mock_info.language = "en"
        
        # Return different results for each call
        speech_engine.model.transcribe.side_effect = [
            ([mock_segment1], mock_info),
            ([mock_segment2], mock_info)
        ]
        
        speech_engine.add_to_batch(sample_audio)
        speech_engine.add_to_batch(sample_audio)
        results = await speech_engine.process_batch()
        
        assert len(results) == 2
        assert results[0].text == "First"
        assert results[1].text == "Second"
        assert speech_engine.get_batch_size() == 0
    
    @pytest.mark.asyncio
    async def test_process_batch_applies_vocabulary(self, speech_engine, sample_audio):
        """Test that batch processing applies vocabulary corrections"""
        mock_segment = Mock()
        mock_segment.text = "Using kubernetes and docker"
        mock_segment.avg_logprob = -0.2
        
        mock_info = Mock()
        mock_info.language = "en"
        
        speech_engine.model.transcribe.return_value = ([mock_segment], mock_info)
        
        speech_engine.add_to_batch(sample_audio)
        results = await speech_engine.process_batch()
        
        assert len(results) == 1
        # Vocabulary corrections should be applied
        assert "Kubernetes" in results[0].text or "kubernetes" in results[0].text
    
    def test_clear_batch(self, speech_engine, sample_audio):
        """Test clearing batch queue"""
        speech_engine.add_to_batch(sample_audio)
        speech_engine.add_to_batch(sample_audio)
        
        assert speech_engine.get_batch_size() == 2
        
        speech_engine.clear_batch()
        
        assert speech_engine.get_batch_size() == 0
    
    def test_get_batch_size(self, speech_engine, sample_audio):
        """Test getting batch size"""
        assert speech_engine.get_batch_size() == 0
        
        speech_engine.add_to_batch(sample_audio)
        assert speech_engine.get_batch_size() == 1
        
        speech_engine.add_to_batch(sample_audio)
        assert speech_engine.get_batch_size() == 2


class TestVocabularyCaching:
    """Test vocabulary caching for common terms"""
    
    def test_vocabulary_cache_initialized_with_common_terms(self, speech_engine):
        """Test that common terms are pre-loaded"""
        assert "whisper" in speech_engine.vocabulary_cache
        assert "transformer" in speech_engine.vocabulary_cache
        assert "accessibility" in speech_engine.vocabulary_cache
        assert "api" in speech_engine.vocabulary_cache
        assert "kubernetes" in speech_engine.vocabulary_cache
    
    def test_add_vocabulary_custom_terms(self, speech_engine):
        """Test adding custom vocabulary terms"""
        custom_terms = {
            "myapp": "MyApp",
            "customterm": "CustomTerm"
        }
        
        initial_size = len(speech_engine.vocabulary_cache)
        speech_engine.add_vocabulary(custom_terms)
        
        assert len(speech_engine.vocabulary_cache) == initial_size + 2
        assert speech_engine.vocabulary_cache["myapp"] == "MyApp"
    
    def test_apply_vocabulary_corrections_basic(self, speech_engine):
        """Test applying vocabulary corrections to text"""
        text = "using whisper and fastapi"
        corrected = speech_engine._apply_vocabulary_corrections(text)
        
        # Should apply corrections (case-insensitive)
        assert "Whisper" in corrected or "whisper" in corrected
        assert "FastAPI" in corrected or "fastapi" in corrected
    
    def test_apply_vocabulary_corrections_case_insensitive(self, speech_engine):
        """Test that vocabulary corrections are case-insensitive"""
        text = "WHISPER and WhIsPeR"
        corrected = speech_engine._apply_vocabulary_corrections(text)
        
        # Should replace all variations
        assert corrected.count("Whisper") >= 1
    
    def test_apply_vocabulary_corrections_empty_cache(self, speech_engine):
        """Test that text is unchanged with empty cache"""
        speech_engine.clear_vocabulary()
        
        text = "some random text"
        corrected = speech_engine._apply_vocabulary_corrections(text)
        
        assert corrected == text
    
    def test_vocabulary_cache_updates_existing(self, speech_engine):
        """Test that adding vocabulary updates existing terms"""
        speech_engine.add_vocabulary({"test": "Test1"})
        assert speech_engine.vocabulary_cache["test"] == "Test1"
        
        speech_engine.add_vocabulary({"test": "Test2"})
        assert speech_engine.vocabulary_cache["test"] == "Test2"


class TestStreamingStateManagement:
    """Test streaming state management"""
    
    def test_reset_streaming_state(self, speech_engine, sample_audio):
        """Test resetting streaming state"""
        mock_segment = Mock()
        mock_segment.text = "Test"
        mock_segment.avg_logprob = -0.2
        
        mock_info = Mock()
        mock_info.language = "en"
        
        speech_engine.model.transcribe.return_value = ([mock_segment], mock_info)
        
        # Build up some state
        speech_engine.transcribe_stream_with_window(sample_audio)
        speech_engine.add_to_batch(sample_audio)
        
        assert len(speech_engine.audio_buffer) > 0
        assert speech_engine.previous_context is not None
        assert speech_engine.get_batch_size() > 0
        
        # Reset
        speech_engine.reset_streaming_state()
        
        assert len(speech_engine.audio_buffer) == 0
        assert speech_engine.previous_context is None
        assert speech_engine.get_batch_size() == 0
    
    def test_audio_buffer_max_length(self, speech_engine, sample_audio):
        """Test that audio buffer respects max length"""
        mock_segment = Mock()
        mock_segment.text = "Test"
        mock_segment.avg_logprob = -0.2
        
        mock_info = Mock()
        mock_info.language = "en"
        
        speech_engine.model.transcribe.return_value = ([mock_segment], mock_info)
        
        # Add more than maxlen (10) chunks
        for i in range(15):
            speech_engine.transcribe_stream_with_window(sample_audio)
        
        # Should be capped at 10
        assert len(speech_engine.audio_buffer) == 10


class TestAudioPreprocessing:
    """Test audio preprocessing"""
    
    def test_preprocess_audio_valid(self, speech_engine):
        """Test preprocessing valid audio"""
        audio = np.array([0.1, 0.2, 0.3], dtype=np.float32)
        processed = speech_engine._preprocess_audio(audio)
        
        assert isinstance(processed, np.ndarray)
        assert processed.dtype == np.float32
    
    def test_preprocess_audio_dtype_conversion(self, speech_engine):
        """Test that audio dtype is converted to float32"""
        audio = np.array([100, 200, 300], dtype=np.int16)
        processed = speech_engine._preprocess_audio(audio)
        
        assert processed.dtype == np.float32
    
    def test_preprocess_audio_normalization(self, speech_engine):
        """Test that audio is normalized if out of range"""
        audio = np.array([2.0, 3.0, 4.0], dtype=np.float32)
        processed = speech_engine._preprocess_audio(audio)
        
        assert np.abs(processed).max() <= 1.0
    
    def test_preprocess_audio_empty_raises_error(self, speech_engine):
        """Test that empty audio raises ValueError"""
        with pytest.raises(ValueError, match="Audio chunk cannot be empty"):
            speech_engine._preprocess_audio(np.array([]))
    
    def test_preprocess_audio_invalid_type_raises_error(self, speech_engine):
        """Test that invalid type raises ValueError"""
        with pytest.raises(ValueError, match="Audio chunk must be a numpy array"):
            speech_engine._preprocess_audio([1, 2, 3])


class TestModelInfo:
    """Test model information with streaming parameters"""
    
    def test_get_model_info_includes_streaming_params(self, speech_engine):
        """Test that model info includes streaming parameters"""
        info = speech_engine.get_model_info()
        
        assert 'window_size_ms' in info
        assert 'overlap_ms' in info
        assert 'batch_size' in info
        
        assert info['window_size_ms'] == 3000
        assert info['overlap_ms'] == 500
        assert info['batch_size'] == 4


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
