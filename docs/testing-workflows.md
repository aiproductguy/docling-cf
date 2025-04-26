# Testing Workflows

This document outlines common testing workflows for the Docling project.

## Chunking Tests

### Overview

The chunking functionality in Docling is critical for properly segmenting documents for embedding and retrieval tasks. Hybrid chunking, in particular, applies tokenization-aware refinements on top of document-based hierarchical chunking, ensuring optimal text segments for downstream NLP tasks.

### Running Chunking Tests

#### Using the Jupyter Notebook

The most interactive way to test chunking is through the notebook example at `notebooks/chunking-testing.ipynb`. This notebook demonstrates:

1. **Hybrid Chunking**: Tokenization-aware refinements on top of document-based hierarchical chunking
2. **Different tokenizers**: Testing with various embedding model tokenizers
3. **Parameter tuning**: Experimenting with chunk size and overlap parameters

Example from the notebook:

```python
from docling.chunking import HybridChunker
from docling.document_converter import DocumentConverter
from transformers import AutoTokenizer

# Load document
doc = DocumentConverter().convert(source="path/to/document").document

# Basic chunking
chunker = HybridChunker()
chunks = list(chunker.chunk(dl_doc=doc))

# Advanced chunking with custom parameters
EMBED_MODEL_ID = "sentence-transformers/all-MiniLM-L6-v2"
tokenizer = AutoTokenizer.from_pretrained(EMBED_MODEL_ID)

chunker = HybridChunker(
    tokenizer=tokenizer,
    max_tokens=64,  # Customize token limit
    merge_peers=True,
)
chunks = list(chunker.chunk(dl_doc=doc))
```

#### Key Aspects to Test

When testing the hybrid chunker, verify:

1. **Chunk Size Boundaries**: Chunks should not exceed the specified token limit (check with `tokenizer.tokenize()`)
2. **Smart Chunking**: The chunker should stop before the token limit when needed to preserve semantic boundaries
3. **Peer Merging**: Undersized peer chunks should be properly merged when `merge_peers=True`
4. **Metadata Enrichment**: Serialized chunks should include proper metadata and context from the document structure
5. **Tokenization Awareness**: The chunks should respect tokenization boundaries to avoid cutting words or phrases inappropriately

#### Tokenizer Compatibility

Always ensure the chunker and embedding model use the same tokenizer. This can be achieved by:

```python
# Single-source both from the same model
EMBED_MODEL_ID = "sentence-transformers/all-MiniLM-L6-v2"
tokenizer = AutoTokenizer.from_pretrained(EMBED_MODEL_ID)
chunker = HybridChunker(tokenizer=tokenizer)
```

### Edge Cases to Test

When testing the hybrid chunker, pay special attention to these edge cases:

1. **Long Metadata**: Documents with very long headers/metadata that might consume most of the token budget
2. **Single-Item Chunks**: Ensure proper handling when a single document item exceeds the token limit
3. **Empty Chunks**: Check that empty or extremely small chunks are handled appropriately
4. **Consecutive Small Items**: Test with documents containing many consecutive small items to verify merge logic

### Automated Tests

The project includes automated tests for chunking in the test suite. Run them with:

```bash
pytest tests/chunking/
```

## Default Model Configuration

Note that the default embedding model for chunking uses `gpt-4o-mini` as configured in `wrangler.toml`. This should be verified when making changes to the chunking implementation.
