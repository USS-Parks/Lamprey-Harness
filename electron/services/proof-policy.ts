export interface ProofPolicySummary {
  mutatingTurnsRequireFreshProof: boolean
  skippedCommandsAreGaps: boolean
  receiptsAreAppendOnly: boolean
  reviewerRequiresEvidencePacket: boolean
  waiversRequireReason: boolean
}

export function getProofPolicySummary(): ProofPolicySummary {
  return {
    mutatingTurnsRequireFreshProof: true,
    skippedCommandsAreGaps: true,
    receiptsAreAppendOnly: true,
    reviewerRequiresEvidencePacket: true,
    waiversRequireReason: true
  }
}
