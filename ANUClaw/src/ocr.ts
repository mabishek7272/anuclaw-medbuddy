import * as fs from 'fs';
import FormData from 'form-data';
import axios from 'axios';
import { logger } from './logger';

/**
 * Sends an image or PDF to the Python PaddleOCR microservice for text extraction.
 */
export async function extractTextWithOcr(filePath: string): Promise<string | null> {
  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    
    const response = await axios.post('http://127.0.0.1:4001/ocr', form, {
      headers: {
        ...form.getHeaders()
      },
      timeout: 60000 // OCR can take a minute on CPU
    });
    
    if (response.data && response.data.text) {
      return response.data.text;
    } else if (response.data && response.data.error) {
      logger.error('OCR returned an error:', response.data.error);
    }
  } catch (err: any) {
    logger.error(`Failed to contact OCR microservice at :4001 (is it running?): ${err.message}`);
  }
  return null;
}
