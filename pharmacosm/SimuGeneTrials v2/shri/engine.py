# engine.py
import re
import time
import os

# Import the lazy loader — safe at import time
from model_loader import get_model_and_tokenizer

# ---------- Rule based safety net ----------
def rule_based_check(vitals: dict):
    """
    Return a string note (override) if vitals are critical, else None.
    """
    hr = vitals.get("HR")
    spo2 = vitals.get("SpO2")
    if hr is not None and spo2 is not None:
        try:
            if float(hr) > 130 and float(spo2) < 90:
                return "CRITICAL | Seek emergency care immediately | HR>130, SpO2<90"
        except Exception:
            pass
    return None

# ---------- Text sanitize helpers ----------
def sanitize_and_trim(text: str, max_sentences: int = 1):
    if not text:
        return ""
    text = text.strip()
    # Remove repeated runs of the same phrase (simple)
    text = re.sub(r'(\b\S+\b)(?:\s+\1){3,}', r'\1', text)
    sentences = re.split(r'(?<=[.!?])\s+', text)
    return " ".join(sentences[:max_sentences]).strip()

# ---------- Safe generation wrapper ----------
# We intentionally do NOT load the model at import time.
# The first call to safe_generate will load it (lazy).
_model = None
_tokenizer = None
_device = None

def _ensure_model_loaded():
    global _model, _tokenizer, _device
    if _model is not None and _tokenizer is not None:
        return
    _model, _tokenizer, _device = get_model_and_tokenizer()

def _mock_response_for_prompt(prompt: str):
    """Simple canned response for UI/dev when real model unavailable."""
    return "ADVISORY | Monitor closely and escalate if worsening | SpO2 low."

def safe_generate(prompt: str,
                  prefer_beam: bool = True,
                  beams: int = 3,
                  max_new_tokens: int = 60):
    """
    Returns a short sanitized string. Raises RuntimeError if model load fails,
    unless environment variable SHRI_MOCK_MODE=1 is set (dev mode).
    """
    # Quick dev-mode: return canned text without loading model
    if os.getenv("SHRI_MOCK_MODE", "0") == "1":
        return _mock_response_for_prompt(prompt)

    # Attempt to ensure model is loaded (may raise RuntimeError with clear msg)
    _ensure_model_loaded()

    # Build generation kwargs
    gen_kwargs = {
        "max_new_tokens": max_new_tokens,
        "no_repeat_ngram_size": 4,
        "repetition_penalty": 1.3,
        "eos_token_id": _tokenizer.eos_token_id,
        "pad_token_id": _tokenizer.eos_token_id,
    }
    if prefer_beam:
        gen_kwargs.update({"num_beams": beams, "do_sample": False, "early_stopping": True})
    else:
        gen_kwargs.update({"do_sample": True, "temperature": 0.25, "top_p": 0.92})

    inputs = _tokenizer(prompt, return_tensors="pt").to(_device)

    # deterministic seed logging for audit (optional)
    seed = int(time.time() * 1000) % (2**31)
    try:
        import torch
        torch.manual_seed(seed)
    except Exception:
        pass

    # Use torch.inference_mode() and call generate directly (no invalid context managers)
    try:
        import torch
        with torch.inference_mode():
            out = _model.generate(**inputs, **gen_kwargs)
    except Exception as e:
        # Re-wrap with clear message so dev/debug is faster
        raise RuntimeError(f"Model generation failed: {e}") from e

    raw = _tokenizer.decode(out[0], skip_special_tokens=True)
    text = sanitize_and_trim(raw, max_sentences=1)
    return text

# Export list -- safe to import
__all__ = ["rule_based_check", "safe_generate", "sanitize_and_trim"]