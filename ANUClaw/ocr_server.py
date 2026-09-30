import os
import io
import uuid
from fastapi import FastAPI, UploadFile, File
import uvicorn
from paddleocr import PaddleOCR

app = FastAPI()

# Initialize OCR model once
ocr = PaddleOCR(use_textline_orientation=True, lang='en')

@app.post("/ocr")
async def process_ocr(file: UploadFile = File(...)):
    contents = await file.read()
    
    # Save to temp file since PaddleOCR prefers file paths
    temp_filename = f"temp_{uuid.uuid4().hex}_{file.filename}"
    with open(temp_filename, "wb") as f:
        f.write(contents)
        
    try:
        result = ocr.ocr(temp_filename, cls=True)
        # result is a list of lines. Each line is [ [box_coords], (text, confidence) ]
        extracted_text = []
        if result and result[0]:
            for line in result[0]:
                extracted_text.append(line[1][0])
                
        return {"text": "\n".join(extracted_text)}
    except Exception as e:
        return {"error": str(e)}
    finally:
        if os.path.exists(temp_filename):
            os.remove(temp_filename)

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=4001)
