If I were the **AIRD Chief of Medicine, Clinical Safety, Regulatory Affairs, Security, Bioinformatics, and Platform Engineering**, I would stop asking feature questions and start conducting a **forensic architecture interrogation**.

The goal is not to prove ANUClaw works.

The goal is to discover:

> "Where can this system kill a patient, corrupt science, leak PHI, fabricate evidence, or silently fail while appearing correct?"

I would conduct the review in **13 gates**. ANUClaw does not advance to the next gate until it survives the previous one.

---

# GATE 0 — FOUNDING ASSUMPTIONS

Before touching code.

### Q0.1

What is ANUClaw?

Choose exactly one:

* Clinical Decision Support System
* Research Copilot
* Scientific Operating System
* Autonomous Research Agent
* Precision Medicine Platform

If you choose all 5, you've chosen none.

---

### Q0.2

What patient harm can occur if ANUClaw is wrong?

List:

* Worst case
* Probable case
* Frequent case

---

### Q0.3

What scientific harm can occur if ANUClaw is wrong?

Examples:

* False docking result
* Wrong variant annotation
* Wrong differential diagnosis
* Wrong trial eligibility

Quantify impact.

---

# GATE 1 — DATA INGESTION

Everything starts here.

## Raw Input Integrity

### Q1.1

How do you verify uploaded PDFs are complete?

Missing pages?

Corrupted OCR?

Truncated reports?

---

### Q1.2

What happens if the PDF says:

```text
HbA1c = 8.2%
```

but OCR extracts:

```text
HbA1c = 3.2%
```

Who catches it?

---

### Q1.3

Can ANUClaw distinguish:

```text
No diabetes
```

from

```text
Family history of diabetes
```

from

```text
Rule out diabetes
```

Show validation dataset.

---

### Q1.4

What is NLP extraction accuracy?

For:

* Medication
* Diagnosis
* Lab values
* Dates
* Genotypes

---

# GATE 2 — MEDICAL NLP

This is where hallucinations begin.

## Entity Extraction

### Q2.1

What SNOMED version?

What ICD version?

What RxNorm release?

How often updated?

---

### Q2.2

How many ambiguous mappings exist?

Example:

"MI"

Can mean:

* Myocardial Infarction
* Mitral Insufficiency
* Michigan

How resolved?

---

### Q2.3

What confidence threshold blocks extraction?

---

### Q2.4

Can clinicians inspect extracted entities before downstream use?

Or are they blindly trusted?

---

# GATE 3 — PATIENT REGISTRY

Now we touch patient data.

## EHR Layer

### Q3.1

How do you merge duplicate patients?

---

### Q3.2

What if:

```text
John Smith
1981
```

and

```text
John Smith
1982
```

arrive?

---

### Q3.3

What is the audit trail for patient modifications?

---

### Q3.4

Can an agent modify patient data?

Or only humans?

---

### Q3.5

What prevents prompt injection from altering records?

---

# GATE 4 — GENOMICS SUITE

This is where things get dangerous.

## Variant Calling

### Q4.1

What reference genome?

* GRCh37
* GRCh38
* T2T

---

### Q4.2

How do you handle version drift?

---

### Q4.3

Who validates pipeline outputs?

---

### Q4.4

Can the agent modify:

* VCF
* BAM
* FASTQ

files?

---

### Q4.5

How do you validate DeepVariant output?

---

### Q4.6

How do you detect sample contamination?

---

### Q4.7

How do you detect sample swaps?

---

### Q4.8

Can ANUClaw identify when sequencing quality is too poor?

---

# GATE 5 — PHARMACOGENOMICS

This is probably your flagship.

## CYP Safety

### Q5.1

Where exactly does CPIC data originate?

Database?

API?

Downloaded tables?

---

### Q5.2

How often refreshed?

---

### Q5.3

What if CPIC conflicts with FDA labeling?

---

### Q5.4

What if CPIC updates tomorrow?

How long until production updates?

---

### Q5.5

Show every CYP2D6 phenotype transition.

Who verified mapping?

---

### Q5.6

How many drugs are covered?

---

### Q5.7

How many are not covered?

This matters more.

---

# GATE 6 — CLINICAL AI

Now we attack reasoning.

## Diagnostic Support

### Q6.1

