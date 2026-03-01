"""
Unit tests for SpeechEngine service

Tests specific examples and edge cases for speech recognition functionality.
Requirements: 1.5, 3.1, 3.3
"""

import pytest
import numpy as np
import asyncio
from unittest.mock import Mock, patch, MagicMock
import sys
import os

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from services.speech_engine import SpeechEngine, TranscriptionResult, SpeakerIdentification


@pytest.fixture
def speech_engine():
    """Create a SpeechEngine instance for testing"""
    # Use tiny model for faster tests
    with patch('services.speech_engine.WhisperModel') as mock_model:
        engine = SpeechEngine(model_size="tiny", device="cpu", compute_type="int8")
        engine.model = mock_model.return_value
        yield engine


@pytest.fixture
def sample_audio():
    """Generate sample audio data for testing"""
    # Generate 1 second of audio at 16kHz
    sample_rate = 16000
    duration = 1.0
    samples = int(sample_rate * duration)
    
    # Generate a simple sine wave
    frequency = 440.0  # A4 note
    t = np.linspace(0, duration, samples, dtype=np.float32)
    audio = 0.5 * np.sin(2 * np.pi * frequency * t)
    
    return audio


class TestSpeechEngineInitialization:
    """Test SpeechEngine initialization"""
    
    def test_initialization_with_defaults(self):
        """Test initialization with default parameters"""
        with patch('services.speech_engine.WhisperModel') as mock_model:
            engine = SpeechEngine()
            
            assert engine.model_size == "base"
            assert engine.compute_type == "int8"
            assert engine.auto_detect_language is True
            assert engine.language is None
    
    def test_initialization_with_custom_params(self):
        """Test initialization with custom parameters"""
        with patch('services.speech_engine.WhisperModel') as mock_model:
            engine = SpeechEngine(
                model_size="small",
                device="cpu",
                compute_type="float32",
                cpu_threads=8
            )
            
            assert engine.model_size == "small"
            assert engine.device == "cpu"
            assert engine.compute_type == "float32"
            assert engine.cpu_threads == 8
    
    def test_device_auto_detection_cpu(self):
        """Test automatic device detection when CUDA is not available"""
        with patch('services.speech_engine.WhisperModel') as mock_model:
            with patch('services.speech_engine.torch.cuda.is_available', return_value=False):
                engine = SpeechEngine(device="auto")
                assert engine.device == "cpu"
    
    def test_device_auto_detection_cuda(self):
        """Test automatic device detection when CUDA is available"""
        with patch('services.speech_engine.WhisperModel') as mock_model:
            with patch('services.speech_engine.torch.cuda.is_available', return_value=True):
                engine = SpeechEngine(device="auto")
                assert engine.device == "cuda"


