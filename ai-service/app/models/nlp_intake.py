import re
from typing import Dict, Any

class NLPIntakeParser:
    def __init__(self):
        self.complaint_keywords = {
            "CARDIAC_ARREST": ["cardiac", "chest pain", "heart attack", "pulse", "cardio", "collapse"],
            "TRAUMA": ["trauma", "accident", "bleeding", "fracture", "crash", "fall", "injury"],
            "STROKE": ["stroke", "paralysis", "slurred speech", "numbness", "facial drooping"],
            "RESPIRATORY": ["respiratory", "breath", "asthma", "choking", "gasping", "suffocation"],
            "OBSTETRIC": ["pregnancy", "labor", "delivery", "maternity", "contractions"]
        }

    def parse_notes(self, notes: str, language: str = "en") -> Dict[str, Any]:
        text = notes.lower()
        
        # 1. Chief Complaint Matching
        chief_complaint = "GENERAL_EMERGENCY"
        matched_category = None
        for category, keywords in self.complaint_keywords.items():
            if any(kw in text for kw in keywords):
                chief_complaint = category
                matched_category = category
                break

        # 2. Triage Priority Rule
        priority = "P3_STANDARD"
        if matched_category in ["CARDIAC_ARREST", "STROKE"] or "unconscious" in text or "severe" in text:
            priority = "P1_CRITICAL"
        elif matched_category in ["TRAUMA", "RESPIRATORY"] or "moderate" in text:
            priority = "P2_URGENT"

        # 3. Equipment Recommendation
        equipment = ["BASIC_LIFE_SUPPORT"]
        if priority == "P1_CRITICAL":
            equipment.extend(["DEFIBRILLATOR", "ADVANCED_AIRWAY", "OXYGEN"])
        elif priority == "P2_URGENT":
            equipment.extend(["OXYGEN", "STRETCHER"])

        # 4. Age & Gender Regex Extraction
        age_match = re.search(r'\b(\d{1,3})\s*(?:years|yo|y/o|yrs)\b', text)
        patient_age = int(age_match.group(1)) if age_match else None

        patient_gender = None
        if re.search(r'\b(male|man|boy)\b', text):
            patient_gender = "MALE"
        elif re.search(r'\b(female|woman|girl)\b', text):
            patient_gender = "FEMALE"

        return {
            "chiefComplaint": chief_complaint,
            "triagePriority": priority,
            "requiredEquipment": equipment,
            "patientAge": patient_age,
            "patientGender": patient_gender,
            "confidenceScore": 0.92 if matched_category else 0.65,
            "modelVersion": "aegis-nlp-intake-v1",
            "humanConfirmationRequired": True
        }
