"""
Example demonstrating streaming inference with chunked processing

This example shows how to use the SpeechEngine's streaming capabilities:
1. Sliding window approach for continuous transcription
2. Batch processing for improved throughput
3. Vocabulary caching for common terms

Requirements: 1.5, 3.2
"""

import asyncio
import numpy as np
import sys
import os

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from services.speech_engine import SpeechEngine


def generate_sample_audio(duration_seconds: float = 1.0, sample_rate: int = 16000) -> np.ndarray:
    """Generate sample audio for demonstration"""
    samples = int(sample_rate * duration_seconds)
    frequency = 440.0  # A4 note
    t = np.linspace(0, duration_seconds, samples, dtype=np.float32)
    audio = 0.5 * np.sin(2 * np.pi * frequency * t)
    return audio


async def example_sliding_window():
    """
    Example 1: Sliding window approach for continuous transcription
    
    This demonstrates how the sliding window maintains context across
    multiple audio chunks for better continuous transcription.
    """
    print("\n=== Example 1: Sliding Window Transcription ===\n")
    
    # Initialize engine with streaming parameters
    engine = SpeechEngine(
        model_size="tiny",
        device="cpu",
        window_size_ms=3000,  # 3 second window
        overlap_ms=500,       # 500ms overlap
        batch_size=4
    )
    
    print(f"Engine initialized with:")
    print(f"  - Window size: {engine.window_size_ms}ms")
    print(f"  - Overlap: {engine.overlap_ms}ms")
    print(f"  - Vocabulary cache: {len(engine.vocabulary_cache)} terms\n")
    
    # Simulate continuous audio stream
    print("Processing continuous audio stream with sliding window...\n")
    
    for i in range(5):
        audio_chunk = generate_sample_audio(duration_seconds=1.0)
        
        try:
            # Note: In real usage, this would transcribe actual speech
            # Here we're just demonstrating the API
            print(f"Chunk {i+1}:")
            print(f"  - Audio buffer size: {len(engine.audio_buffer)}")
            print(f"  - Has context: {engine.previous_context is not None}")
            
            # In real usage:
            # result = engine.transcribe_stream_with_window(audio_chunk)
            # print(f"  - Transcription: {result.text}")
            # print(f"  - Confidence: {result.confidence:.2f}")
            
        except Exception as e:
            print(f"  - Error: {e}")
        
        print()
    
    # Reset streaming state when done
    engine.reset_streaming_state()
    print("Streaming state reset\n")


async def example_batch_processing():
    """
    Example 2: Batch processing for improved throughput
    
    This demonstrates how to accumulate audio chunks and process them
    in batches for better throughput.
    """
    print("\n=== Example 2: Batch Processing ===\n")
    
    engine = SpeechEngine(
        model_size="tiny",
        device="cpu",
        batch_size=4
    )
    
    print(f"Batch size: {engine.batch_size}\n")
    print("Adding audio chunks to batch...\n")
    
    # Add chunks to batch
    for i in range(6):
        audio_chunk = generate_sample_audio(duration_seconds=0.5)
        is_ready = engine.add_to_batch(audio_chunk)
        
        print(f"Chunk {i+1} added:")
        print(f"  - Batch size: {engine.get_batch_size()}/{engine.batch_size}")
        print(f"  - Ready for processing: {is_ready}")
        
        # Process batch when ready
        if is_ready:
            print("\n  Processing batch...")
            # In real usage:
            # results = await engine.process_batch()
            # for idx, result in enumerate(results):
            #     print(f"    Result {idx+1}: {result.text}")
            print(f"  Batch processed, queue cleared\n")
        else:
            print()
    
    # Process remaining chunks
    if engine.get_batch_size() > 0:
        print(f"Processing remaining {engine.get_batch_size()} chunks...")
        # In real usage:
        # results = await engine.process_batch()
        print("Remaining chunks processed\n")


