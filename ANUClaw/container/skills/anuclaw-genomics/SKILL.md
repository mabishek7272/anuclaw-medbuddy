# ANUClaw Genomics Suite

Comprehensive genomics and bioinformatics workflows. Use for sequence analysis, variant calling, differential expression, single-cell, spatial omics, and epigenomics.

## When to Use
- User asks about DNA/RNA sequences, BLAST, alignment, variants, SNPs, gene expression
- Any bioinformatics analysis pipeline
- Single-cell or spatial transcriptomics
- ATAC-seq, ChIP-seq, Hi-C, CRISPR screens

## Capabilities

### Sequence Analysis
```bash
# BLAST search
blastn -query input.fa -db nt -remote -out results.txt -outfmt 6
blastp -query protein.fa -db nr -remote -out results.txt

# Read alignment
bwa mem reference.fa reads_R1.fastq reads_R2.fastq | samtools sort -o aligned.bam
samtools index aligned.bam

# Long-read alignment
minimap2 -ax map-ont reference.fa reads.fastq | samtools sort -o aligned.bam
```

### Variant Calling
```bash
# GATK HaplotypeCaller
gatk HaplotypeCaller -R reference.fa -I aligned.bam -O variants.vcf

# BCFtools variant calling
bcftools mpileup -f reference.fa aligned.bam | bcftools call -mv -o variants.vcf

# VCF annotation and filtering
bcftools filter -i 'QUAL>20 && DP>10' variants.vcf > filtered.vcf
```

### Quality Control
```bash
fastqc reads.fastq -o qc_output/
multiqc qc_output/ -o multiqc_report/
```

### Differential Expression (Python)
```python
from pydeseq2.dds import DeseqDataSet
from pydeseq2.ds import DeseqStats
import pandas as pd

counts = pd.read_csv('counts.csv', index_col=0)
metadata = pd.read_csv('metadata.csv', index_col=0)
dds = DeseqDataSet(counts=counts, metadata=metadata, design_factors='condition')
dds.deseq2()
stat_res = DeseqStats(dds, contrast=['condition', 'treatment', 'control'])
stat_res.summary()
results = stat_res.results_df
results.to_csv('/workspace/output/deseq2_results.csv')
```

### Single-Cell Analysis (Python)
```python
import scanpy as sc

adata = sc.read_10x_mtx('path/to/10x/')
sc.pp.filter_cells(adata, min_genes=200)
sc.pp.filter_genes(adata, min_cells=3)
sc.pp.normalize_total(adata, target_sum=1e4)
sc.pp.log1p(adata)
sc.pp.highly_variable_genes(adata)
sc.pp.pca(adata)
sc.pp.neighbors(adata)
sc.tl.umap(adata)
sc.tl.leiden(adata)
sc.pl.umap(adata, color='leiden', save='_clusters.png')
```

### Spatial Transcriptomics (Python)
```python
import scanpy as sc
import squidpy as sq

adata = sc.read_visium('path/to/visium/')
sq.pp.calculate_nhood_enrichment(adata, cluster_key='leiden')
sq.pl.nhood_enrichment(adata, cluster_key='leiden', save='/workspace/output/nhood.png')
```

## Key Databases
- NCBI / BLAST: sequence similarity, GenBank
- Ensembl: gene annotation, regulatory features
- gnomAD: population variant frequencies
- ClinVar: clinical variant classifications
- dbSNP: SNP database

## Output
Always save outputs to `/workspace/output/`. Images, tables, and reports go there.
