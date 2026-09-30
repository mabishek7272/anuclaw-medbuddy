import uuid
from datetime import datetime
import random

class ElectronicHealthRecord:
    def __init__(self, patient_id):
        self.patient_id = patient_id
        self.record_id = str(uuid.uuid4())[:8]
        self.created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        self.data = self._generate_data()
        self.qkd_key = None
        self.is_encrypted = False

    def _generate_data(self):
        conditions = ["Hypertension", "Diabetes", "Allergies", "Arthritis"]
        medications = ["Metformin", "Lisinopril", "Ibuprofen", "Amoxicillin"]
        return {
            "name": f"Patient_{self.patient_id}",
            "age": random.randint(20, 80),
            "diagnosis": random.choice(conditions),
            "medication": random.choice(medications)
        }

    def encrypt_with_qkd(self, key):
        """Simulates encryption using a QKD-generated key."""
        self.qkd_key = key
        self.is_encrypted = True
        return f"Encrypted:{self.data}"

    def decrypt_with_qkd(self, key):
        """Simulates decryption with the same QKD key."""
        if self.qkd_key == key:
            self.is_encrypted = False
            return f"Decrypted:{self.data}"
        else:
            return "Decryption failed. Invalid key."