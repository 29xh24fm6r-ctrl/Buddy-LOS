export type LifecycleCertificationEnvironment = Record<string, string | undefined>;

export interface LifecycleCertificationEvidence {
  scope?: {
    organizationId?: string;
    internalOnly?: boolean;
  };
}

export interface LifecycleExecutionBoundaryInput {
  env: LifecycleCertificationEnvironment;
  evidence?: LifecycleCertificationEvidence;
  organizationId: string;
}

export interface LifecycleExecutionBoundaryResult {
  safe: boolean;
  reasons: string[];
}

export function evaluateExecutionBoundary(
  input: LifecycleExecutionBoundaryInput,
): LifecycleExecutionBoundaryResult;
