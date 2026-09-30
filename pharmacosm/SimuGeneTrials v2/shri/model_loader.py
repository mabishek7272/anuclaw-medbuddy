# model_loader.py
import os
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

# Path to local model directory (adjust if needed)
LOCAL_MODEL_DIR = os.path.join(os.path.dirname(__file__), "model")

# Globals cached after first load
_tokenizer = None
_model = None
_device = "cuda" if torch.cuda.is_available() else "cpu"

def _exists_local_model():
    # minimal check for expected files
    needed = ["config.json", "model.safetensors"]
    return all(os.path.isfile(os.path.join(LOCAL_MODEL_DIR, p)) for p in needed)

def get_model_and_tokenizer():
    """
    Lazy-load the tokenizer and model from LOCAL_MODEL_DIR.
    Returns (model, tokenizer, device). Raises RuntimeError on failure.
    """
    global _tokenizer, _model, _device
    if _tokenizer is not None and _model is not None:
        return _model, _tokenizer, _device

    if not _exists_local_model():
        raise RuntimeError(f"Local model files not found in: {LOCAL_MODEL_DIR}")

    try:
        # Use local files; trust that tokenizer config is present
        _tokenizer = AutoTokenizer.from_pretrained(LOCAL_MODEL_DIR, local_files_only=True, use_fast=True)
        # Load model with safetensors - device_map auto if accelerate installed else cpu/cuda
        _model = AutoModelForCausalLM.from_pretrained(LOCAL_MODEL_DIR, local_files_only=True, torch_dtype=torch.float16 if _device=="cuda" else None)
        _model.to(_device)
    except Exception as e:
        # Cleanup partials and surface a meaningful error
        _tokenizer, _model = None, None
        raise RuntimeError(f"Failed to load model/tokenizer from {LOCAL_MODEL_DIR}: {e}") from e

    return _model, _tokenizer, _device
