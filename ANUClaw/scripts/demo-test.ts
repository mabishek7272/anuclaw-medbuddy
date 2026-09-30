import { runAgent } from '../src/container-runner';
import * as fs from 'fs';
import * as path from 'path';
import { getDb, ensureDbReady } from '../src/db/connection';

async function testDemo() {
  console.log('--- Initializing database and directories ---');
  await ensureDbReady(); // ensures DB tables exist
  
  try {
    const mockDocDir = 'c:/Users/acer/Downloads/AnuCLAW/test_doc';
    const vcfPath = path.join(mockDocDir, 'variants.vcf');
    const clinicalRecordPath = path.join(mockDocDir, 'clinical_patient_record.txt');

    if (!fs.existsSync(vcfPath) || !fs.existsSync(clinicalRecordPath)) {
      console.error(`Error: Mock documents not found in ${mockDocDir}`);
      process.exit(1);
    }

    const vcfContent = fs.readFileSync(vcfPath, 'utf8');
    const clinicalContent = fs.readFileSync(clinicalRecordPath, 'utf8');

    console.log('\n================================================================');
    console.log('DEMO TEST 1: Genomics Analysis (using VCF and ClinVar database)');
    console.log('================================================================');
    
    const genomicsPrompt = `
You are the Genomics specialist. 
Analyze the following mock VCF variants content:
${vcfContent}

Task:
1. Identify the variants in the VCF (coordinates, alleles, rsIDs).
2. Report ClinVar clinical significance and gnomAD frequencies for rs11571833 and rs80357715.
3. Suggest pharmacogenomic implications if relevant.
4. Output a summary table. Also save a structured results file "variants_analysis_report.txt" containing the detailed findings in your response.
`;

    try {
      const result1 = await runAgent({
        groupId: 'demo-genomics-test-group',
        prompt: genomicsPrompt,
      });

      console.log('\n--- LLM Agent Output Text ---');
      console.log(result1.text);
      console.log('\n--- Generated Artifacts ---');
      console.log(result1.artifacts);
    } catch (err: any) {
      console.error('Genomics test failed:', err.message);
    }

    console.log('\n================================================================');
    console.log('DEMO TEST 2: Clinical Decision Support & EHR Registry');
    console.log('================================================================');
    
    const clinicalPrompt = `
You are the Clinical specialist.
Review the following patient discharge summary:
${clinicalContent}

Task:
1. Extract patient details (demographics, diagnoses, medications, genetic risk).
2. Provide a simplified plain-language explanation of their BRCA2 genetic risk and their CYP2D6 metabolizer status.
3. Suggest a 30-day care plan including blood pressure and HbA1c monitoring.
4. Generate a patient brief document "patient_care_brief.txt" inside your response.
`;

    try {
      const result2 = await runAgent({
        groupId: 'demo-clinical-test-group',
        prompt: clinicalPrompt,
      });

      console.log('\n--- LLM Agent Output Text ---');
      console.log(result2.text);
      console.log('\n--- Generated Artifacts ---');
      console.log(result2.artifacts);
    } catch (err: any) {
      console.error('Clinical test failed:', err.message);
    }

    console.log('\n--- Demo Test Completed successfully! ---');
  } finally {
    console.log('--- Closing database connection pool ---');
    const pool = getDb();
    await pool.end();
  }
}

testDemo().catch(console.error);
