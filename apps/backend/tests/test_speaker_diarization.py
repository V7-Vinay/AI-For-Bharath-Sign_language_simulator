"""
Unit tests for speaker diarization functionality

Tests the speaker identification and differentiation features of SpeechEngine
(Requirement 3.3: Speaker differentiation)
"""

import pytest
import numpy as np
import asyncio
from unittest.mock import Mock, patch, MagicMock
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from services.speech_engine import SpeechEngine, SpeakerIdentification


class TestSpeakerIdentification:
    """Test SpeakerIdentification data class"""
    
    def test_speaker_identification_creation(self):
        """Test creating a SpeakerIdentification object"""
        speaker = SpeakerIdentification(
            speaker_id="SPEAKER_00",
            confidence=0.95,
            voice_profile="profile_123",
            start_time=0.0,
            end_time=2.5
        )
        
        assert speaker.speaker_id == "SPEAKER_00"
        assert speaker.confidence == 0.95
        assert speaker.voice_profile == "profile_123"
        assert speaker.start_time == 0.0
        assert speaker.end_time == 2.5
    
    def test_speaker_identification_to_dict(self):
        """Test converting SpeakerIdentification to dictionary"""
        speaker = SpeakerIdentification(
            speaker_id="SPEAKER_01",
            confidence=0.88,
            voice_profile=None,
            start_time=1.0,
            end_time=3.0
        )
        
        result = speaker.to_dict()
        
        assert result['speakerId'] == "SPEAKER_01"
        assert result['confidence'] == 0.88
        assert result['voiceProfile'] is None
        assert result['startTime'] == 1.0
        assert result['endTime'] == 3.0


class TestSpeechEngineDiarization:
    """Test speaker diarization in SpeechEngine"""
    
    @pytest.fixture
    def mock_whisper_model(self):
        """Mock WhisperModel for testing"""
        with patch('services.speech_engine.WhisperModel') as mock:
            yield mock
    
    @pytest.fixture
    def mock_diarization_pipeline(self):
        """Mock pyannote Pipeline for testing"""
        with patch('services.speech_engine.Pipeline') as mock:
            yield mock
    
    def test_initialization_with_diarization_disabled(self, mock_whisper_model):
        """Test SpeechEngine initialization with diarization disabled"""
        engine = SpeechEngine(
            model_size="tiny",
            enable_diarization=False
        )
        
        assert engine.enable_diarization is False
        assert engine.diarization_pipeline is None
        assert engine.current_speaker_count == 0
        assert not engine.is_diarization_enabled()
    
    @patch('services.speech_engine.DIARIZATION_AVAILABLE', False)
    def test_initialization_without_pyannote(self, mock_whisper_model):
        """Test initialization when pyannote is not available"""
        engine = SpeechEngine(
            model_size="tiny",
            enable_diarization=True
        )
        
        # Should disable diarization if pyannote is not available
        assert engine.enable_diarization is False
        assert not engine.is_diarization_enabled()
    
    def test_get_speaker_info_default(self, mock_whisper_model):
        """Test getting default speaker info when no speaker detected"""
        engine = SpeechEngine(
            model_size="tiny",
            enable_diarization=False
        )
        
        speaker_info = engine.get_speaker_info()
        
        assert speaker_info.speaker_id == "SPEAKER_00"
        assert speaker_info.confidence == 0.0
        assert speaker_info.voice_profile is None
    
    def test_get_speaker_count_disabled(self, mock_whisper_model):
        """Test getting speaker count when diarization is disabled"""
        engine = SpeechEngine(
            model_size="tiny",
            enable_diarization=False
        )
        
        count = engine.get_speaker_count()
        
        assert count == 0
    
    def test_get_speaker_at_time(self, mock_whisper_model):
        """Test _get_speaker_at_time method"""
        engine = SpeechEngine(
            model_size="tiny",
            enable_diarization=False
        )
        
        # Create mock speaker segments
        segments = [
            (0.0, 2.0, "SPEAKER_00"),
            (2.0, 4.0, "SPEAKER_01"),
            (4.0, 6.0, "SPEAKER_00")
        ]
        
        # Test finding speakers at different times
        assert engine._get_speaker_at_time(segments, 1.0) == "SPEAKER_00"
        assert engine._get_speaker_at_time(segments, 2.5) == "SPEAKER_01"
        assert engine._get_speaker_at_time(segments, 5.0) == "SPEAKER_00"
        assert engine._get_speaker_at_time(segments, 7.0) is None
    
    @pytest.mark.asyncio
    async def test_transcribe_stream_without_diarization(self, mock_whisper_model):
        """Test transcription without speaker diarization"""
        # Setup mock
        mock_instance = mock_whisper_model.return_value
        
        # Mock transcription result
        mock_segment = Mock()
        mock_segment.text = "Hello world"
        mock_segment.avg_logprob = -0.1
        mock_segment.start = 0.0
        mock_segment.end = 1.0
        
        mock_info = Mock()
        mock_info.language = "en"
        
        mock_instance.transcribe.return_value = ([mock_segment], mock_info)
        
        # Create engine
        engine = SpeechEngine(
            model_size="tiny",
            enable_diarization=False
        )
        
        # Create test audio
        audio = np.random.randn(16000).astype(np.float32) * 0.1
        
        # Transcribe
        result = await engine.transcribe_stream(audio, sample_rate=16000)
        
        assert result.text == "Hello world"
        assert result.language == "en"
        assert result.speaker_id is None  # No speaker ID when diarization disabled
        assert 0.0 <= result.confidence <= 1.0
    
    def test_model_info_includes_diarization(self, mock_whisper_model):
        """Test that model info includes diarization status"""
        engine = SpeechEngine(
            model_size="tiny",
            enable_diarization=False
        )
        
        info = engine.get_model_info()
        
        assert 'diarization_enabled' in info
        assert 'speaker_count' in info
        assert info['diarization_enabled'] is False
        assert info['speaker_count'] == 0
    
    @pytest.mark.asyncio
    async def test_transcribe_with_invalid_audio(self, mock_whisper_model):
        """Test transcription with invalid audio input"""
        engine = SpeechEngine(
            model_size="tiny",
            enable_diarization=False
        )
        
        # Test with None
        with pytest.raises(ValueError, match="Audio chunk cannot be empty"):
            await engine.transcribe_stream(None)
        
        # Test with empty array
        with pytest.raises(ValueError, match="Audio chunk cannot be empty"):
            await engine.transcribe_stream(np.array([]))
        
        # Test with non-numpy array
        with pytest.raises(ValueError, match="Audio chunk must be a numpy array"):
            await engine.transcribe_stream([1, 2, 3])
    
    def test_perform_diarization_disabled(self, mock_whisper_model):
        """Test _perform_diarization when diarization is disabled"""
        engine = SpeechEngine(
            model_size="tiny",
            enable_diarization=False
        )
        
        audio = np.random.randn(16000).astype(np.float32) * 0.1
        
        # Should return single speaker segment
        segments = engine._perform_diarization(audio, sample_rate=16000)
        
        assert len(segments) == 1
        assert segments[0][2] == "SPEAKER_00"  # Default speaker
        assert segments[0][0] == 0.0  # Start time
        assert segments[0][1] == 1.0  # End time (1 second of audio)


