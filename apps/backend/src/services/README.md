# Speech Engine Service

The SpeechEngine service provides real-time speech-to-text transcription using OpenAI Whisper with faster-whisper optimization.

## Features

### Core Capabilities

- **Real-time Transcription**: Sub-300ms processing latency (Requirement 1.5)
- **Multi-language Support**: Automatic language detection and manual language selection
- **GPU Acceleration**: CUDA support for faster inference
- **Model Quantization**: 8-bit quantization for reduced memory usage

### Streaming Inference (Task 4.3)

- **Sliding Window Approach**: Continuous transcription with overlapping windows for better context
- **Batch Processing**: Process multiple audio chunks simultaneously for improved throughput
- **Vocabulary Caching**: Pre-loaded and customizable vocabulary for technical terms (Requirement 3.2)

## Installation

```bash
pip install faster-whisper torch numpy
```

## Basic Usage

```python
from services.speech_engine import SpeechEngine
import numpy as np

# Initialize the engine
engine = SpeechEngine(
    model_size="base",
    device="auto",  # Automatically selects CUDA if available
    compute_type="int8"
)

# Transcribe audio
audio_chunk = np.array([...], dtype=np.float32)  # 16kHz mono audio
result = await engine.transcribe_stream(audio_chunk)

print(f"Text: {result.text}")
print(f"Confidence: {result.confidence}")
print(f"Language: {result.language}")
```

## Streaming Inference

### Sliding Window Transcription

Use sliding windows for continuous transcription with maintained context:

```python
engine = SpeechEngine(
    model_size="base",
    window_size_ms=3000,  # 3 second window
    overlap_ms=500        # 500ms overlap between windows
)

# Process continuous audio stream
for audio_chunk in audio_stream:
    result = engine.transcribe_stream_with_window(audio_chunk)
    print(result.text)

# Reset state when starting new stream
engine.reset_streaming_state()
```

**Benefits:**

- Maintains context across audio chunks
- Improves accuracy for continuous speech
- Configurable window size and overlap

### Batch Processing

Process multiple audio chunks in batches for better throughput:

```python
engine = SpeechEngine(
    model_size="base",
    batch_size=4  # Process 4 chunks at a time
)

# Add chunks to batch
for audio_chunk in audio_chunks:
    is_ready = engine.add_to_batch(audio_chunk)

    if is_ready:
        # Process batch when full
        results = await engine.process_batch()
        for result in results:
            print(result.text)

# Process remaining chunks
if engine.get_batch_size() > 0:
    results = await engine.process_batch()
```

**Benefits:**

- Improved throughput for bulk processing
- Efficient use of GPU resources
- Configurable batch size

### Vocabulary Caching

Improve accuracy for technical and domain-specific terms:

```python
engine = SpeechEngine(model_size="base")

# Pre-loaded vocabulary includes common terms:
# - AI/ML terms (whisper, transformer, neural network)
# - Accessibility terms (captions, sign language)
# - Technical terms (API, Kubernetes, Docker)

# Add custom vocabulary
custom_terms = {
    "myapp": "MyApp",
    "customapi": "CustomAPI"
}
engine.add_vocabulary(custom_terms)

# Vocabulary corrections are applied automatically
result = engine.transcribe_stream_with_window(audio_chunk)
# "using myapp" -> "using MyApp"
```

**Benefits:**

- Improved accuracy for technical terms (Requirement 3.2)
- Case-insensitive matching
- Customizable per domain

## Configuration Options

### Model Sizes

- `tiny`: Fastest, lowest accuracy (~1GB RAM)
- `base`: Good balance (~1GB RAM)
- `small`: Better accuracy (~2GB RAM)
- `medium`: High accuracy (~5GB RAM)
- `large-v2`, `large-v3`: Best accuracy (~10GB RAM)

### Compute Types

- `int8`: Fastest, lowest memory (recommended for CPU)
- `int8_float16`: Good balance (recommended for GPU)
- `float16`: Better accuracy (GPU only)
- `float32`: Best accuracy, highest memory

