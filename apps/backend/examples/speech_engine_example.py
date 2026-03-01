"""
Example usage of the SpeechEngine service

This script demonstrates how to use the SpeechEngine for real-time
speech-to-text transcription.
"""

import asyncio
import numpy as np
import sys
import os

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from services.speech_engine import SpeechEngine


async def main():
    """Main example function"""
    
    print("Initializing SpeechEngine...")
    
    # Initialize with tiny model for fast testing
    engine = SpeechEngine(
        model_size="tiny",
        device="auto",
        compute_type="int8",
        cpu_threads=4
    )
    
    print(f"Model initialized: {engine.get_model_info()}")
    print()
    
    # Example 1: Generate synthetic audio (sine wave)
    print("Example 1: Transcribing synthetic audio")
    print("-" * 50)
    
    sample_rate = 16000
    duration = 2.0
    samples = int(sample_rate * duration)
    
    # Generate a simple sine wave (this won't produce meaningful transcription,
    # but demonstrates the API)
    t = np.linspace(0, duration, samples, dtype=np.float32)
    audio = 0.3 * np.sin(2 * np.pi * 440 * t)
    
    try:
        result = await engine.transcribe_stream(audio, sample_rate)
        print(f"Text: {result.text}")
        print(f"Confidence: {result.confidence:.2f}")
        print(f"Language: {result.language}")
        print(f"Timestamp: {result.timestamp}")
    except Exception as e:
        print(f"Transcription failed: {e}")
    
    print()
    
    # Example 2: Language configuration
    print("Example 2: Language configuration")
    print("-" * 50)
    
    # Set to Spanish
    engine.set_language("es")
    print(f"Language set to: {engine.language}")
    
    # Enable auto-detection
    engine.set_language("")
    print(f"Auto-detection enabled: {engine.auto_detect_language}")
    
    print()
    
    # Example 3: Vocabulary management
    print("Example 3: Domain-specific vocabulary")
    print("-" * 50)
    
    technical_terms = {
        "kubernetes": "Kubernetes",
        "fastapi": "FastAPI",
        "whisper": "Whisper",
        "ctranslate2": "CTranslate2"
    }
    
    engine.add_vocabulary(technical_terms)
    print(f"Added {len(technical_terms)} technical terms to vocabulary")
    
    print()
    
    # Example 4: Confidence score
    print("Example 4: Confidence score tracking")
    print("-" * 50)
    
    confidence = engine.get_confidence_score()
    print(f"Last confidence score: {confidence:.2f}")
    
    print()
    
    # Example 5: Speaker information
    print("Example 5: Speaker identification")
    print("-" * 50)
    
    speaker_info = engine.get_speaker_info()
    print(f"Speaker ID: {speaker_info.speaker_id}")
    print(f"Speaker confidence: {speaker_info.confidence:.2f}")
    
    print()
    
    # Example 6: Error handling
    print("Example 6: Error handling")
    print("-" * 50)
    
    try:
        # Try to transcribe empty audio
        empty_audio = np.array([], dtype=np.float32)
        await engine.transcribe_stream(empty_audio)
    except ValueError as e:
        print(f"Caught expected error: {e}")
    
    try:
        # Try to transcribe invalid type
        invalid_audio = [1, 2, 3, 4]
        await engine.transcribe_stream(invalid_audio)
    except ValueError as e:
        print(f"Caught expected error: {e}")
    
    print()
    print("Examples completed successfully!")


if __name__ == "__main__":
    asyncio.run(main())
