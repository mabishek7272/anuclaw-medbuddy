# ANUClaw Document Processor

Read, write, edit, and convert clinical and research documents in PDF, DOCX, Markdown, plain text, and CSV formats. Extract structured data from unstructured documents, generate reports, and produce annotated output files.

## When to Use
- Read a PDF, DOCX, MD, TXT, or CSV file and extract content
- Write or edit a clinical report as PDF or DOCX
- Convert between document formats
- Parse structured tables from documents into dataframes
- Generate formatted patient reports or research summaries

---

## PDF Processing

```python
# pip install pymupdf pdfplumber reportlab
import fitz  # PyMuPDF
import pdfplumber
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib import colors
from pathlib import Path


def read_pdf(path: str) -> dict:
    """Extract text and metadata from a PDF file."""
    doc = fitz.open(path)
    pages = []
    for i, page in enumerate(doc):
        pages.append({"page": i + 1, "text": page.get_text()})
    metadata = doc.metadata
    doc.close()
    return {"path": path, "page_count": len(pages), "metadata": metadata, "pages": pages,
            "full_text": "\n\n".join(p["text"] for p in pages)}


def extract_pdf_tables(path: str) -> list:
    """Extract tables from a PDF as lists of rows."""
    tables_all = []
    with pdfplumber.open(path) as pdf:
        for i, page in enumerate(pdf.pages):
            for table in page.extract_tables():
                tables_all.append({"page": i + 1, "rows": table})
    return tables_all


def write_pdf_report(output_path: str, title: str, sections: list) -> str:
    """
    Write a structured PDF report.
    sections: [{"heading": str, "body": str}, ...]
    Returns the output path.
    """
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(output_path, pagesize=A4,
                            leftMargin=2*cm, rightMargin=2*cm,
                            topMargin=2.5*cm, bottomMargin=2*cm)
    styles = getSampleStyleSheet()
    heading_style = ParagraphStyle("Heading", parent=styles["Heading1"], spaceAfter=6)
    body_style = ParagraphStyle("Body", parent=styles["Normal"], spaceAfter=10, leading=14)

    story = [Paragraph(title, styles["Title"]), Spacer(1, 0.5*cm)]
    for section in sections:
        if section.get("heading"):
            story.append(Paragraph(section["heading"], heading_style))
        if section.get("body"):
            for para in section["body"].split("\n\n"):
                story.append(Paragraph(para.replace("\n", "<br/>"), body_style))
        if section.get("table"):
            table = Table(section["table"])
            table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2C3E50")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F5F5")]),
            ]))
            story.append(table)
        story.append(Spacer(1, 0.3*cm))

    doc.build(story)
    return output_path
```

---

## DOCX Processing

```python
# pip install python-docx
from docx import Document
from docx.shared import Pt, RGBColor, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH


def read_docx(path: str) -> dict:
    """Extract text from a DOCX file."""
    doc = Document(path)
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    tables = []
    for table in doc.tables:
        rows = [[cell.text for cell in row.cells] for row in table.rows]
        tables.append(rows)
    return {"path": path, "paragraphs": paragraphs, "tables": tables,
            "full_text": "\n".join(paragraphs)}


def write_docx_report(output_path: str, title: str, sections: list) -> str:
    """
    Write a structured DOCX report.
    sections: [{"heading": str, "body": str, "table": [[row]]}]
    Returns the output path.
    """
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    doc = Document()

    # Title
    title_para = doc.add_heading(title, level=0)
    title_para.alignment = WD_ALIGN_PARAGRAPH.CENTER

    for section in sections:
        if section.get("heading"):
            doc.add_heading(section["heading"], level=1)
        if section.get("body"):
            for para_text in section["body"].split("\n\n"):
                p = doc.add_paragraph(para_text)
                p.paragraph_format.space_after = Pt(6)
        if section.get("table") and len(section["table"]) > 0:
            rows = section["table"]
            table = doc.add_table(rows=len(rows), cols=len(rows[0]))
            table.style = "Light Grid Accent 1"
            for i, row in enumerate(rows):
                for j, cell_text in enumerate(row):
                    table.cell(i, j).text = str(cell_text)

    doc.save(output_path)
    return output_path


def edit_docx_replace(path: str, find: str, replace: str, output_path: str = None) -> str:
    """Find and replace text in a DOCX file."""
    doc = Document(path)
    for para in doc.paragraphs:
        if find in para.text:
            for run in para.runs:
                if find in run.text:
                    run.text = run.text.replace(find, replace)
    out = output_path or path
    doc.save(out)
    return out
```