class TestTranscription:
    """Test transcription functionality"""
    
    @pytest.mark.asyncio
    async def test_transcribe_stream_basic(self, speech_engine, sample_audio):
        """Test basic transcription of audio stream"""
        # Mock the transcribe method
        mock_segment = Mock()
        mock_segment.text = "Hello world"
        mock_segment.avg_logprob = -0.2
        
        mock_info = Mock()
        mock_info.language = "en"
        
        speech_engine.model.transcribe.return_value = ([mock_segment], mock_info)
        
        result = await speech_engine.transcribe_stream(sample_audio)
        
        assert isinstance(result, TranscriptionResult)
        assert result.text == "Hello world"
        assert result.language == "en"
        assert 0.0 <= result.confidence <= 1.0
        assert result.timestamp > 0
    
    @pytest.mark.asyncio
    async def test_transcribe_stream_multiple_segments(self, speech_engine, sample_audio):
        """Test transcription with multiple segments"""
        # Mock multiple segments
        mock_segment1 = Mock()
        mock_segment1.text = "Hello"
        mock_segment1.avg_logprob = -0.1
        
        mock_segment2 = Mock()
        mock_segment2.text = "world"
        mock_segment2.avg_logprob = -0.15
        
        mock_info = Mock()
        mock_info.language = "en"
        
        speech_engine.model.transcribe.return_value = ([mock_segment1, mock_segment2], mock_info)
        
        result = await speech_engine.transcribe_stream(sample_audio)
        
        assert result.text == "Hello world"
        assert result.confidence > 0.0
    
    @pytest.mark.asyncio
    async def test_transcribe_stream_empty_audio(self, speech_engine):
        """Test transcription with empty audio raises ValueError"""
        empty_audio = np.array([], dtype=np.float32)
        
        with pytest.raises(ValueError, match="Audio chunk cannot be empty"):
            await speech_engine.transcribe_stream(empty_audio)
    
    @pytest.mark.asyncio
    async def test_transcribe_stream_invalid_type(self, speech_engine):
        """Test transcription with invalid audio type raises ValueError"""
        invalid_audio = [1, 2, 3, 4]
        
        with pytest.raises(ValueError, match="Audio chunk must be a numpy array"):
            await speech_engine.transcribe_stream(invalid_audio)
    
    @pytest.mark.asyncio
    async def test_transcribe_stream_auto_normalize(self, speech_engine):
        """Test that audio is automatically normalized if out of range"""
        # Create audio with values > 1.0
        loud_audio = np.array([2.0, 3.0, 4.0, 5.0], dtype=np.float32)
        
        mock_segment = Mock()
        mock_segment.text = "Test"
        mock_segment.avg_logprob = -0.2
        
        mock_info = Mock()
        mock_info.language = "en"
        
        speech_engine.model.transcribe.return_value = ([mock_segment], mock_info)
        
        result = await speech_engine.transcribe_stream(loud_audio)
        
        # Should not raise an error and should normalize
        assert result.text == "Test"
    
    @pytest.mark.asyncio
    async def test_transcribe_stream_dtype_conversion(self, speech_engine):
        """Test that audio dtype is converted to float32 if needed"""
        # Create int16 audio
        int_audio = np.array([100, 200, 300, 400], dtype=np.int16)
        
        mock_segment = Mock()
        mock_segment.text = "Test"
        mock_segment.avg_logprob = -0.2
        
        mock_info = Mock()
        mock_info.language = "en"
        
        speech_engine.model.transcribe.return_value = ([mock_segment], mock_info)
        
        result = await speech_engine.transcribe_stream(int_audio)
        
        # Should convert and process successfully
        assert result.text == "Test"
    
    @pytest.mark.asyncio
    async def test_transcribe_stream_with_set_language(self, speech_engine, sample_audio):
        """Test transcription with manually set language"""
        speech_engine.set_language("es")
        
        mock_segment = Mock()
        mock_segment.text = "Hola mundo"
        mock_segment.avg_logprob = -0.2
        
        mock_info = Mock()
        mock_info.language = "es"
        
        speech_engine.model.transcribe.return_value = ([mock_segment], mock_info)
        
        result = await speech_engine.transcribe_stream(sample_audio)
        
        assert result.text == "Hola mundo"
        assert result.language == "es"
    
    @pytest.mark.asyncio
    async def test_transcribe_stream_latency_warning(self, speech_engine, sample_audio):
        """Test that latency warning is logged if processing exceeds 300ms"""
        import time
        
        def slow_transcribe(*args, **kwargs):
            time.sleep(0.35)  # Simulate slow processing
            mock_segment = Mock()
            mock_segment.text = "Slow"
            mock_segment.avg_logprob = -0.2
            mock_info = Mock()
            mock_info.language = "en"
            return ([mock_segment], mock_info)
        
        speech_engine.model.transcribe.side_effect = slow_transcribe
        
        with patch('services.speech_engine.logger') as mock_logger:
            result = await speech_engine.transcribe_stream(sample_audio)
            
            # Check that warning was logged
            assert any('exceeding 300ms' in str(call) for call in mock_logger.warning.call_args_list)


class TestLanguageSettings:
    """Test language configuration"""
    
    def test_set_language_valid(self, speech_engine):
        """Test setting a valid language"""
        speech_engine.set_language("fr")
        
        assert speech_engine.language == "fr"
        assert speech_engine.auto_detect_language is False
    
    def test_set_language_uppercase(self, speech_engine):
        """Test that language is converted to lowercase"""
        speech_engine.set_language("EN")
        
        assert speech_engine.language == "en"
    
    def test_set_language_with_whitespace(self, speech_engine):
        """Test that whitespace is stripped"""
        speech_engine.set_language("  es  ")
        
        assert speech_engine.language == "es"
    
    def test_set_language_empty_enables_auto_detect(self, speech_engine):
        """Test that empty string enables auto-detection"""
        speech_engine.set_language("fr")
        speech_engine.set_language("")
        
        assert speech_engine.language is None
        assert speech_engine.auto_detect_language is True
    
    def test_set_language_none_enables_auto_detect(self, speech_engine):
        """Test that None enables auto-detection"""
        speech_engine.set_language("fr")
        speech_engine.set_language(None)
        
        assert speech_engine.language is None
        assert speech_engine.auto_detect_language is True