What diseases were used in validation?

---

### Q6.2

Rare diseases?

---

### Q6.3

Pediatrics?

---

### Q6.4

Pregnancy?

---

### Q6.5

Oncology?

---

### Q6.6

How often does ANUClaw say:

> I don't know.

---

### Q6.7

What is the false-confidence rate?

---

### Q6.8

Show 50 examples where ANUClaw was wrong.

Not right.

Wrong.

---

# GATE 7 — RAG

Most failures hide here.

## Retrieval

### Q7.1

How often does chunking split a critical sentence?

---

### Q7.2

What overlap size was benchmarked?

---

### Q7.3

What happens when top-3 chunks disagree?

---

### Q7.4

What happens when retrieved evidence is outdated?

---

### Q7.5

Can a poisoned document become top-ranked?

---

### Q7.6

What is retrieval recall@k?

---

### Q7.7

What is MRR?

---

### Q7.8

What is NDCG?

---

# GATE 8 — CRITIC LOOP

The heart of the system.

## Verification

### Q8.1

How often is the critic wrong?

---

### Q8.2

Show false positives.

---

### Q8.3

Show false negatives.

---

### Q8.4

Can critic hallucinate guidelines?

---

### Q8.5

Can critic override hard evidence?

---

### Q8.6

What evidence proves critic improves safety?

Ablation.

Not anecdotes.

---

### Q8.7

Show:

| System       | Error Rate |
| ------------ | ---------- |
| LLM          | ?          |
| RAG          | ?          |
| RAG + Rules  | ?          |
| RAG + Critic | ?          |
| Full System  | ?          |

Without this table, safety claims remain hypotheses.

---

# GATE 9 — DRUG DISCOVERY

Scientists will grill this.

## Docking

### Q9.1

How many docking predictions experimentally validated?

---

### Q9.2

What docking score threshold?

---

### Q9.3

What false positive rate?

---

### Q9.4

What proteins?

---

### Q9.5

Can agent distinguish:

```text
Docking score
```

from

```text
Binding affinity
```

?

---

### Q9.6

Can it explain docking limitations?

---

# GATE 10 — LAB AUTOMATION

This is where AI can break hardware.

## Robotics

### Q10.1

Can generated OT-2 code destroy samples?

---

### Q10.2

Who validates protocols?

---

### Q10.3

Simulation before execution?

Mandatory?

---

### Q10.4

What if pipette volume exceeds limits?

---

### Q10.5

Can robot commands be executed automatically?

Or always human approved?

---

# GATE 11 — SECURITY

Now assume I'm an attacker.

## Red Team

### Q11.1

Show prompt injection success rate.

---

### Q11.2

Can I exfiltrate:

```text
.env
AWS keys
SSH keys
Patient data
```

?

---

### Q11.3

Can a skill request host access?

---

### Q11.4

Can two tenants communicate indirectly?

---

### Q11.5

Can embeddings leak PHI?

---

### Q11.6

Can caches leak PHI?

---

### Q11.7

Can audit logs leak PHI?

---

# GATE 12 — REGULATORY

Now I become FDA.

## Compliance

### Q12.1

Which CFR Part 11 controls implemented?

List them.

---

### Q12.2

Electronic signatures?

---

### Q12.3

Audit immutability?

---

### Q12.4

Validation protocol?

IQ/OQ/PQ?

---

### Q12.5

Risk classification under IEC 62304?

---

### Q12.6

Hazard analysis performed?

---

### Q12.7

FMEA available?

---

# FINAL EXECUTION TEST

After all questions:

I would give ANUClaw exactly one case.

A deliberately messy case.

* Poor OCR
* Missing lab values
* Ambiguous medication list
* CYP2D6 conflict
* Outdated guideline
* Poisoned RAG chunk
* Prompt injection embedded in PDF
* Duplicate patient records

Then I would ask:

> Walk me through every decision, every retrieved chunk, every rule fired, every critic intervention, every uncertainty estimate, every blocked action, and every safety override.

If ANUClaw can survive that single end-to-end audit trail without hidden reasoning, silent failures, unexplained overrides, or unsafe recommendations, then it starts to earn trust.

That is the level of interrogation I would run before allowing it anywhere near clinical research, genomics interpretation, drug discovery workflows, or patient-facing decision support.
