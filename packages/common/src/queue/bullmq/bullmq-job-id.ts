const BULLMQ_JOB_ID_FORBIDDEN = /[:]/g;

export function toBullmqJobId(jobId: string | undefined): string | undefined {
  if (!jobId) return undefined;
  return jobId.replaceAll(BULLMQ_JOB_ID_FORBIDDEN, "_");
}
