/**
 * VerificationProvider interface (SRS 2) — ID verification sits behind this
 * seam (AGENTS Backend). The shipped implementation is ManualReviewProvider.
 */
export interface VerificationSubmission {
  documentType: string;
  documentKey: string;
  renterId: string;
}

export interface VerificationProvider {
  submit(submission: VerificationSubmission): Promise<{ providerRef: string }>;
}

export class ManualReviewProvider implements VerificationProvider {
  async submit(submission: VerificationSubmission): Promise<{ providerRef: string }> {
    // Manual review: no external call; the admin reviews via the admin console.
    return { providerRef: `manual-${submission.renterId}` };
  }
}

export function createVerificationProvider(_opts: { nodeEnv: string }): VerificationProvider {
  // ManualReviewProvider is the only shipped implementation (FR-ID-04).
  return new ManualReviewProvider();
}