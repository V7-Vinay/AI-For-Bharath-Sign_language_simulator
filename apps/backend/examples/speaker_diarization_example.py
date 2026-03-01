"""
Example demonstrating speaker diarization with SpeechEngine

This example shows how to use the SpeechEngine with speaker identification
to differentiate between multiple speakers in audio (Requirement 3.3).

Requirements:
- pyannote.audio installed: pip install pyannote.audio
- HF_TOKEN environment variable set with Hugging Face token
- Access to pyannote models on Hugging Face
"""

import asyncio
import numpy as np
import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from services.speech_engine import SpeechEngine


async def main():
    """Demonstrate speaker diarization functionality"""
    
    print("=" * 60)
    print("Speaker Diarization Example")
    print("=" * 60)
    
    # Check for HF_TOKEN
    if not os.environ.get('HF_TOKEN'):
        print("\nWARNING: HF_TOKEN environment variable not set.")
        print("Speaker diarization requires a Hugging Face token with access to pyannote models.")
        print("Get your token at: https://huggingface.co/settings/tokens")
        print("Then set it: export HF_TOKEN=your_token_here")
        print("\nContinuing with diarization disabled...\n")
        enable_diarization = False
    else:
        enable_diarization = True
    
    # Initialize SpeechEngine with diarization enabled
    print("\n1. Initializing SpeechEngine with speaker diarization...")
    try:
        engine = SpeechEngine(
            model_size="base",
            device="auto",
            enable_diarization=enable_diarization
        )
        print(f"   ✓ SpeechEngine initialized")
        print(f"   - Diarization enabled: {engine.is_diarization_enabled()}")
    except Exception as e:
        print(f"   ✗ Failed to initialize: {e}")
        return
    
    # Generate synthetic multi-speaker audio (for demonstration)
    print("\n2. Generating synthetic multi-speaker audio...")
    sample_rate = 16000
    duration = 3.0  # 3 seconds
    
    # Create a simple audio signal (in real use, this would be actual audio)
    # Speaker 1: 0-1.5s (lower frequency)
    # Speaker 2: 1.5-3s (higher frequency)
    t = np.linspace(0, duration, int(sample_rate * duration))
    
    # Speaker 1 segment (0-1.5s)
    speaker1_audio = np.sin(2 * np.pi * 200 * t[:int(sample_rate * 1.5)])
    
    # Speaker 2 segment (1.5-3s)
    speaker2_audio = np.sin(2 * np.pi * 400 * t[int(sample_rate * 1.5):])
    
    # Combine speakers
    audio = np.concatenate([speaker1_audio, speaker2_audio]).astype(np.float32)
    
    print(f"   ✓ Generated {duration}s of synthetic audio")
    print(f"   - Sample rate: {sample_rate} Hz")
    print(f"   - Audio shape: {audio.shape}")
    
    # Transcribe with speaker identification
    print("\n3. Transcribing audio with speaker identification...")
    try:
        result = await engine.transcribe_stream(audio, sample_rate)
        
        print(f"   ✓ Transcription complete")
        print(f"\n   Results:")
        print(f"   - Text: {result.text if result.text else '(no speech detected)'}")
        print(f"   - Confidence: {result.confidence:.2f}")
        print(f"   - Language: {result.language}")
        print(f"   - Speaker ID: {result.speaker_id or 'unknown'}")
        print(f"   - Timestamp: {result.timestamp:.2f}")
        
    except Exception as e:
        print(f"   ✗ Transcription failed: {e}")
        return
    
    # Get speaker information
    print("\n4. Getting speaker information...")
    speaker_info = engine.get_speaker_info()
    speaker_count = engine.get_speaker_count()
    
    print(f"   ✓ Speaker information retrieved")
    print(f"   - Current speaker: {speaker_info.speaker_id}")
    print(f"   - Confidence: {speaker_info.confidence:.2f}")
    print(f"   - Total speakers detected: {speaker_count}")
    if speaker_info.start_time is not None:
        print(f"   - Speaker time range: {speaker_info.start_time:.2f}s - {speaker_info.end_time:.2f}s")
    
    # Get model information
    print("\n5. Model configuration:")
    model_info = engine.get_model_info()
    for key, value in model_info.items():
        print(f"   - {key}: {value}")
    
    print("\n" + "=" * 60)
    print("Example completed successfully!")
    print("=" * 60)
    
    # Demonstrate with real audio file (if available)
    print("\n\nNote: To test with real audio:")
    print("1. Prepare an audio file with multiple speakers")
    print("2. Load it with librosa or soundfile:")
    print("   import soundfile as sf")
    print("   audio, sr = sf.read('your_audio.wav')")
    print("3. Pass it to engine.transcribe_stream(audio, sr)")
    print("\nThe system will automatically:")
    print("- Identify different speakers")
    print("- Assign speaker IDs (SPEAKER_00, SPEAKER_01, etc.)")
    print("- Include speaker information in transcription results")


if __name__ == "__main__":
    asyncio.run(main())