def example_vocabulary_caching():
    """
    Example 3: Vocabulary caching for common terms
    
    This demonstrates how to use vocabulary caching to improve
    transcription accuracy for technical and domain-specific terms.
    """
    print("\n=== Example 3: Vocabulary Caching ===\n")
    
    engine = SpeechEngine(
        model_size="tiny",
        device="cpu"
    )
    
    # Show pre-loaded vocabulary
    print(f"Pre-loaded vocabulary terms: {len(engine.vocabulary_cache)}")
    print("\nSample terms:")
    sample_terms = list(engine.vocabulary_cache.items())[:5]
    for term, correction in sample_terms:
        print(f"  '{term}' -> '{correction}'")
    
    # Add custom vocabulary
    print("\nAdding custom vocabulary...")
    custom_terms = {
        "myapp": "MyApp",
        "customapi": "CustomAPI",
        "specialterm": "SpecialTerm"
    }
    engine.add_vocabulary(custom_terms)
    
    print(f"Total vocabulary terms: {len(engine.vocabulary_cache)}")
    print("\nCustom terms added:")
    for term, correction in custom_terms.items():
        print(f"  '{term}' -> '{correction}'")
    
    # Demonstrate vocabulary correction
    print("\nVocabulary correction example:")
    test_text = "using whisper and myapp with customapi"
    corrected_text = engine._apply_vocabulary_corrections(test_text)
    print(f"  Original:  '{test_text}'")
    print(f"  Corrected: '{corrected_text}'")
    
    # Clear vocabulary if needed
    print("\nClearing vocabulary...")
    engine.clear_vocabulary()
    print(f"Vocabulary terms after clear: {len(engine.vocabulary_cache)}")


def example_streaming_configuration():
    """
    Example 4: Streaming configuration options
    
    This demonstrates different configuration options for streaming inference.
    """
    print("\n=== Example 4: Streaming Configuration ===\n")
    
    # Configuration for low-latency real-time transcription
    print("Configuration 1: Low-latency real-time")
    engine_realtime = SpeechEngine(
        model_size="tiny",
        device="cpu",
        window_size_ms=2000,  # Smaller window for lower latency
        overlap_ms=300,       # Less overlap
        batch_size=1          # Process immediately
    )
    info = engine_realtime.get_model_info()
    print(f"  Window: {info['window_size_ms']}ms")
    print(f"  Overlap: {info['overlap_ms']}ms")
    print(f"  Batch size: {info['batch_size']}")
    
    # Configuration for high-throughput batch processing
    print("\nConfiguration 2: High-throughput batch")
    engine_batch = SpeechEngine(
        model_size="base",
        device="cpu",
        window_size_ms=5000,  # Larger window for more context
        overlap_ms=1000,      # More overlap for accuracy
        batch_size=8          # Larger batches for throughput
    )
    info = engine_batch.get_model_info()
    print(f"  Window: {info['window_size_ms']}ms")
    print(f"  Overlap: {info['overlap_ms']}ms")
    print(f"  Batch size: {info['batch_size']}")
    
    # Configuration for balanced performance
    print("\nConfiguration 3: Balanced")
    engine_balanced = SpeechEngine(
        model_size="small",
        device="cpu",
        window_size_ms=3000,  # Default window
        overlap_ms=500,       # Default overlap
        batch_size=4          # Default batch size
    )
    info = engine_balanced.get_model_info()
    print(f"  Window: {info['window_size_ms']}ms")
    print(f"  Overlap: {info['overlap_ms']}ms")
    print(f"  Batch size: {info['batch_size']}")


async def main():
    """Run all examples"""
    print("=" * 60)
    print("SpeechEngine Streaming Inference Examples")
    print("=" * 60)
    
    # Run examples
    await example_sliding_window()
    await example_batch_processing()
    example_vocabulary_caching()
    example_streaming_configuration()
    
    print("\n" + "=" * 60)
    print("Examples completed!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
