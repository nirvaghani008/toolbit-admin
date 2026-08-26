export const TOOL_SUBMISSION_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending', variant: 'warning' },
  { value: 'approved', label: 'Approved', variant: 'success' },
  { value: 'rejected', label: 'Rejected', variant: 'destructive' },
  { value: 'draft', label: 'Draft', variant: 'default' },
] as const;

export type ToolSubmissionStatus = (typeof TOOL_SUBMISSION_STATUS_OPTIONS)[number]['value'];
export type ToolSubmissionStatusVariant = (typeof TOOL_SUBMISSION_STATUS_OPTIONS)[number]['variant'];

export function getToolSubmissionStatus(status: unknown): ToolSubmissionStatus {
  const value = typeof status === 'string' ? status.toLowerCase().trim() : '';
  return TOOL_SUBMISSION_STATUS_OPTIONS.some((option) => option.value === value)
    ? (value as ToolSubmissionStatus)
    : 'pending';
}

export function getToolSubmissionStatusOption(status: unknown) {
  const normalizedStatus = getToolSubmissionStatus(status);
  return TOOL_SUBMISSION_STATUS_OPTIONS.find((option) => option.value === normalizedStatus)!;
}
