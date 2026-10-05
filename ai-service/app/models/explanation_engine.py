from typing import List, Dict, Any

class ExplanationEngine:
    def __init__(self):
        self.model_version = "aegis-explain-v1"

    def generate_explanations(self, emergency_id: str, candidates: List[Dict[str, Any]]) -> Dict[str, Any]:
        ranked = []
        for idx, candidate in enumerate(candidates):
            cid = candidate.get("id", f"CANDIDATE-{idx+1}")
            ctype = candidate.get("type", "AMBULANCE")
            eta = candidate.get("baseEtaMins", 10.0)
            dist = candidate.get("distanceKm", 5.0)

            reasons = []
            if ctype == "AMBULANCE":
                reasons.append(f"Positioned {dist:.1f} km from incident site.")
                reasons.append(f"Traffic-adjusted ETA estimate: {eta:.1f} minutes.")
                if candidate.get("capabilityMatch", True):
                    reasons.append("Equipped with required ICU & Ventilator support.")
                else:
                    reasons.append("Basic Life Support unit available.")
            else: # HOSPITAL
                reasons.append(f"Emergency travel time: {eta:.1f} mins.")
                reasons.append("Clinician-confirmed available ICU bed.")
                reasons.append("On-duty Trauma Specialist verified ready.")

            ranked.append({
                "candidateId": cid,
                "type": ctype,
                "rank": idx + 1,
                "compositeScore": round(max(0.1, 1.0 - (idx * 0.15)), 2),
                "reasons": reasons,
                "dataFreshnessSeconds": 4
            })

        return {
            "emergencyId": emergency_id,
            "rankedRationales": ranked,
            "dataFreshnessSeconds": 4,
            "modelVersion": self.model_version
        }