class TestConfidenceScore:
    """Test confidence score functionality"""
    
    def test_get_confidence_score_initial(self, speech_engine):
        """Test initial confidence score is 0.0"""
        assert speech_engine.get_confidence_score() == 0.0
    
    @pytest.mark.asyncio
    async def test_get_confidence_score_after_transcription(self, speech_engine, sample_audio):
        """Test confidence score is updated after transcription"""
        mock_segment = Mock()
        mock_segment.text = "Test"
        mock_segment.avg_logprob = -0.3
        
        mock_info = Mock()
        mock_info.language = "en"
        
        speech_engine.model.transcribe.return_value = ([mock_segment], mock_info)
        
        await speech_engine.transcribe_stream(sample_audio)
        
        confidence = speech_engine.get_confidence_score()
        assert 0.0 <= confidence <= 1.0
        assert confidence > 0.0
    
    def test_logprob_to_confidence_conversion(self, speech_engine):
        """Test log probability to confidence conversion"""
        # Test various log probabilities
        assert speech_engine._logprob_to_confidence(0.0) == 1.0
        assert speech_engine._logprob_to_confidence(-1.0) < 1.0
        assert speech_engine._logprob_to_confidence(-2.0) >= 0.0  # Should be clamped


class TestSpeakerIdentification:
    """Test speaker identification functionality"""
    
    def test_get_speaker_info_default(self, speech_engine):
        """Test default speaker info"""
        speaker_info = speech_engine.get_speaker_info()
        
        assert isinstance(speaker_info, SpeakerIdentification)
        assert speaker_info.speaker_id == "speaker_0"
        assert speaker_info.confidence == 0.0
        assert speaker_info.voice_profile is None
    
    def test_get_speaker_info_cached(self, speech_engine):
        """Test that speaker info is cached"""
        speaker_info1 = speech_engine.get_speaker_info()
        speaker_info2 = speech_engine.get_speaker_info()
        
        assert speaker_info1 is speaker_info2


class TestVocabulary:
    """Test vocabulary management"""
    
    def test_add_vocabulary(self, speech_engine):
        """Test adding vocabulary terms"""
        terms = {
            "myterm1": "MyTerm1",
            "myterm2": "MyTerm2",
            "myterm3": "MyTerm3"
        }
        
        initial_size = len(speech_engine.vocabulary_cache)
        speech_engine.add_vocabulary(terms)
        
        assert len(speech_engine.vocabulary_cache) == initial_size + 3
        assert speech_engine.vocabulary_cache["myterm1"] == "MyTerm1"
    
    def test_add_vocabulary_updates_existing(self, speech_engine):
        """Test that adding vocabulary updates existing terms"""
        speech_engine.add_vocabulary({"test": "Test1"})
        speech_engine.add_vocabulary({"test": "Test2"})
        
        assert speech_engine.vocabulary_cache["test"] == "Test2"
    
    def test_clear_vocabulary(self, speech_engine):
        """Test clearing vocabulary cache"""
        speech_engine.add_vocabulary({"test": "Test"})
        speech_engine.clear_vocabulary()
        
        assert len(speech_engine.vocabulary_cache) == 0


class TestModelInfo:
    """Test model information retrieval"""
    
    def test_get_model_info(self, speech_engine):
        """Test getting model configuration info"""
        info = speech_engine.get_model_info()
        
        assert isinstance(info, dict)
        assert 'model_size' in info
        assert 'device' in info
        assert 'compute_type' in info
        assert 'language' in info
        assert 'auto_detect_language' in info
        
        assert info['model_size'] == "tiny"
        assert info['device'] == "cpu"
        assert info['compute_type'] == "int8"


class TestTranscriptionResult:
    """Test TranscriptionResult class"""
    
    def test_transcription_result_creation(self):
        """Test creating a TranscriptionResult"""
        result = TranscriptionResult(
            text="Hello world",
            confidence=0.95,
            timestamp=1234567890.0,
            language="en",
            speaker_id="speaker_1"
        )
        
        assert result.text == "Hello world"
        assert result.confidence == 0.95
        assert result.timestamp == 1234567890.0
        assert result.language == "en"
        assert result.speaker_id == "speaker_1"
    
    def test_transcription_result_to_dict(self):
        """Test converting TranscriptionResult to dictionary"""
        result = TranscriptionResult(
            text="Test",
            confidence=0.9,
            timestamp=1234567890.0,
            language="en"
        )
        
        result_dict = result.to_dict()
        
        assert isinstance(result_dict, dict)
        assert result_dict['text'] == "Test"
        assert result_dict['confidence'] == 0.9
        assert result_dict['timestamp'] == 1234567890.0
        assert result_dict['language'] == "en"
        assert result_dict['speakerId'] is None


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
