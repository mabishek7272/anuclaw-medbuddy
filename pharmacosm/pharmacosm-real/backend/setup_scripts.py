"""
Backend script setup — creates symlinks/copies to science skill scripts.
Run this once to set up the scripts/ directory.
"""

import shutil
import os
from pathlib import Path

BASE = Path(__file__).parent

# Science skill directories
SKILLS_BASE = Path.home() / ".gemini" / "config" / "plugins" / "science" / "skills"
CHEMBL_SCRIPTS = SKILLS_BASE / "chembl_database" / "scripts"
CLINVAR_SCRIPTS = SKILLS_BASE / "clinvar_database" / "scripts"
CT_SCRIPTS = SKILLS_BASE / "clinical_trials_database" / "scripts"
ALPHAFOLD_SCRIPTS = SKILLS_BASE / "alphafold_database_fetch_and_analyze" / "scripts"
HPA_SCRIPTS = SKILLS_BASE / "human_protein_atlas_database" / "scripts"

scripts_dir = BASE / "scripts"
af_scripts_dir = scripts_dir / "alphafold"
scripts_dir.mkdir(exist_ok=True)
af_scripts_dir.mkdir(exist_ok=True)

copies = [
    (CHEMBL_SCRIPTS / "chembl_api.py", scripts_dir / "chembl_api.py"),
    (CLINVAR_SCRIPTS / "clinvar_api.py", scripts_dir / "clinvar_api.py"),
    (CT_SCRIPTS / "clinical_trials_api.py", scripts_dir / "clinical_trials_api.py"),
    (HPA_SCRIPTS / "hpa_cli.py", scripts_dir / "hpa_cli.py"),
    (ALPHAFOLD_SCRIPTS / "fetch_structure.py", af_scripts_dir / "fetch_structure.py"),
    (ALPHAFOLD_SCRIPTS / "analyze_plddt.py", af_scripts_dir / "analyze_plddt.py"),
    (ALPHAFOLD_SCRIPTS / "analyze_pae.py", af_scripts_dir / "analyze_pae.py"),
]

# Also copy pyproject.toml files for uv environment
pyproject_copies = [
    (CHEMBL_SCRIPTS.parent / "pyproject.toml", scripts_dir / "chembl_pyproject.toml"),
    (CT_SCRIPTS.parent / "pyproject.toml", scripts_dir / "ct_pyproject.toml"),
]

success = []
missing = []

for src, dst in copies:
    if src.exists():
        shutil.copy2(src, dst)
        success.append(str(dst.name))
    else:
        missing.append(str(src))

print(f"[OK] Copied {len(success)} scripts: {success}")
if missing:
    print(f"[WARN] Missing sources: {missing}")

# Copy uv pyproject.toml files needed for dependencies
for src, dst in pyproject_copies:
    if src.exists():
        shutil.copy2(src, dst)
        print(f"[OK] Copied pyproject: {dst.name}")

# Copy scienceskillscommon package to project root
common_src = SKILLS_BASE / "scienceskillscommon"
common_dst = BASE.parent / "scienceskillscommon"
if common_src.exists():
    if common_dst.exists():
        shutil.rmtree(common_dst)
    shutil.copytree(common_src, common_dst)
    print(f"[OK] Copied scienceskillscommon to {common_dst}")
    
    # Make http_client.py Windows compatible
    client_py = common_dst / "http_client.py"
    if client_py.exists():
        content = client_py.read_text(encoding="utf-8")
        
        # Replace fcntl import
        content = content.replace("import fcntl", """try:
    import fcntl
except ImportError:
    fcntl = None

try:
    import msvcrt
except ImportError:
    msvcrt = None

import tempfile""")
        
        # Replace lock file path
        content = content.replace('self._lock_file = f"/tmp/{PROJECT_NAME}-{hostname}.lock"', 
                                  'self._lock_file = os.path.join(tempfile.gettempdir(), f"{PROJECT_NAME}-{hostname}.lock")')
        
        # Replace wait method locking logic
        old_lock = """    with open(self._lock_file, "a+") as f:
      fcntl.flock(f, fcntl.LOCK_EX)
      try:
        f.seek(0)
        content = f.read().strip()
        last_ts = float(content) if content else 0.0
        now = time.monotonic()
        gap = self._min_interval - (now - last_ts)
        delay = max(gap, min_sleep)
        if delay > 0:
          time.sleep(delay)
        f.seek(0)
        f.truncate()
        f.write(str(time.monotonic()))
        f.flush()
      finally:
        fcntl.flock(f, fcntl.LOCK_UN)"""

        new_lock = """    with open(self._lock_file, "a+") as f:
      if fcntl:
        fcntl.flock(f, fcntl.LOCK_EX)
      elif msvcrt:
        try:
          f.seek(0)
          msvcrt.locking(f.fileno(), msvcrt.LK_LOCK, 1)
        except IOError:
          pass
      try:
        f.seek(0)
        content = f.read().strip()
        last_ts = float(content) if content else 0.0
        now = time.monotonic()
        gap = self._min_interval - (now - last_ts)
        delay = max(gap, min_sleep)
        if delay > 0:
          time.sleep(delay)
        f.seek(0)
        f.truncate()
        f.write(str(time.monotonic()))
        f.flush()
      finally:
        if fcntl:
          fcntl.flock(f, fcntl.LOCK_UN)
        elif msvcrt:
          try:
            f.seek(0)
            msvcrt.locking(f.fileno(), msvcrt.LK_UNLCK, 1)
          except IOError:
            pass"""
            
        content = content.replace(old_lock, new_lock)
        client_py.write_text(content, encoding="utf-8")
        print("[OK] Patched http_client.py for Windows compatibility")
        
    # Bump version in pyproject.toml to force uv to rebuild and reinstall
    pyproject_file = common_dst / "pyproject.toml"
    if pyproject_file.exists():
        pyproject_content = pyproject_file.read_text(encoding="utf-8")
        pyproject_content = pyproject_content.replace('version = "0.1.0"', 'version = "0.1.1"')
        pyproject_file.write_text(pyproject_content, encoding="utf-8")
        print("[OK] Bumped scienceskillscommon version to 0.1.1")
else:
    print(f"[WARN] scienceskillscommon not found at {common_src}")