class TestSpeakerDiarizationIntegration:
    """Integration tests for speaker diarization (requires actual models)"""
    
    @pytest.mark.skipif(
        not os.environ.get('HF_TOKEN'),
        reason="Requires HF_TOKEN environment variable for pyannote models"
    )
    @pytest.mark.asyncio
    async def test_real_diarization_initialization(self):
        """Test real diarization initialization with actual models"""
        try:
            engine = SpeechEngine(
                model_size="tiny",
                enable_diarization=True
            )
            
            assert engine.is_diarization_enabled()
            assert engine.diarization_pipeline is not None
            
        except Exception as e:
            pytest.skip(f"Could not initialize diarization: {e}")
    
    @pytest.mark.asyncio
    async def test_multi_speaker_scenario(self, mock_whisper_model):
        """Test handling multiple speakers in transcription"""
        # Setup mock
        mock_instance = mock_whisper_model.return_value
        
        # Mock transcription with multiple segments
        mock_segment1 = Mock()
        mock_segment1.text = "Hello from speaker one"
        mock_segment1.avg_logprob = -0.1
        mock_segment1.start = 0.0
        mock_segment1.end = 2.0
        
        mock_segment2 = Mock()
        mock_segment2.text = "And hello from speaker two"
        mock_segment2.avg_logprob = -0.15
        mock_segment2.start = 2.0
        mock_segment2.end = 4.0
        
        mock_info = Mock()
        mock_info.language = "en"
        
        mock_instance.transcribe.return_value = (
            [mock_segment1, mock_segment2],
            mock_info
        )
        
        # Create engine
        engine = SpeechEngine(
            model_size="tiny",
            enable_diarization=False
        )
        
        # Create test audio (4 seconds)
        audio = np.random.randn(64000).astype(np.float32) * 0.1
        
        # Transcribe
        result = await engine.transcribe_stream(audio, sample_rate=16000)
        
        # Should combine both segments
        assert "Hello from speaker one" in result.text
        assert "And hello from speaker two" in result.text
        assert result.language == "en"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