### Streaming Parameters

- `window_size_ms`: Size of sliding window (default: 3000ms)
- `overlap_ms`: Overlap between windows (default: 500ms)
- `batch_size`: Number of chunks per batch (default: 4)

## Configuration Examples

### Low-Latency Real-Time

```python
engine = SpeechEngine(
    model_size="tiny",
    device="cuda",
    compute_type="int8_float16",
    window_size_ms=2000,  # Smaller window
    overlap_ms=300,       # Less overlap
    batch_size=1          # Process immediately
)
```

### High-Throughput Batch

```python
engine = SpeechEngine(
    model_size="base",
    device="cuda",
    compute_type="int8_float16",
    window_size_ms=5000,  # Larger window
    overlap_ms=1000,      # More overlap
    batch_size=8          # Larger batches
)
```

### Balanced Performance

```python
engine = SpeechEngine(
    model_size="small",
    device="cuda",
    compute_type="int8_float16",
    window_size_ms=3000,  # Default
    overlap_ms=500,       # Default
    batch_size=4          # Default
)
```

## API Reference

### SpeechEngine

#### `__init__(model_size, device, compute_type, cpu_threads, num_workers, window_size_ms, overlap_ms, batch_size)`

Initialize the speech engine.

#### `async transcribe_stream(audio_chunk, sample_rate=16000) -> TranscriptionResult`

Transcribe a single audio chunk.

#### `transcribe_stream_with_window(audio_chunk, sample_rate=16000) -> TranscriptionResult`

Transcribe using sliding window approach for continuous transcription.

#### `add_to_batch(audio_chunk) -> bool`

Add audio chunk to batch queue. Returns True if batch is ready.

#### `async process_batch(sample_rate=16000) -> List[TranscriptionResult]`

Process all chunks in the batch queue.

#### `set_language(language)`

Set the language for transcription (e.g., 'en', 'es', 'fr').

#### `add_vocabulary(terms: Dict[str, str])`

Add custom vocabulary terms for improved accuracy.

#### `clear_vocabulary()`

Clear the vocabulary cache.

#### `reset_streaming_state()`

Reset audio buffer and context for new stream.

#### `get_confidence_score() -> float`

Get confidence score from last transcription.

#### `get_speaker_info() -> SpeakerIdentification`

Get speaker identification information.

#### `get_model_info() -> Dict[str, Any]`

Get model configuration details.

### TranscriptionResult

Result object containing:

- `text`: Transcribed text
- `confidence`: Confidence score (0.0 to 1.0)
- `timestamp`: Unix timestamp
- `language`: Detected language code
- `speaker_id`: Speaker identifier (if available)

## Performance Considerations

### Latency Requirements

- Target: <300ms processing time (Requirement 1.5)
- Use smaller models (tiny, base) for real-time
- Use GPU acceleration when available
- Reduce window size for lower latency

### Throughput Optimization

- Use batch processing for bulk transcription
- Increase batch size for better GPU utilization
- Use larger models for better accuracy
- Increase window overlap for better context

### Memory Usage

- Model quantization reduces memory by ~4x
- Smaller models use less memory
- Batch processing increases memory usage
- Audio buffer is capped at 10 chunks

## Testing

Run unit tests:

```bash
pytest apps/backend/tests/test_speech_engine.py -v
pytest apps/backend/tests/test_speech_engine_streaming.py -v
```

Run examples:

```bash
python apps/backend/examples/speech_engine_example.py
python apps/backend/examples/streaming_inference_example.py
```

## Requirements

- Python 3.8+
- faster-whisper
- torch
- numpy

## Related Tasks

- Task 4.1: Create SpeechEngine service with faster-whisper integration ✓
- Task 4.3: Implement streaming inference with chunked processing ✓
- Task 4.4: Add speaker identification and differentiation (pending)

## References

- [faster-whisper Documentation](https://github.com/guillaumekln/faster-whisper)
- [OpenAI Whisper](https://github.com/openai/whisper)
- [CTranslate2](https://github.com/OpenNMT/CTranslate2)