---

## Markdown & Text Processing

```python
def read_markdown(path: str) -> dict:
    """Read a Markdown file and extract sections by heading."""
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    sections = {}
    current_heading = "__preamble__"
    buffer = []
    for line in content.splitlines():
        if line.startswith("#"):
            sections[current_heading] = "\n".join(buffer).strip()
            current_heading = line.lstrip("#").strip()
            buffer = []
        else:
            buffer.append(line)
    sections[current_heading] = "\n".join(buffer).strip()

    return {"path": path, "full_text": content, "sections": sections}


def write_markdown(path: str, content: str) -> str:
    """Write content to a Markdown file."""
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    return path


def read_text(path: str) -> str:
    """Read a plain text file."""
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def write_text(path: str, content: str) -> str:
    """Write content to a plain text file."""
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    return path
```

---

## CSV Processing

```python
import csv
import io


def read_csv(path: str, delimiter: str = ",") -> dict:
    """Read a CSV file and return headers and rows."""
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f, delimiter=delimiter)
        rows = list(reader)
        headers = reader.fieldnames or []
    return {"path": path, "headers": headers, "rows": rows, "row_count": len(rows)}


def write_csv(path: str, rows: list, fieldnames: list = None) -> str:
    """Write a list of dicts to a CSV file."""
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        return path
    fields = fieldnames or list(rows[0].keys())
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    return path


def filter_csv(rows: list, column: str, value: str) -> list:
    """Filter CSV rows where column matches value."""
    return [r for r in rows if r.get(column) == value]


def csv_to_markdown_table(rows: list, headers: list = None) -> str:
    """Convert CSV rows to a Markdown table string."""
    if not rows:
        return ""
    cols = headers or list(rows[0].keys())
    lines = ["| " + " | ".join(cols) + " |",
             "| " + " | ".join(["---"] * len(cols)) + " |"]
    for row in rows:
        lines.append("| " + " | ".join(str(row.get(c, "")) for c in cols) + " |")
    return "\n".join(lines)
```

---

## Format Conversion

```python
def convert_document(input_path: str, output_path: str) -> str:
    """
    Convert between supported formats.
    Supported: PDF→TXT, DOCX→TXT, MD→TXT, CSV→MD
    For full-fidelity conversion (e.g., DOCX→PDF) use LibreOffice:
      subprocess.run(['libreoffice', '--headless', '--convert-to', 'pdf', input_path])
    """
    ext_in = Path(input_path).suffix.lower()
    ext_out = Path(output_path).suffix.lower()

    if ext_in == ".pdf":
        data = read_pdf(input_path)
        content = data["full_text"]
    elif ext_in == ".docx":
        data = read_docx(input_path)
        content = data["full_text"]
    elif ext_in in [".md", ".txt"]:
        content = read_text(input_path)
    elif ext_in == ".csv":
        data = read_csv(input_path)
        content = csv_to_markdown_table(data["rows"], data["headers"])
    else:
        raise ValueError(f"Unsupported input format: {ext_in}")

    if ext_out in [".txt", ".md"]:
        write_text(output_path, content)
    else:
        raise ValueError(f"Unsupported output format: {ext_out}")

    return output_path
```

## Output
Save generated documents to `/workspace/output/documents/`. PDFs go to `.../documents/pdf/`, DOCX to `.../documents/docx/`, CSVs to `.../documents/csv/`.
