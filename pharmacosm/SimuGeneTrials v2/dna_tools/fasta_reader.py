from Bio import SeqIO

def load_fasta(path: str):
    """
    Load sequences from a FASTA file and return list of (id, sequence).
    """
    records = []
    for record in SeqIO.parse(path, "fasta"):
        records.append((record.id, str(record.seq)))
    return records

if __name__ == "__main__":
    # Quick test
    fasta_file = "../example.fasta"  # adjust path if needed
    seqs = load_fasta(fasta_file)
    for seq_id, seq in seqs:
        print(seq_id, len(seq))
