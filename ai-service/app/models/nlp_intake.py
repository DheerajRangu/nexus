import re
from typing import Dict, Any, Tuple

# Notes are untrusted. Embedded instructions are stripped, never executed.
_INJECTION_LINE = re.compile(
    r"(ignore\s+(all\s+)?(previous\s+)?instructions|"
    r"disregard\s+(all\s+)?(previous\s+)?|"
    r"system\s*:|"
    r"you\s+are\s+now|"
    r"set\s+chiefcomplaint|"
    r"set\s+triage|"
    r"execute\s+|sudo\s+|rm\s+-rf|"
    r"<\s*/?\s*script|"
    r"os\.system|subprocess|eval\s*\()",
    re.IGNORECASE,
)


class NLPIntakeParser:
    def __init__(self):
        self.complaint_keywords = {
            "CARDIAC_ARREST": ["cardiac", "chest pain", "heart attack", "pulse", "cardio", "collapse"],
            "TRAUMA": ["trauma", "accident", "bleeding", "fracture", "crash", "fall", "injury"],
            "STROKE": ["stroke", "paralysis", "slurred speech", "numbness", "facial drooping"],
            "RESPIRATORY": ["respiratory", "breath", "asthma", "choking", "gasping", "suffocation"],
            "OBSTETRIC": ["pregnancy", "labor", "delivery", "maternity", "contractions"],
        }

    def _sanitize(self, notes: str) -> Tuple[str, bool]:
        injection_seen = False
        kept = []
        for line in notes.splitlines() if "\n" in notes else [notes]:
            # Also split on sentence-ish fragments containing injection directives
            parts = re.split(r"(?<=[.!?])\s+", line)
            for part in parts:
                if _INJECTION_LINE.search(part):
                    injection_seen = True
                    continue
                kept.append(part)
        return " ".join(kept).strip(), injection_seen

    def parse_notes(self, notes: str, language: str = "en") -> Dict[str, Any]:
        clean, injection_seen = self._sanitize(notes or "")
        text = clean.lower()

        chief_complaint = "GENERAL_EMERGENCY"
        matched_category = None
        for category, keywords in self.complaint_keywords.items():
            if any(kw in text for kw in keywords):
                chief_complaint = category
                matched_category = category
                break

        priority = "P3_STANDARD"
        if matched_category in ["CARDIAC_ARREST", "STROKE"] or "unconscious" in text or "severe" in text:
            priority = "P1_CRITICAL"
        elif matched_category in ["TRAUMA", "RESPIRATORY"] or "moderate" in text:
            priority = "P2_URGENT"

        equipment = ["BASIC_LIFE_SUPPORT"]
        if priority == "P1_CRITICAL":
            equipment.extend(["DEFIBRILLATOR", "ADVANCED_AIRWAY", "OXYGEN"])
        elif priority == "P2_URGENT":
            equipment.extend(["OXYGEN", "STRETCHER"])

        age_match = re.search(r"\b(\d{1,3})\s*(?:years|yo|y/o|yrs)\b", text)
        patient_age = int(age_match.group(1)) if age_match else None

        patient_gender = None
        if re.search(r"\b(male|man|boy)\b", text):
            patient_gender = "MALE"
        elif re.search(r"\b(female|woman|girl)\b", text):
            patient_gender = "FEMALE"

        return {
            "chiefComplaint": chief_complaint,
            "triagePriority": priority,
            "requiredEquipment": equipment,
            "patientAge": patient_age,
            "patientGender": patient_gender,
            "confidenceScore": 0.92 if matched_category and not injection_seen else 0.55,
            "modelVersion": "aegis-nlp-intake-v1",
            "humanConfirmationRequired": True,
            "injectionAttemptDetected": injection_seen,
            "actionTaken": "NONE",
        }
